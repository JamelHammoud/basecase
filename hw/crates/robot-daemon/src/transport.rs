use servo_emu::g1::{serve_loopback, G1Options};
use servo_emu::ros2::{serve_ros2_loopback, Ros2Options};
use servo_emu::{BusOptions, InProcessBus, ServoBus, SharedBus};
use servo_wire::ros2::ControllerKind;
use servo_wire::{ByteTransport, Clock, Endpoints, Family, TopicTransport};
use std::sync::Arc;

pub const NO_MORE_SERVOS: &str = "Every new servo is already plugged in.";

pub const MOTORS_LOCKED: &str =
    "Real motors are locked in this build. They unlock at the first hardware session, with the unlock-real-motors feature.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    Emulated { latency_us: u64, seed: u64, factory: bool },
    SerialPort { path: String, baud: u32 },
    Interface { name: String },
}

pub const NOT_A_SERIAL_ROBOT: &str = "A servo bus connects over a serial port, not a network interface.";
pub const NOT_A_NETWORK_ROBOT: &str = "A G1 connects over the network, not a serial port.";
pub const NOT_A_SERIAL_ROS2: &str = "A ROS 2 robot connects over the network, not a serial port.";

#[derive(Debug, Clone, Copy)]
pub struct Ros2Link<'a> {
    pub kind: ControllerKind,
    pub topic: &'a str,
    pub joints: &'a [String],
}

pub fn real_motors_unlocked() -> bool {
    cfg!(feature = "unlock-real-motors")
}

pub struct NewServos {
    bus: SharedBus,
    left: usize,
}

impl NewServos {
    pub fn plug_in(&mut self) -> Result<(), String> {
        let mut bus = self.bus.lock().map_err(|_| NO_MORE_SERVOS.to_string())?;

        if self.left == 0 {
            return Err(NO_MORE_SERVOS.into());
        }

        bus.plug_in_new_servo();
        self.left -= 1;

        Ok(())
    }
}

pub struct Opened {
    pub transport: Box<dyn ByteTransport>,
    pub new_servos: Option<NewServos>,
}

pub fn open(target: &Target, family: Family, ids: &[u8], clock: Arc<dyn Clock>) -> Result<Opened, String> {
    match target {
        Target::Emulated {
            latency_us,
            seed,
            factory,
        } => {
            let options = BusOptions {
                seed: *seed,
                ..BusOptions::default()
            };
            let bus = if *factory {
                ServoBus::factory(family, options)
            } else {
                ServoBus::new(family, ids, options)
            }
            .shared();
            let new_servos = factory.then(|| NewServos {
                bus: bus.clone(),
                left: ids.len(),
            });

            Ok(Opened {
                transport: Box::new(InProcessBus::new(bus, clock, *latency_us)),
                new_servos,
            })
        }
        Target::SerialPort { path, baud } => Ok(Opened {
            transport: open_serial(path, *baud)?,
            new_servos: None,
        }),
        Target::Interface { .. } => Err(NOT_A_SERIAL_ROBOT.into()),
    }
}

pub fn open_g1(target: &Target) -> Result<Box<dyn TopicTransport>, String> {
    match target {
        Target::Emulated { latency_us, seed, .. } => {
            let options = G1Options {
                seed: *seed,
                fault: None,
            };

            Ok(Box::new(serve_loopback(options, *latency_us)?))
        }
        Target::Interface { name } => open_interface(name, &Endpoints::g1()),
        Target::SerialPort { .. } => Err(NOT_A_NETWORK_ROBOT.into()),
    }
}

pub fn open_ros2(target: &Target, link: Ros2Link) -> Result<Box<dyn TopicTransport>, String> {
    let endpoints = Endpoints::ros2(link.kind, link.topic)?;

    match target {
        Target::Emulated { latency_us, seed, .. } => {
            let options = Ros2Options {
                joints: link.joints.to_vec(),
                controller: link.kind,
                controller_topic: link.topic.to_string(),
                seed: *seed,
                fault: None,
            };

            Ok(Box::new(serve_ros2_loopback(options, *latency_us)?))
        }
        Target::Interface { name } => open_interface(name, &endpoints),
        Target::SerialPort { .. } => Err(NOT_A_SERIAL_ROS2.into()),
    }
}

#[cfg(feature = "unlock-real-motors")]
fn open_interface(name: &str, endpoints: &Endpoints) -> Result<Box<dyn TopicTransport>, String> {
    Ok(Box::new(transport_real::DdsTransport::open(name, endpoints)?))
}

#[cfg(not(feature = "unlock-real-motors"))]
fn open_interface(_name: &str, _endpoints: &Endpoints) -> Result<Box<dyn TopicTransport>, String> {
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

    fn arm_joints() -> Vec<String> {
        vec!["shoulder".into(), "elbow".into()]
    }

    fn arm_link(joints: &[String]) -> Ros2Link<'_> {
        Ros2Link {
            kind: ControllerKind::ForwardPosition,
            topic: "/forward_position_controller/commands",
            joints,
        }
    }

    #[test]
    fn the_default_build_cannot_reach_a_ros2_robot_on_the_network() {
        let joints = arm_joints();
        let interface = open_ros2(&Target::Interface { name: "en0".into() }, arm_link(&joints));
        let serial = open_ros2(
            &Target::SerialPort {
                path: "/dev/null".into(),
                baud: 1_000_000,
            },
            arm_link(&joints),
        );

        assert_eq!(interface.err().as_deref(), Some(MOTORS_LOCKED));
        assert_eq!(serial.err().as_deref(), Some(NOT_A_SERIAL_ROS2));
    }

    #[test]
    fn the_emulated_ros2_robot_publishes_the_spec_joints_over_loopback() {
        let joints = arm_joints();
        let target = Target::Emulated {
            latency_us: 0,
            seed: 1,
            factory: false,
        };
        let mut link = open_ros2(&target, arm_link(&joints)).unwrap();
        let heard = (0..50).find_map(|_| link.receive(20_000).unwrap()).unwrap();
        let state = servo_wire::ros2::JointState::decode(&heard.payload).unwrap();
        let mut names = state.name.clone();

        names.sort();
        assert_eq!(names, vec!["elbow".to_string(), "shoulder".to_string()]);
    }

    #[test]
    fn a_crafted_topic_opens_nothing() {
        let joints = arm_joints();
        let link = Ros2Link {
            topic: "/x/../commands",
            ..arm_link(&joints)
        };

        assert!(open_ros2(&Target::Interface { name: "en0".into() }, link).is_err_and(|e| e != MOTORS_LOCKED));
    }

    #[test]
    fn the_emulated_g1_is_reached_over_loopback_only() {
        let target = Target::Emulated {
            latency_us: 0,
            seed: 1,
            factory: false,
        };
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
    fn a_factory_bus_hands_out_one_new_servo_per_robot_servo() {
        let target = Target::Emulated {
            latency_us: 0,
            seed: 1,
            factory: true,
        };
        let mut new_servos = open(&target, Family::Feetech, &[1, 2], Arc::new(VirtualClock::new()))
            .unwrap()
            .new_servos
            .unwrap();

        assert!(new_servos.plug_in().is_ok());
        assert!(new_servos.plug_in().is_ok());
        assert_eq!(new_servos.plug_in(), Err(NO_MORE_SERVOS.into()));
    }

    #[test]
    fn the_emulator_is_always_available() {
        let target = Target::Emulated {
            latency_us: 16_000,
            seed: 1,
            factory: false,
        };
        let opened = open(&target, Family::Dynamixel, &[1], Arc::new(VirtualClock::new())).unwrap();

        assert!(opened.new_servos.is_none());
    }
}
