use nix::fcntl::{fcntl, FcntlArg, OFlag};
use nix::poll::{poll, PollFd, PollFlags, PollTimeout};
use nix::pty::openpty;
use nix::sys::termios::{cfmakeraw, tcgetattr, tcsetattr, SetArg};
use nix::unistd::ttyname;
use servo_wire::{ByteTransport, TransportError};
use std::fs::File;
use std::io::{ErrorKind, Read, Write};
use std::os::fd::{AsFd, OwnedFd};

pub struct PtyPort {
    master: File,
    held_slave: OwnedFd,
    path: String,
}

impl PtyPort {
    pub fn open() -> nix::Result<Self> {
        let pair = openpty(None, None)?;
        let mut raw = tcgetattr(&pair.slave)?;

        cfmakeraw(&mut raw);
        tcsetattr(&pair.slave, SetArg::TCSANOW, &raw)?;
        fcntl(&pair.master, FcntlArg::F_SETFL(OFlag::O_NONBLOCK))?;

        let path = ttyname(&pair.slave)?.to_string_lossy().into_owned();

        Ok(Self {
            master: File::from(pair.master),
            held_slave: pair.slave,
            path,
        })
    }

    pub fn path(&self) -> &str {
        &self.path
    }

    pub fn is_held_open(&self) -> bool {
        self.held_slave.as_fd().try_clone_to_owned().is_ok()
    }
}

impl ByteTransport for PtyPort {
    fn write_bytes(&mut self, bytes: &[u8]) -> Result<(), TransportError> {
        let mut remaining = bytes;

        while !remaining.is_empty() {
            match self.master.write(remaining) {
                Ok(written) => remaining = &remaining[written..],
                Err(error) if error.kind() == ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_micros(50));
                }
                Err(_) => return Err(TransportError::Disconnected),
            }
        }

        Ok(())
    }

    fn read_bytes(&mut self, out: &mut [u8], timeout_micros: u64) -> Result<usize, TransportError> {
        let timeout_ms = u16::try_from(timeout_micros.div_ceil(1000)).unwrap_or(u16::MAX);
        let mut fds = [PollFd::new(self.master.as_fd(), PollFlags::POLLIN)];

        poll(&mut fds, PollTimeout::from(timeout_ms)).map_err(|_| TransportError::Disconnected)?;

        match self.master.read(out) {
            Ok(count) => Ok(count),
            Err(error) if error.kind() == ErrorKind::WouldBlock => Ok(0),
            Err(_) => Err(TransportError::Disconnected),
        }
    }
}

pub fn parent_has_gone(original_parent: nix::unistd::Pid) -> bool {
    nix::unistd::getppid() != original_parent
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::OpenOptionsExt;

    #[test]
    fn bytes_cross_the_pty_without_echo_or_line_editing() {
        let mut port = PtyPort::open().unwrap();
        let mut client = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .custom_flags(libc_no_ctty())
            .open(port.path())
            .unwrap();
        let payload = [0xFFu8, 0xFF, 0x01, 0x02, 0x01, 0xFB, 0x0D, 0x0A, 0x03];

        client.write_all(&payload).unwrap();

        let mut received = Vec::new();
        let mut buffer = [0u8; 32];

        while received.len() < payload.len() {
            let count = port.read_bytes(&mut buffer, 100_000).unwrap();

            assert!(count > 0);
            received.extend_from_slice(&buffer[..count]);
        }

        assert_eq!(received, payload);
        assert_eq!(port.read_bytes(&mut buffer, 2000).unwrap(), 0);
        assert!(port.is_held_open());
    }

    fn libc_no_ctty() -> i32 {
        OFlag::O_NOCTTY.bits()
    }
}
