use crate::bus::{SharedBus, Timed};
use servo_wire::{ByteTransport, Clock, TransportError};
use std::collections::VecDeque;
use std::sync::Arc;

pub const WINDOWS_LATENCY_US: u64 = 16_000;

pub type ReplyFilter = Box<dyn FnMut(Timed) -> Option<Timed> + Send>;

pub struct InProcessBus {
    bus: SharedBus,
    clock: Arc<dyn Clock>,
    latency_us: u64,
    arrivals: VecDeque<(u64, u8)>,
    filter: Option<ReplyFilter>,
}

impl InProcessBus {
    pub fn new(bus: SharedBus, clock: Arc<dyn Clock>, latency_us: u64) -> Self {
        Self {
            bus,
            clock,
            latency_us,
            arrivals: VecDeque::new(),
            filter: None,
        }
    }

    pub fn set_latency_us(&mut self, latency_us: u64) {
        self.latency_us = latency_us;
    }

    pub fn set_reply_filter(&mut self, filter: ReplyFilter) {
        self.filter = Some(filter);
    }

    pub fn drop_pending(&mut self) {
        self.arrivals.clear();
    }

    pub fn bus(&self) -> SharedBus {
        self.bus.clone()
    }

    pub fn clock(&self) -> Arc<dyn Clock> {
        self.clock.clone()
    }

    fn schedule(&mut self, replies: Vec<Timed>, byte_micros: u64) {
        let filtered: Vec<Timed> = match self.filter.as_mut() {
            Some(filter) => replies.into_iter().filter_map(filter).collect(),
            None => replies,
        };

        for reply in filtered {
            for (index, byte) in reply.bytes.iter().enumerate() {
                let at = reply.at_us + self.latency_us + (index as u64 + 1) * byte_micros;

                self.arrivals.push_back((at, *byte));
            }
        }

        self.arrivals.make_contiguous().sort_by_key(|(at, _)| *at);
    }

    fn deliver_due(&mut self, out: &mut [u8]) -> usize {
        let now = self.clock.now_micros();
        let mut count = 0;

        while count < out.len() {
            let due = self.arrivals.front().is_some_and(|(at, _)| *at <= now);

            if !due {
                break;
            }

            if let Some((_, byte)) = self.arrivals.pop_front() {
                out[count] = byte;
                count += 1;
            }
        }

        count
    }
}

impl ByteTransport for InProcessBus {
    fn write_bytes(&mut self, bytes: &[u8]) -> Result<(), TransportError> {
        let now = self.clock.now_micros();
        let (replies, byte_micros) = {
            let mut bus = self.bus.lock().map_err(|_| TransportError::Disconnected)?;
            let byte_micros = bus.byte_micros();
            let arrived_at = now + bytes.len() as u64 * byte_micros;

            bus.advance_to(now);

            (bus.feed(bytes, arrived_at), byte_micros)
        };

        self.schedule(replies, byte_micros);

        Ok(())
    }

    fn read_bytes(&mut self, out: &mut [u8], timeout_micros: u64) -> Result<usize, TransportError> {
        let deadline = self.clock.now_micros() + timeout_micros;

        loop {
            let delivered = self.deliver_due(out);

            if delivered > 0 {
                return Ok(delivered);
            }

            let now = self.clock.now_micros();

            if now >= deadline {
                return Ok(0);
            }

            let wake = self.arrivals.front().map_or(deadline, |(at, _)| (*at).min(deadline));

            self.clock.wait_until(wake.max(now + 1));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bus::{BusOptions, ServoBus};
    use servo_wire::{Family, Scan, VirtualClock};

    #[test]
    fn replies_arrive_after_the_injected_latency() {
        let clock = VirtualClock::new();
        let bus = ServoBus::new(Family::Feetech, &[1], BusOptions::default()).shared();
        let mut transport = InProcessBus::new(bus, Arc::new(clock.clone()), WINDOWS_LATENCY_US);
        let mut buffer = [0u8; 16];

        transport.write_bytes(&Family::Feetech.ping_request(1)).unwrap();

        assert_eq!(transport.read_bytes(&mut buffer, WINDOWS_LATENCY_US / 2).unwrap(), 0);

        let received = transport.read_bytes(&mut buffer, 2 * WINDOWS_LATENCY_US).unwrap();

        assert!(received > 0);
        assert!(clock.now_micros() >= WINDOWS_LATENCY_US);
    }

    #[test]
    fn a_whole_reply_can_be_collected() {
        let clock = VirtualClock::new();
        let bus = ServoBus::new(Family::Dynamixel, &[2], BusOptions::default()).shared();
        let mut transport = InProcessBus::new(bus, Arc::new(clock), 0);
        let mut collected = Vec::new();
        let mut buffer = [0u8; 8];

        transport.write_bytes(&Family::Dynamixel.ping_request(2)).unwrap();

        loop {
            let count = transport.read_bytes(&mut buffer, 5000).unwrap();

            if count == 0 {
                break;
            }

            collected.extend_from_slice(&buffer[..count]);
        }

        assert!(matches!(Family::Dynamixel.scan(&collected), Scan::Frame(_)));
    }
}
