use plant_bam::SplitMix;

#[derive(Debug, Clone, PartialEq)]
pub enum Fault {
    UnplugMidPacket { after_reply_bytes: usize },
    AdapterGone,
    Brownout { volts: f64, duration_us: u64 },
    StuckMotor { id: u8 },
    BitFlip { replies: u32 },
    Truncate { replies: u32 },
    WrongIdReply { replies: u32 },
    Overheat { id: u8, watts: f64 },
    LatencySpike { extra_us: u64, duration_us: u64 },
    InvertedDirection { id: u8 },
    DuplicateId { id: u8 },
    FirmwareMismatch { id: u8, version: u8 },
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScheduledFault {
    pub at_us: u64,
    pub fault: Fault,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Schedule {
    pub faults: Vec<ScheduledFault>,
}

impl Schedule {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn at(mut self, at_us: u64, fault: Fault) -> Self {
        self.faults.push(ScheduledFault { at_us, fault });
        self.faults.sort_by_key(|entry| entry.at_us);

        self
    }

    pub fn seeded(seed: u64, ids: &[u8], horizon_us: u64, count: usize) -> Self {
        let mut rng = SplitMix::new(seed);
        let mut schedule = Self::new();

        for _ in 0..count {
            let at_us = rng.below(horizon_us.max(1));
            let fault = random_fault(&mut rng, ids);

            schedule = schedule.at(at_us, fault);
        }

        schedule
    }

    pub fn take_due(&mut self, now_us: u64) -> Vec<Fault> {
        let due = self.faults.iter().take_while(|entry| entry.at_us <= now_us).count();

        self.faults.drain(..due).map(|entry| entry.fault).collect()
    }
}

fn random_fault(rng: &mut SplitMix, ids: &[u8]) -> Fault {
    let id = if ids.is_empty() {
        1
    } else {
        ids[rng.below(ids.len() as u64) as usize]
    };
    let small = 1 + rng.below(4) as u32;

    match rng.below(12) {
        0 => Fault::UnplugMidPacket {
            after_reply_bytes: 1 + rng.below(8) as usize,
        },
        1 => Fault::AdapterGone,
        2 => Fault::Brownout {
            volts: 2.0,
            duration_us: 5_000 + rng.below(60_000),
        },
        3 => Fault::StuckMotor { id },
        4 => Fault::BitFlip { replies: small },
        5 => Fault::Truncate { replies: small },
        6 => Fault::WrongIdReply { replies: small },
        7 => Fault::Overheat { id, watts: 40.0 },
        8 => Fault::LatencySpike {
            extra_us: 10_000 + rng.below(60_000),
            duration_us: 20_000 + rng.below(200_000),
        },
        9 => Fault::InvertedDirection { id },
        10 => Fault::DuplicateId { id },
        _ => Fault::FirmwareMismatch { id, version: 99 },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeded_schedules_repeat_and_stay_sorted() {
        let first = Schedule::seeded(9, &[1, 2, 3], 1_000_000, 20);
        let again = Schedule::seeded(9, &[1, 2, 3], 1_000_000, 20);

        assert_eq!(first, again);
        assert!(first.faults.windows(2).all(|pair| pair[0].at_us <= pair[1].at_us));
        assert_ne!(first, Schedule::seeded(10, &[1, 2, 3], 1_000_000, 20));
    }

    #[test]
    fn take_due_releases_only_what_is_due() {
        let mut schedule = Schedule::new()
            .at(200, Fault::AdapterGone)
            .at(100, Fault::StuckMotor { id: 1 });

        assert!(schedule.take_due(50).is_empty());
        assert_eq!(schedule.take_due(150), vec![Fault::StuckMotor { id: 1 }]);
        assert_eq!(schedule.take_due(1000), vec![Fault::AdapterGone]);
    }
}
