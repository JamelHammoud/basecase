use servo_emu::g1::{serve_loopback, G1Options};
use servo_emu::{BusOptions, InProcessBus, ServoBus};
use servo_wire::{ByteTransport, Clock, Family, TopicTransport};
use std::sync::Arc;

pub const MOTORS_LOCKED: &str =
    "Real motors are locked in this build. They unlock at the first hardware session, with the unlock-real-motors feature.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    Emulated { latency_us: u64, seed: u64 },
    SerialPort { path: String, baud: u32 },
    Interface { name: String },
}

pub const NOT_A_SERIAL_ROBOT: &str = "A servo bus connects over a serial port, not a network interface.";
pub const NOT_A_NETWORK_ROBOT: &str = "A G1 connects over the network, not a serial port.";

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
        Target::Interface { .. } => Err(NOT_A_SERIAL_ROBOT.into()),
    }
}

pub fn open_g1(target: &Target) -> Result<Box<dyn TopicTransport>, String> {
    match target {
        Target::Emulated { latency_us, seed } => {
            let options = G1Options {
                seed: *seed,
                fault: None,
            };

            Ok(Box::new(serve_loopback(options, *latency_us)?))
        }
        Target::Interface { name } => open_interface(name),
        Target::SerialPort { .. } => Err(NOT_A_NETWORK_ROBOT.into()),
    }
}

#[cfg(feature = "unlock-real-motors")]
fn open_interface(name: &str) -> Result<Box<dyn TopicTransport>, String> {
    Ok(Box::new(transport_real::DdsTransport::open(name)?))
}

#[cfg(not(feature = "unlock-real-motors"))]
fn open_interface(_name: &str) -> Result<Box<dyn TopicTransport>, String> {
    Err(MOTORS_LOCKED.into())
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
    fn the_default_build_cannot_open_a_network_interface() {
        let result = open_g1(&Target::Interface { name: "en0".into() });

        assert_eq!(result.err().as_deref(), Some(MOTORS_LOCKED));
    }

    #[test]
    fn the_emulated_g1_is_reached_over_loopback_only() {
        let target = Target::Emulated { latency_us: 0, seed: 1 };
        let mut link = open_g1(&target).unwrap();
        let mut heard = None;

        for _ in 0..50 {
            heard = link.receive(20_000).unwrap();

            if heard.is_some() {
                break;
            }
        }

        assert!(heard.is_some());
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
