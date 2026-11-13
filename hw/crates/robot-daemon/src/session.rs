use crate::caps::WATCHDOG_US;
use crate::control::running::{TEST_TICKS, TEST_TRAVEL_COUNTS};
use crate::control::Inputs;
use crate::fault::Fault;
use crate::intent::MAX_JOINTS;
use crate::watchdog::{Freshness, Watchdog};

pub struct IntentFeed {
    inputs: Inputs,
    intents: Watchdog,
    heartbeat: Watchdog,
    applied_version: u64,
}

impl IntentFeed {
    pub fn new() -> Self {
        Self {
            inputs: Inputs::default(),
            intents: Watchdog::new(WATCHDOG_US),
            heartbeat: Watchdog::new(WATCHDOG_US),
            applied_version: 0,
        }
    }

    pub fn inputs(&self) -> Inputs {
        self.inputs.clone()
    }

    pub fn start(&mut self, now_us: u64) {
        let version = self.inputs.intents.version();

        self.intents.arm(version, now_us);
        self.heartbeat.arm(self.inputs.heartbeat.count(), now_us);
        self.applied_version = version;
    }

    pub fn read(&mut self, now_us: u64) -> Result<Option<Vec<f32>>, Fault> {
        if self.heartbeat.observe(self.inputs.heartbeat.count(), now_us) == Freshness::Stale {
            return Err(Fault::ClientLost);
        }

        let mut values = [0.0f32; MAX_JOINTS];
        let snapshot = self.inputs.intents.read(&mut values);

        if self.intents.observe(self.inputs.intents.version(), now_us) == Freshness::Stale {
            return Err(Fault::IntentStale);
        }

        match snapshot {
            Some(snap) if snap.version != self.applied_version => {
                self.applied_version = snap.version;

                Ok(Some(values[..snap.count].to_vec()))
            }
            _ => Ok(None),
        }
    }
}

impl Default for IntentFeed {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct TestProgress {
    start: Vec<Option<i32>>,
    travel: Vec<i32>,
    ticks: u32,
}

impl TestProgress {
    pub fn begin(start: Vec<Option<i32>>) -> Self {
        let travel = vec![0; start.len()];

        Self {
            start,
            travel,
            ticks: 0,
        }
    }

    pub fn observe(&mut self, present: &[Option<i32>]) -> bool {
        for ((now, start), travel) in present.iter().zip(&self.start).zip(self.travel.iter_mut()) {
            if let (Some(now), Some(start)) = (now, start) {
                *travel = (*travel).max((now - start).abs());
            }
        }

        self.ticks += 1;

        self.ticks >= TEST_TICKS && self.travel.iter().all(|travel| *travel >= TEST_TRAVEL_COUNTS)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_test_is_done_after_five_seconds_with_every_joint_moved() {
        let mut progress = TestProgress::begin(vec![Some(2048), Some(2048)]);
        let moved = [Some(2048 + TEST_TRAVEL_COUNTS), Some(2048 - TEST_TRAVEL_COUNTS)];

        for _ in 1..TEST_TICKS {
            assert!(!progress.observe(&moved));
        }

        assert!(progress.observe(&[Some(2048), Some(2048)]));
    }

    #[test]
    fn a_joint_that_never_moves_keeps_the_test_open() {
        let mut progress = TestProgress::begin(vec![Some(2048), Some(2048)]);

        for _ in 0..TEST_TICKS * 2 {
            assert!(!progress.observe(&[Some(2148), Some(2050)]));
        }
    }

    #[test]
    fn the_feed_stops_on_a_missing_heartbeat_then_on_stale_intents() {
        let mut feed = IntentFeed::new();
        let inputs = feed.inputs();

        feed.start(0);
        inputs.intents.publish(&[0.1]);
        inputs.heartbeat.beat();

        assert_eq!(feed.read(10_000), Ok(Some(vec![0.1])));
        assert_eq!(feed.read(20_000), Ok(None));

        inputs.heartbeat.beat();
        assert_eq!(feed.read(WATCHDOG_US + 20_000), Err(Fault::IntentStale));
        assert_eq!(feed.read(2 * WATCHDOG_US + 30_000), Err(Fault::ClientLost));
    }
}
