use crate::bus::{ServoBus, Timed};
use servo_wire::dynamixel as dxl_wire;
use servo_wire::feetech as sts_wire;
use servo_wire::{Family, Frame};

const PING_SLOT_US: u64 = 3000;

impl ServoBus {
    pub(crate) fn dispatch(&mut self, frame: &Frame, now_us: u64) -> Vec<Timed> {
        let broadcast = frame.id == self.family.broadcast_id();
        let (sync_read, sync_write, ping) = match self.family {
            Family::Feetech => (sts_wire::OP_SYNC_READ, sts_wire::OP_SYNC_WRITE, sts_wire::OP_PING),
            Family::Dynamixel => (dxl_wire::OP_SYNC_READ, dxl_wire::OP_SYNC_WRITE, dxl_wire::OP_PING),
        };

        if broadcast && frame.code == sync_read {
            return self.handle_sync_read(frame, now_us);
        }

        if broadcast && frame.code == sync_write {
            self.handle_sync_write(frame, now_us);

            return Vec::new();
        }

        if broadcast && frame.code == ping {
            return self.handle_broadcast_ping(frame, now_us);
        }

        if broadcast {
            self.apply_to_all(frame, now_us);

            return Vec::new();
        }

        self.handle_addressed(frame, now_us)
    }

    fn handle_addressed(&mut self, frame: &Frame, now_us: u64) -> Vec<Timed> {
        let mut delay = 0;
        let mut answers = Vec::new();

        for slot in self
            .slots
            .iter_mut()
            .filter(|slot| slot.powered && slot.firmware.id() == frame.id)
        {
            delay = slot.firmware.return_delay_us();

            if let Some(reply) = slot.firmware.respond(frame, now_us) {
                answers.push(reply);
            }
        }

        collide(answers)
            .map(|bytes| Timed {
                at_us: now_us + delay,
                bytes,
            })
            .into_iter()
            .collect()
    }

    fn apply_to_all(&mut self, frame: &Frame, now_us: u64) {
        for slot in self.slots.iter_mut().filter(|slot| slot.powered) {
            slot.firmware.respond(frame, now_us);
        }
    }

    fn handle_broadcast_ping(&mut self, frame: &Frame, now_us: u64) -> Vec<Timed> {
        let mut replies: Vec<(u8, u64, Vec<u8>)> = Vec::new();

        for slot in self.slots.iter_mut().filter(|slot| slot.powered) {
            if let Some(reply) = slot.firmware.respond(frame, now_us) {
                replies.push((slot.firmware.id(), slot.firmware.return_delay_us(), reply));
            }
        }

        replies.sort_by_key(|(id, _, _)| *id);

        let mut out: Vec<Timed> = Vec::new();

        for (id, chunk) in replies.chunk_by(|a, b| a.0 == b.0).map(|chunk| (chunk[0].0, chunk)) {
            let delay = chunk.iter().map(|(_, delay, _)| *delay).max().unwrap_or(0);
            let answers = chunk.iter().map(|(_, _, bytes)| bytes.clone()).collect();

            out.extend(collide(answers).map(|bytes| Timed {
                at_us: now_us + delay + u64::from(id) * PING_SLOT_US,
                bytes,
            }));
        }

        out
    }

    fn handle_sync_read(&mut self, frame: &Frame, now_us: u64) -> Vec<Timed> {
        let Some((address, length, ids)) = self.sync_params(frame) else {
            return Vec::new();
        };
        let byte_micros = self.options.byte_micros;
        let mut cursor = now_us;
        let mut out = Vec::new();

        for id in ids {
            let mut delay = 0;
            let mut answers = Vec::new();

            for slot in self
                .slots
                .iter_mut()
                .filter(|slot| slot.powered && slot.firmware.id() == id)
            {
                delay = slot.firmware.return_delay_us();
                answers.push(slot.firmware.sync_read_reply(address, length, now_us));
            }

            let Some(bytes) = collide(answers) else {
                continue;
            };

            cursor += delay;
            out.push(Timed {
                at_us: cursor,
                bytes: bytes.clone(),
            });
            cursor += bytes.len() as u64 * byte_micros;
        }

        out
    }

    fn sync_params(&self, frame: &Frame) -> Option<(u16, u16, Vec<u8>)> {
        match self.family {
            Family::Feetech => {
                let [address, length, ids @ ..] = frame.params.as_slice() else {
                    return None;
                };

                Some((u16::from(*address), u16::from(*length), ids.to_vec()))
            }
            Family::Dynamixel => {
                let [address_low, address_high, length_low, length_high, ids @ ..] = frame.params.as_slice() else {
                    return None;
                };

                Some((
                    u16::from_le_bytes([*address_low, *address_high]),
                    u16::from_le_bytes([*length_low, *length_high]),
                    ids.to_vec(),
                ))
            }
        }
    }

    fn handle_sync_write(&mut self, frame: &Frame, now_us: u64) {
        let Some((address, length, chunks)) = self.sync_params(frame) else {
            return;
        };

        if length == 0 {
            return;
        }

        for chunk in chunks.chunks_exact(usize::from(length) + 1) {
            let (id, data) = (chunk[0], &chunk[1..]);

            for slot in self
                .slots
                .iter_mut()
                .filter(|slot| slot.powered && slot.firmware.id() == id)
            {
                slot.firmware.sync_write(address, data, now_us);
            }
        }
    }
}

fn collide(mut answers: Vec<Vec<u8>>) -> Option<Vec<u8>> {
    let mut merged = answers.pop()?;

    for other in answers {
        if other.len() > merged.len() {
            merged.resize(other.len(), 0xFF);
        }

        for (byte, other_byte) in merged.iter_mut().zip(other) {
            *byte &= other_byte;
        }
    }

    Some(merged)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colliding_replies_pull_the_bus_low() {
        assert_eq!(collide(vec![vec![0xF0, 0xFF], vec![0x3C]]), Some(vec![0x30, 0xFF]));
        assert_eq!(collide(vec![vec![7]]), Some(vec![7]));
        assert_eq!(collide(Vec::new()), None);
    }
}
