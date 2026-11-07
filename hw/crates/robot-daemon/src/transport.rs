use servo_emu::{BusOptions, InProcessBus, ServoBus};
use servo_wire::{ByteTransport, Clock, Family};
use std::sync::Arc;

pub const MOTORS_LOCKED: &str =
    "Real motors are locked in this build. They unlock at the first hardware session, with the unlock-real-motors feature.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    Emulated { latency_us: u64, seed: u64 },
    SerialPort { path: String, baud: u32 },
}

pub fn real_motors_unlocked() -> bool {
    cfg!(feature = "unlock-real-motors")
}

pub fn open(
    target: &Target,
    family: Family,
    ids: &[u8],
    clock: Arc<dyn Clock>,
) -> Result<Box<dyn ByteTransport>, String> {
    match target {
        Target::Emulated { latency_us, seed } => {
            let options = BusOptions {
                seed: *seed,
                ..BusOptions::default()
            };
            let bus = ServoBus::new(family, ids, options).shared();

            Ok(Box::new(InProcessBus::new(bus, clock, *latency_us)))
        }
        Target::SerialPort { path, baud } => open_serial(path, *baud),
    }
}

#[cfg(feature = "unlock-real-motors")]
fn open_serial(path: &str, baud: u32) -> Result<Box<dyn ByteTransport>, String> {
    Ok(Box::new(transport_real::SerialTransport::open(path, baud)?))
}

#[cfg(not(feature = "unlock-real-motors"))]
fn open_serial(_path: &str, _baud: u32) -> Result<Box<dyn ByteTransport>, String> {
    Err(MOTORS_LOCKED.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use servo_wire::VirtualClock;

    #[test]
    fn the_default_build_cannot_open_a_serial_port() {
        let result = open(
            &Target::SerialPort {
                path: "/dev/null".into(),
                baud: 1_000_000,
            },
            Family::Feetech,
            &[1],
            Arc::new(VirtualClock::new()),
        );

        assert!(!real_motors_unlocked());
        assert_eq!(result.err().as_deref(), Some(MOTORS_LOCKED));
    }

    #[test]
    fn the_emulator_is_always_available() {
        let target = Target::Emulated {
            latency_us: 16_000,
            seed: 1,
        };

        assert!(open(&target, Family::Dynamixel, &[1], Arc::new(VirtualClock::new())).is_ok());
    }
}
