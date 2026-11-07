use plant_bam::SplitMix;
use servo_emu::Timed;
use servo_wire::{Family, Scan};

#[derive(Debug, Default)]
pub struct ReplyDamage {
    pub cut_after: Option<usize>,
    pub unplugged: bool,
    pub flips_left: u32,
    pub truncations_left: u32,
    pub wrong_ids_left: u32,
    pub extra_latency_us: u64,
}

impl ReplyDamage {
    pub fn apply(&mut self, family: Family, rng: &mut SplitMix, reply: Timed) -> Option<Timed> {
        if self.unplugged {
            return None;
        }

        let Timed { at_us, mut bytes } = reply;

        if let Some(keep) = self.cut_after.take() {
            bytes.truncate(keep);
            self.unplugged = true;
        }

        if self.wrong_ids_left > 0 {
            self.wrong_ids_left -= 1;
            bytes = renumbered(family, &bytes);
        }

        if self.flips_left > 0 && !bytes.is_empty() {
            self.flips_left -= 1;

            let index = rng.below(bytes.len() as u64) as usize;

            bytes[index] ^= 1 << rng.below(8);
        }

        if self.truncations_left > 0 && bytes.len() > 2 {
            self.truncations_left -= 1;

            let keep = 1 + rng.below(bytes.len() as u64 - 1) as usize;

            bytes.truncate(keep);
        }

        Some(Timed {
            at_us: at_us + self.extra_latency_us,
            bytes,
        })
    }
}

fn renumbered(family: Family, bytes: &[u8]) -> Vec<u8> {
    let Scan::Frame(frame) = family.scan(bytes) else {
        return bytes.to_vec();
    };

    family.status_of(&frame).map_or_else(
        || bytes.to_vec(),
        |status| family.status_frame(status.id.wrapping_add(7), status.error, &status.data),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply() -> Timed {
        Timed {
            at_us: 100,
            bytes: Family::Feetech.status_frame(1, 0, &[1, 2, 3, 4]),
        }
    }

    #[test]
    fn unplug_cuts_one_reply_then_silences_the_rest() {
        let mut damage = ReplyDamage {
            cut_after: Some(3),
            ..ReplyDamage::default()
        };
        let mut rng = SplitMix::new(1);

        assert_eq!(damage.apply(Family::Feetech, &mut rng, reply()).unwrap().bytes.len(), 3);
        assert!(damage.apply(Family::Feetech, &mut rng, reply()).is_none());
    }

    #[test]
    fn a_flipped_reply_never_scans_as_a_good_frame() {
        let mut rng = SplitMix::new(3);

        for _ in 0..200 {
            let mut damage = ReplyDamage {
                flips_left: 1,
                ..ReplyDamage::default()
            };
            let damaged = damage.apply(Family::Feetech, &mut rng, reply()).unwrap();
            let good = matches!(Family::Feetech.scan(&damaged.bytes), Scan::Frame(frame) if frame.params == vec![1, 2, 3, 4] && frame.id == 1);

            assert!(!good);
        }
    }

    #[test]
    fn renumbered_replies_stay_valid_frames_from_another_id() {
        let mut damage = ReplyDamage {
            wrong_ids_left: 1,
            ..ReplyDamage::default()
        };
        let mut rng = SplitMix::new(1);
        let damaged = damage.apply(
            Family::Dynamixel,
            &mut rng,
            Timed {
                at_us: 0,
                bytes: Family::Dynamixel.status_frame(1, 0, &[9]),
            },
        );
        let Scan::Frame(frame) = Family::Dynamixel.scan(&damaged.unwrap().bytes) else {
            panic!("expected a frame");
        };

        assert_eq!(frame.id, 8);
    }
}
