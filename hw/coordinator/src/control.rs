use crate::slots::{IntentSlot, NO_SKILL};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ControlCommand {
    pub body: u16,
    pub head: u16,
    pub tripped: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct ControlReader {
    deadline_ms: u64,
    safe_stop: u16,
    last_seq: u32,
    last_change_ms: u64,
    tripped: bool,
    seen: bool,
}

impl ControlReader {
    pub fn new(deadline_ms: u32, safe_stop: u16) -> Self {
        Self {
            deadline_ms: u64::from(deadline_ms),
            safe_stop,
            last_seq: 0,
            last_change_ms: 0,
            tripped: false,
            seen: false,
        }
    }

    pub fn read(&mut self, slot: &IntentSlot, now_ms: u64) -> ControlCommand {
        let intent = slot.read();

        if !self.seen || intent.seq != self.last_seq {
            self.seen = true;
            self.last_seq = intent.seq;
            self.last_change_ms = now_ms;
        }

        self.tripped =
            self.tripped || now_ms.saturating_sub(self.last_change_ms) > self.deadline_ms;

        if self.tripped {
            return ControlCommand {
                body: self.safe_stop,
                head: NO_SKILL,
                tripped: true,
            };
        }

        ControlCommand {
            body: intent.body,
            head: intent.head,
            tripped: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::slots::Intent;

    #[test]
    fn follows_the_slot_while_it_keeps_changing() {
        let slot = IntentSlot::new();
        let mut reader = ControlReader::new(500, 9);

        for t in 0..20u32 {
            slot.write(Intent {
                seq: t,
                body: 3,
                head: NO_SKILL,
            });

            assert_eq!(reader.read(&slot, u64::from(t) * 50).body, 3);
        }
    }

    #[test]
    fn trips_to_the_safe_stop_and_stays_tripped_when_the_coordinator_goes_quiet() {
        let slot = IntentSlot::new();
        let mut reader = ControlReader::new(500, 9);

        slot.write(Intent {
            seq: 1,
            body: 3,
            head: NO_SKILL,
        });
        reader.read(&slot, 0);

        assert!(!reader.read(&slot, 500).tripped);
        assert_eq!(reader.read(&slot, 501).body, 9);

        slot.write(Intent {
            seq: 2,
            body: 3,
            head: NO_SKILL,
        });

        assert!(reader.read(&slot, 520).tripped);
    }
}
