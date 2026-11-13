mod dds;
mod dds_raw;
mod interface;

pub use dds::DdsTransport;
use servo_wire::{ByteTransport, TransportError};
use std::io::{ErrorKind, Read, Write};
use std::time::Duration;

const READ_POLL: Duration = Duration::from_millis(1);

pub struct SerialTransport {
    port: Box<dyn serialport::SerialPort>,
}

impl SerialTransport {
    pub fn open(path: &str, baud: u32) -> Result<Self, String> {
        let port = serialport::new(path, baud)
            .timeout(READ_POLL)
            .open()
            .map_err(|error| format!("Could not open {path}: {error}"))?;

        Ok(Self { port })
    }
}

impl ByteTransport for SerialTransport {
    fn write_bytes(&mut self, bytes: &[u8]) -> Result<(), TransportError> {
        self.port.write_all(bytes).map_err(|_| TransportError::Disconnected)
    }

    fn read_bytes(&mut self, out: &mut [u8], timeout_micros: u64) -> Result<usize, TransportError> {
        self.port
            .set_timeout(Duration::from_micros(timeout_micros.max(1)))
            .map_err(|_| TransportError::Disconnected)?;

        match self.port.read(out) {
            Ok(count) => Ok(count),
            Err(error) if error.kind() == ErrorKind::TimedOut => Ok(0),
            Err(_) => Err(TransportError::Disconnected),
        }
    }
}
