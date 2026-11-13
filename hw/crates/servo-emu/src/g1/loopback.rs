use super::{G1Emulator, G1Options};
use servo_wire::{Clock, Sample, SystemClock, Topic, TopicTransport, TransportError};
use std::collections::VecDeque;
use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

pub const LOOPBACK: Ipv4Addr = Ipv4Addr::LOCALHOST;
const MAX_DATAGRAM: usize = 8192;
const IDLE_US: u64 = 500;

pub struct LoopbackLink {
    socket: UdpSocket,
}

fn bound() -> Result<UdpSocket, String> {
    UdpSocket::bind((LOOPBACK, 0)).map_err(|error| format!("Couldn't open a loopback socket: {error}"))
}

fn joined(socket: &UdpSocket, peer: Result<SocketAddr, std::io::Error>) -> Result<(), String> {
    let peer = peer.map_err(|error| error.to_string())?;

    socket.connect(peer).map_err(|error| error.to_string())
}

impl LoopbackLink {
    pub fn pair() -> Result<(LoopbackLink, LoopbackLink), String> {
        let near = bound()?;
        let far = bound()?;

        joined(&near, far.local_addr())?;
        joined(&far, near.local_addr())?;

        Ok((LoopbackLink { socket: near }, LoopbackLink { socket: far }))
    }

    pub fn local_addr(&self) -> Option<SocketAddr> {
        self.socket.local_addr().ok()
    }

    pub fn peer_addr(&self) -> Option<SocketAddr> {
        self.socket.peer_addr().ok()
    }

    fn wait_for(&self, timeout_micros: u64) -> std::io::Result<()> {
        if timeout_micros == 0 {
            return self.socket.set_nonblocking(true);
        }

        self.socket.set_nonblocking(false)?;
        self.socket
            .set_read_timeout(Some(Duration::from_micros(timeout_micros)))
    }
}

fn quiet(kind: ErrorKind) -> bool {
    matches!(
        kind,
        ErrorKind::WouldBlock | ErrorKind::TimedOut | ErrorKind::Interrupted
    )
}

impl TopicTransport for LoopbackLink {
    fn publish(&mut self, topic: Topic, payload: &[u8]) -> Result<(), TransportError> {
        let mut datagram = Vec::with_capacity(payload.len() + 1);

        datagram.push(topic.code());
        datagram.extend_from_slice(payload);

        match self.socket.send(&datagram) {
            Ok(_) => Ok(()),
            Err(error) if error.kind() == ErrorKind::ConnectionRefused => Ok(()),
            Err(_) => Err(TransportError::Disconnected),
        }
    }

    fn receive(&mut self, timeout_micros: u64) -> Result<Option<Sample>, TransportError> {
        let mut buffer = [0u8; MAX_DATAGRAM];

        self.wait_for(timeout_micros)
            .map_err(|_| TransportError::Disconnected)?;

        match self.socket.recv(&mut buffer) {
            Ok(count) => Ok(buffer[..count].split_first().and_then(|(code, payload)| {
                Topic::from_code(*code).map(|topic| Sample {
                    topic,
                    payload: payload.to_vec(),
                })
            })),
            Err(error) if quiet(error.kind()) || error.kind() == ErrorKind::ConnectionRefused => Ok(None),
            Err(_) => Err(TransportError::Disconnected),
        }
    }
}

pub struct LoopbackG1 {
    link: LoopbackLink,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl LoopbackG1 {
    pub fn link(&self) -> &LoopbackLink {
        &self.link
    }
}

impl TopicTransport for LoopbackG1 {
    fn publish(&mut self, topic: Topic, payload: &[u8]) -> Result<(), TransportError> {
        self.link.publish(topic, payload)
    }

    fn receive(&mut self, timeout_micros: u64) -> Result<Option<Sample>, TransportError> {
        self.link.receive(timeout_micros)
    }
}

impl Drop for LoopbackG1 {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);

        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

struct Served {
    robot: G1Emulator,
    link: LoopbackLink,
    clock: SystemClock,
    latency_us: u64,
    inbound: VecDeque<(u64, Sample)>,
    outbound: VecDeque<(u64, Sample)>,
}

impl Served {
    fn turn(&mut self) {
        let now = self.clock.now_micros();

        while let Ok(Some(sample)) = self.link.receive(0) {
            self.inbound.push_back((now + self.latency_us, sample));
        }

        while self.inbound.front().is_some_and(|(at, _)| *at <= now) {
            let Some((at, sample)) = self.inbound.pop_front() else {
                break;
            };
            let published = self.robot.advance_to(at);

            self.queue(published);
            self.robot.deliver(&sample);
        }

        let published = self.robot.advance_to(now);

        self.queue(published);

        while self.outbound.front().is_some_and(|(at, _)| *at <= now) {
            if let Some((_, sample)) = self.outbound.pop_front() {
                let _ = self.link.publish(sample.topic, &sample.payload);
            }
        }
    }

    fn queue(&mut self, published: Vec<(u64, Sample)>) {
        for (at, sample) in published {
            self.outbound.push_back((at + self.latency_us, sample));
        }
    }
}

pub fn serve_loopback(options: G1Options, latency_us: u64) -> Result<LoopbackG1, String> {
    let (near, far) = LoopbackLink::pair()?;
    let stop = Arc::new(AtomicBool::new(false));
    let stopping = stop.clone();
    let mut served = Served {
        robot: G1Emulator::new(options),
        link: far,
        clock: SystemClock::new(),
        latency_us,
        inbound: VecDeque::new(),
        outbound: VecDeque::new(),
    };
    let thread = std::thread::spawn(move || {
        while !stopping.load(Ordering::SeqCst) {
            served.turn();
            std::thread::sleep(Duration::from_micros(IDLE_US));
        }
    });

    Ok(LoopbackG1 {
        link: near,
        stop,
        thread: Some(thread),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_ends_bind_only_to_loopback() {
        let (near, far) = LoopbackLink::pair().unwrap();

        for link in [&near, &far] {
            assert!(link.local_addr().unwrap().ip().is_loopback());
            assert!(link.peer_addr().unwrap().ip().is_loopback());
        }
    }

    #[test]
    fn the_served_g1_publishes_lowstate_over_loopback() {
        let mut g1 = serve_loopback(G1Options::default(), 0).unwrap();
        let mut seen = None;

        for _ in 0..50 {
            seen = g1.receive(20_000).unwrap();

            if seen.is_some() {
                break;
            }
        }

        let sample = seen.expect("no lowstate within a second");

        assert_eq!(sample.topic, Topic::LowState);
        assert!(servo_wire::unitree::LowState::decode(&sample.payload).unwrap().crc_ok());
        assert!(g1.link().local_addr().unwrap().ip().is_loopback());
    }
}
