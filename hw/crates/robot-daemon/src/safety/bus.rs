use servo_wire::{ByteTransport, Clock, Family, Scan, Status};
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reply {
    Status(Status),
    Missing,
    Corrupt,
    WrongId(u8),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BusGone;

pub struct ReadBus {
    transport: Box<dyn ByteTransport>,
    family: Family,
    clock: Arc<dyn Clock>,
    pending: Vec<u8>,
}

struct Collect {
    replies: Vec<Option<Reply>>,
    corrupt_seen: bool,
    stray_id: Option<u8>,
    expected_length: Option<usize>,
    stale: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Census {
    pub ids: Vec<u8>,
    pub clashed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Exchange {
    pub replies: Vec<Reply>,
    pub stale_frames: usize,
}

impl ReadBus {
    pub fn new(transport: Box<dyn ByteTransport>, family: Family, clock: Arc<dyn Clock>) -> Self {
        Self {
            transport,
            family,
            clock,
            pending: Vec::new(),
        }
    }

    pub fn family(&self) -> Family {
        self.family
    }

    pub fn ping(&mut self, id: u8, timeout_us: u64) -> Result<Reply, BusGone> {
        let request = self.family.ping_request(id);

        self.exchange(&request, &[id], timeout_us, None).map(first_reply)
    }

    pub fn read(&mut self, id: u8, address: u16, length: u16, timeout_us: u64) -> Result<Reply, BusGone> {
        let request = self.family.read_request(id, address, length);

        self.exchange(&request, &[id], timeout_us, Some(usize::from(length)))
            .map(first_reply)
    }

    pub fn sync_read(&mut self, ids: &[u8], address: u16, length: u16, budget_us: u64) -> Result<Exchange, BusGone> {
        let request = self.family.sync_read_request(address, length, ids);

        self.exchange(&request, ids, budget_us, Some(usize::from(length)))
    }

    pub fn census(&mut self, window_us: u64) -> Result<Census, BusGone> {
        let request = self.family.ping_request(self.family.broadcast_id());
        let deadline = self.clock.now_micros() + window_us;
        let mut census = Census::default();
        let mut buffer = [0u8; 512];

        self.drain_late()?;
        self.send(&request)?;

        loop {
            let now = self.clock.now_micros();

            if now >= deadline {
                return Ok(census);
            }

            let count = self
                .transport
                .read_bytes(&mut buffer, deadline - now)
                .map_err(|_| BusGone)?;

            self.pending.extend_from_slice(&buffer[..count]);
            self.count_pending(&mut census);
        }
    }

    fn count_pending(&mut self, census: &mut Census) {
        loop {
            match self.family.scan(&self.pending) {
                Scan::NeedMore => return,
                Scan::Skip(count) => {
                    self.pending.drain(..count);
                }
                Scan::Corrupt { consumed } => {
                    self.pending.drain(..consumed);
                    census.clashed = true;
                }
                Scan::Frame(frame) => {
                    self.pending.drain(..frame.consumed);

                    match self.family.status_of(&frame) {
                        Some(status) if census.ids.contains(&status.id) => census.clashed = true,
                        Some(status) => census.ids.push(status.id),
                        None => census.clashed = true,
                    }
                }
            }
        }
    }

    pub fn drain_late(&mut self) -> Result<usize, BusGone> {
        let mut buffer = [0u8; 256];
        let mut total = self.pending.len();

        self.pending.clear();

        loop {
            let count = self.transport.read_bytes(&mut buffer, 0).map_err(|_| BusGone)?;

            if count == 0 {
                return Ok(total);
            }

            total += count;
        }
    }

    pub(super) fn send(&mut self, bytes: &[u8]) -> Result<(), BusGone> {
        self.transport.write_bytes(bytes).map_err(|_| BusGone)
    }

    fn exchange(
        &mut self,
        request: &[u8],
        ids: &[u8],
        budget_us: u64,
        expected_length: Option<usize>,
    ) -> Result<Exchange, BusGone> {
        let deadline = self.clock.now_micros() + budget_us;
        let mut collect = Collect {
            replies: vec![None; ids.len()],
            corrupt_seen: false,
            stray_id: None,
            expected_length,
            stale: 0,
        };
        let mut buffer = [0u8; 512];

        self.pending.clear();
        self.send(request)?;

        while collect.replies.iter().any(Option::is_none) {
            let now = self.clock.now_micros();

            if now >= deadline {
                break;
            }

            let count = self
                .transport
                .read_bytes(&mut buffer, deadline - now)
                .map_err(|_| BusGone)?;

            self.pending.extend_from_slice(&buffer[..count]);
            self.scan_pending(ids, &mut collect);
        }

        Ok(finish(collect))
    }

    fn scan_pending(&mut self, ids: &[u8], collect: &mut Collect) {
        loop {
            match self.family.scan(&self.pending) {
                Scan::NeedMore => return,
                Scan::Skip(count) => {
                    self.pending.drain(..count);
                }
                Scan::Corrupt { consumed } => {
                    self.pending.drain(..consumed);
                    collect.corrupt_seen = true;
                }
                Scan::Frame(frame) => {
                    self.pending.drain(..frame.consumed);
                    self.place(frame, ids, collect);
                }
            }
        }
    }

    fn place(&self, frame: servo_wire::Frame, ids: &[u8], collect: &mut Collect) {
        let Some(status) = self.family.status_of(&frame) else {
            collect.corrupt_seen = true;

            return;
        };

        if collect
            .expected_length
            .is_some_and(|length| length != status.data.len())
        {
            collect.stale += 1;

            return;
        }

        let slot = ids
            .iter()
            .zip(collect.replies.iter_mut())
            .find(|(id, reply)| **id == status.id && reply.is_none());

        match slot {
            Some((_, reply)) => *reply = Some(Reply::Status(status)),
            None => collect.stray_id = Some(status.id),
        }
    }
}

fn finish(collect: Collect) -> Exchange {
    let fallback = match (collect.stray_id, collect.corrupt_seen) {
        (Some(id), _) => Reply::WrongId(id),
        (None, true) => Reply::Corrupt,
        (None, false) => Reply::Missing,
    };

    Exchange {
        replies: collect
            .replies
            .into_iter()
            .map(|reply| reply.unwrap_or_else(|| fallback.clone()))
            .collect(),
        stale_frames: collect.stale,
    }
}

fn first_reply(exchange: Exchange) -> Reply {
    exchange.replies.into_iter().next().unwrap_or(Reply::Missing)
}

#[cfg(test)]
mod tests {
    use super::*;
    use servo_emu::{BusOptions, InProcessBus, ServoBus};
    use servo_wire::VirtualClock;

    fn bus_with_clock(family: Family, ids: &[u8], latency_us: u64) -> (ReadBus, Arc<VirtualClock>) {
        let clock = Arc::new(VirtualClock::new());
        let servos = ServoBus::new(family, ids, BusOptions::default()).shared();
        let transport = InProcessBus::new(servos, clock.clone(), latency_us);

        (ReadBus::new(Box::new(transport), family, clock.clone()), clock)
    }

    fn bus(family: Family, ids: &[u8]) -> ReadBus {
        bus_with_clock(family, ids, 0).0
    }

    #[test]
    fn sync_read_returns_one_status_per_id_in_order() {
        for family in [Family::Feetech, Family::Dynamixel] {
            let mut bus = bus(family, &[1, 2, 3]);
            let replies = bus.sync_read(&[3, 1, 2], 56, 2, 18_000).unwrap().replies;
            let ids: Vec<u8> = replies
                .iter()
                .map(|reply| match reply {
                    Reply::Status(status) => status.id,
                    other => panic!("unexpected {other:?}"),
                })
                .collect();

            assert_eq!(ids, vec![3, 1, 2]);
        }
    }

    #[test]
    fn a_missing_servo_is_reported_missing_without_waiting_past_the_budget() {
        let (mut bus, clock) = bus_with_clock(Family::Feetech, &[1], 0);
        let started = clock.now_micros();
        let replies = bus.sync_read(&[1, 9], 56, 2, 5_000).unwrap().replies;

        assert!(matches!(replies[0], Reply::Status(_)));
        assert_eq!(replies[1], Reply::Missing);
        assert!(clock.now_micros() - started <= 5_000);
    }

    #[test]
    fn drain_counts_every_late_byte_and_leaves_the_line_empty() {
        let (mut bus, clock) = bus_with_clock(Family::Feetech, &[1, 2], 30_000);
        let exchange = bus.sync_read(&[1, 2], 56, 2, 5_000).unwrap();

        assert_eq!(exchange.replies, vec![Reply::Missing, Reply::Missing]);
        clock.advance_to(60_000);
        assert_eq!(bus.drain_late().unwrap(), 2 * 8);
        assert_eq!(bus.drain_late().unwrap(), 0);
    }

    #[test]
    fn a_late_reply_to_an_earlier_request_is_never_taken_as_current() {
        let (mut bus, clock) = bus_with_clock(Family::Feetech, &[1], 30_000);
        let first = bus.sync_read(&[1], 40, 31, 18_000).unwrap();

        assert_eq!(first.replies, vec![Reply::Missing]);
        clock.advance_to(20_000);

        let second = bus.sync_read(&[1], 40, 32, 18_000).unwrap();

        assert_eq!(second.replies, vec![Reply::Missing]);
        assert_eq!(second.stale_frames, 1);
    }

    #[test]
    fn a_census_finds_every_id_once_even_when_two_servos_share_one() {
        for family in [Family::Feetech, Family::Dynamixel] {
            let (mut lone, clock) = bus_with_clock(family, &[3, 1, 7], 0);
            let mut shared = bus(family, &[2, 1, 1]);
            let started = clock.now_micros();

            assert_eq!(
                lone.census(800_000).unwrap(),
                Census {
                    ids: vec![1, 3, 7],
                    clashed: false
                }
            );
            assert_eq!(
                clock.now_micros() - started,
                800_000,
                "a census waits out its window, no longer"
            );
            assert_eq!(shared.census(800_000).unwrap().ids, vec![1, 2]);
        }
    }

    fn census_of(bytes: Vec<u8>) -> Census {
        let mut bus = bus(Family::Feetech, &[]);
        let mut census = Census::default();

        bus.pending = bytes;
        bus.count_pending(&mut census);

        census
    }

    #[test]
    fn a_census_counts_a_second_answer_from_one_id_or_a_garbled_one_as_a_clash() {
        let one = Family::Feetech.status_frame(1, 0, &[]);
        let mut garbled = Family::Feetech.status_frame(4, 0, &[]);
        let last = garbled.len() - 1;

        garbled[last] ^= 0xFF;

        assert_eq!(
            census_of([one.clone(), Family::Feetech.status_frame(3, 0, &[])].concat()),
            Census {
                ids: vec![1, 3],
                clashed: false
            }
        );
        assert!(census_of([one.clone(), one.clone()].concat()).clashed);
        assert!(census_of([garbled, one].concat()).clashed);
    }

    #[test]
    fn ping_reads_the_dynamixel_model() {
        let mut bus = bus(Family::Dynamixel, &[4]);
        let Reply::Status(status) = bus.ping(4, 5_000).unwrap() else {
            panic!("expected a status");
        };

        assert_eq!(u16::from_le_bytes([status.data[0], status.data[1]]), 1200);
    }
}
