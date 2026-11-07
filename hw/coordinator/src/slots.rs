use std::sync::atomic::{AtomicU64, Ordering};

pub const NO_SKILL: u16 = 0xffff;

pub const BODY: u8 = 1;
pub const HEAD: u8 = 2;
pub const VOICE: u8 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Intent {
    pub seq: u32,
    pub body: u16,
    pub head: u16,
}

impl Intent {
    pub fn unpack(raw: u64) -> Self {
        Self {
            seq: (raw >> 32) as u32,
            head: (raw >> 16) as u16,
            body: raw as u16,
        }
    }

    pub fn pack(self) -> u64 {
        (u64::from(self.seq) << 32) | (u64::from(self.head) << 16) | u64::from(self.body)
    }
}

#[derive(Debug)]
pub struct IntentSlot(AtomicU64);

impl Default for IntentSlot {
    fn default() -> Self {
        Self::new()
    }
}

impl IntentSlot {
    pub fn new() -> Self {
        let empty = Intent {
            seq: 0,
            body: NO_SKILL,
            head: NO_SKILL,
        };

        Self(AtomicU64::new(empty.pack()))
    }

    pub fn write(&self, intent: Intent) {
        self.0.store(intent.pack(), Ordering::Release);
    }

    pub fn read(&self) -> Intent {
        Intent::unpack(self.0.load(Ordering::Acquire))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packs_every_field_in_one_word() {
        let intent = Intent {
            seq: 0xdead_beef,
            body: 7,
            head: NO_SKILL,
        };
        let slot = IntentSlot::new();

        slot.write(intent);

        assert_eq!(slot.read(), intent);
    }
}
