#[cfg(loom)]
use loom::sync::atomic::{AtomicU32, AtomicU64, Ordering};
#[cfg(not(loom))]
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

pub const MAX_JOINTS: usize = 32;
pub const MAX_OBSERVATIONS: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Publish {
    Accepted,
    Busy,
    TooLong,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Snapshot {
    pub version: u64,
    pub count: usize,
}

pub struct IntentSlot<const N: usize = MAX_JOINTS> {
    sequence: AtomicU64,
    count: AtomicU32,
    values: [AtomicU32; N],
}

impl<const N: usize> IntentSlot<N> {
    pub fn new() -> Self {
        Self {
            sequence: AtomicU64::new(0),
            count: AtomicU32::new(0),
            values: std::array::from_fn(|_| AtomicU32::new(0)),
        }
    }

    pub fn publish(&self, values: &[f32]) -> Publish {
        if values.len() > N {
            return Publish::TooLong;
        }

        let current = self.sequence.load(Ordering::SeqCst);

        if current % 2 == 1 {
            return Publish::Busy;
        }

        if self
            .sequence
            .compare_exchange(current, current + 1, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Publish::Busy;
        }

        self.count.store(values.len() as u32, Ordering::SeqCst);

        for (slot, value) in self.values.iter().zip(values) {
            slot.store(value.to_bits(), Ordering::SeqCst);
        }

        self.sequence.store(current + 2, Ordering::SeqCst);

        Publish::Accepted
    }

    pub fn read(&self, out: &mut [f32; N]) -> Option<Snapshot> {
        let before = self.sequence.load(Ordering::SeqCst);

        if before % 2 == 1 || before == 0 {
            return None;
        }

        let count = self.count.load(Ordering::SeqCst) as usize;

        for (value, slot) in out.iter_mut().zip(&self.values) {
            *value = f32::from_bits(slot.load(Ordering::SeqCst));
        }

        let after = self.sequence.load(Ordering::SeqCst);

        (before == after).then_some(Snapshot {
            version: before / 2,
            count: count.min(N),
        })
    }

    pub fn version(&self) -> u64 {
        self.sequence.load(Ordering::SeqCst) / 2
    }
}

impl<const N: usize> Default for IntentSlot<N> {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Default)]
pub struct Heartbeat {
    beats: AtomicU64,
}

impl Heartbeat {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn beat(&self) {
        self.beats.fetch_add(1, Ordering::SeqCst);
    }

    pub fn count(&self) -> u64 {
        self.beats.load(Ordering::SeqCst)
    }
}

pub struct IntentWriter {
    slot: std::sync::Arc<IntentSlot>,
    heartbeat: std::sync::Arc<Heartbeat>,
}

impl IntentWriter {
    pub fn new(slot: std::sync::Arc<IntentSlot>, heartbeat: std::sync::Arc<Heartbeat>) -> Self {
        Self { slot, heartbeat }
    }

    pub fn write_intent(&self, joints: &[f32]) -> Publish {
        let result = self.slot.publish(joints);

        if result == Publish::Accepted {
            self.heartbeat.beat();
        }

        result
    }

    pub fn heartbeat(&self) {
        self.heartbeat.beat();
    }
}

#[cfg(all(test, not(loom)))]
mod tests {
    use super::*;

    #[test]
    fn nothing_is_read_before_the_first_publish() {
        let slot: IntentSlot<4> = IntentSlot::new();
        let mut out = [0.0; 4];

        assert_eq!(slot.read(&mut out), None);
    }

    #[test]
    fn latest_publish_wins() {
        let slot: IntentSlot<4> = IntentSlot::new();
        let mut out = [0.0; 4];

        assert_eq!(slot.publish(&[1.0, 2.0]), Publish::Accepted);
        assert_eq!(slot.publish(&[3.0, 4.0, 5.0]), Publish::Accepted);

        let snapshot = slot.read(&mut out).unwrap();

        assert_eq!(snapshot, Snapshot { version: 2, count: 3 });
        assert_eq!(&out[..3], &[3.0, 4.0, 5.0]);
    }

    #[test]
    fn too_many_values_are_refused_whole() {
        let slot: IntentSlot<2> = IntentSlot::new();

        assert_eq!(slot.publish(&[1.0, 2.0, 3.0]), Publish::TooLong);
        assert_eq!(slot.version(), 0);
    }

    #[test]
    fn nan_passes_through_unchanged_for_the_guard_to_reject() {
        let slot: IntentSlot<2> = IntentSlot::new();
        let mut out = [0.0; 2];

        slot.publish(&[f32::NAN, 1.0]);
        slot.read(&mut out).unwrap();
        assert!(out[0].is_nan());
    }

    #[test]
    fn writer_counts_as_a_heartbeat() {
        let slot = std::sync::Arc::new(IntentSlot::new());
        let heartbeat = std::sync::Arc::new(Heartbeat::new());
        let writer = IntentWriter::new(slot, heartbeat.clone());

        writer.write_intent(&[0.0]);
        writer.heartbeat();
        assert_eq!(heartbeat.count(), 2);
    }
}
