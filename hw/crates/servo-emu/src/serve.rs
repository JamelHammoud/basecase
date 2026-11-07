use crate::bus::{ServoBus, Timed};
use servo_wire::{ByteTransport, Clock, TransportError};

const POLL_US: u64 = 200;

pub struct Server {
    bus: ServoBus,
    outbox: Vec<Timed>,
}

impl Server {
    pub fn new(bus: ServoBus) -> Self {
        Self {
            bus,
            outbox: Vec::new(),
        }
    }

    pub fn turn(&mut self, transport: &mut dyn ByteTransport, clock: &dyn Clock) -> Result<(), TransportError> {
        let mut buffer = [0u8; 512];
        let count = transport.read_bytes(&mut buffer, POLL_US)?;
        let now = clock.now_micros();

        self.bus.advance_to(now);

        if count > 0 {
            let replies = self.bus.feed(&buffer[..count], now);

            self.outbox.extend(replies);
        }

        self.flush_due(transport, now)
    }

    fn flush_due(&mut self, transport: &mut dyn ByteTransport, now: u64) -> Result<(), TransportError> {
        let (due, later): (Vec<_>, Vec<_>) = std::mem::take(&mut self.outbox)
            .into_iter()
            .partition(|timed| timed.at_us <= now);

        self.outbox = later;

        for timed in due {
            transport.write_bytes(&timed.bytes)?;
        }

        Ok(())
    }
}
