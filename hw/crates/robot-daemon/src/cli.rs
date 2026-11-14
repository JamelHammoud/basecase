use robot_daemon::calibration::RobotClass;
use robot_daemon::network::interfaces::InterfaceListener;
use robot_daemon::protocol::{G1_FAMILY, ROS2_FAMILY};
use robot_daemon::ros2::Ros2Spec;
use robot_daemon::transport::Target;
use robot_daemon::units::parse_units;
use serde_json::{json, Value};
use servo_emu::PartModel;
use servo_wire::ros2::{checked_joints, checked_topic, ControllerKind};
use servo_wire::Family;
use std::net::SocketAddr;
use std::path::PathBuf;
pub enum Robot {
    Servos {
        family: Family,
        ids: Vec<u8>,
        class: RobotClass,
        units: Vec<Option<PartModel>>,
    },
    G1,
    Ros2 {
        spec: Ros2Spec,
        topic: String,
    },
}

#[derive(Default)]
struct Flags {
    family: Option<String>,
    ids: Vec<u8>,
    class: Option<RobotClass>,
    controller: Option<String>,
    topic: Option<String>,
    joints: Option<String>,
    units: Option<PathBuf>,
}

pub struct Options {
    pub robot: Robot,
    pub artefacts: PathBuf,
    pub target: Target,
    pub network: Option<robot_daemon::network::server::NetworkOptions>,
}

pub fn parse(args: &[String]) -> Result<Options, String> {
    let mut flags = Flags::default();
    let mut artefacts = PathBuf::from(".");
    let mut target = None;
    let mut latency_us = 0;
    let mut factory = false;
    let mut seed = None;
    let mut listen: Option<SocketAddr> = None;
    let mut interface = InterfaceListener::default();
    let mut name = "Basecase Robot".to_string();
    let mut pairing_code = None;
    let mut pairing_code_file = None;
    let mut rest = args.iter();

    while let Some(flag) = rest.next() {
        let mut value = || rest.next().cloned().ok_or(format!("{flag} needs a value"));

        match flag.as_str() {
            "--listen" => {
                listen = Some(
                    value()?
                        .parse()
                        .map_err(|_| "Choose a private IP address and port for --listen.")?,
                )
            }
            "--name" => name = value()?,
            "--listen-interface" => interface.name = Some(value()?),
            "--listen-port" => {
                interface.port = Some(value()?.parse().map_err(|_| "Choose a robot port from 0 to 65535.")?)
            }
            "--listen-ipv6" => interface.ipv6 = true,
            "--pairing-code" => pairing_code = Some(value()?),
            "--pairing-code-file" => pairing_code_file = Some(PathBuf::from(value()?)),
            "--family" => flags.family = Some(value()?),
            "--ids" => flags.ids = parse_ids(&value()?)?,
            "--class" => flags.class = Some(parse_class(&value()?)?),
            "--controller" => flags.controller = Some(value()?),
            "--topic" => flags.topic = Some(value()?),
            "--joints" => flags.joints = Some(value()?),
            "--units" => flags.units = Some(PathBuf::from(value()?)),
            "--artefacts" => artefacts = PathBuf::from(value()?),
            "--latency-ms" => latency_us = value()?.parse::<u64>().map_err(|_| "Bad latency")? * 1000,
            "--seed" => seed = Some(value()?.parse::<u64>().map_err(|_| "Bad seed")?),
            "--emulated" => {
                target = Some(Target::Emulated {
                    latency_us: 0,
                    seed: 1,
                    factory: false,
                })
            }
            "--factory" => factory = true,
            "--port" => {
                target = Some(Target::SerialPort {
                    path: value()?,
                    baud: 1_000_000,
                })
            }
            "--interface" => target = Some(Target::Interface { name: value()? }),
            other => return Err(format!("Unknown option {other}")),
        }
    }

    let target = match target.ok_or("Choose --emulated, --port or --interface")? {
        Target::Emulated { seed: default, .. } => Target::Emulated {
            latency_us,
            seed: seed.unwrap_or(default),
            factory,
        },
        _ if factory => Err("--factory needs --emulated")?,
        _ if seed.is_some() => Err("--seed needs --emulated")?,
        _ if flags.units.is_some() => Err("--units needs --emulated")?,
        real => real,
    };
    let units = flags.units.take();
    let listen = interface.resolve(listen)?;

    if pairing_code.is_some() && pairing_code_file.is_some() {
        return Err("Choose either --pairing-code or --pairing-code-file.".into());
    }

    if name.is_empty() || name.len() > 63 || name.chars().any(char::is_control) {
        return Err("Give the robot a name under 64 bytes.".into());
    }

    if listen.is_some_and(|address| !robot_daemon::network::private_address(address.ip())) {
        return Err("Choose a private network address for --listen.".into());
    }

    let network = listen.map(|address| robot_daemon::network::server::NetworkOptions {
        address,
        name,
        pairing_code,
        pairing_code_file,
        artefacts: artefacts.clone(),
        spec: Value::Null,
    });

    Ok(Options {
        robot: with_units(robot_of(flags)?, units)?,
        artefacts,
        target,
        network,
    })
}

fn with_units(robot: Robot, path: Option<PathBuf>) -> Result<Robot, String> {
    let Some(path) = path else {
        return Ok(robot);
    };
    let Robot::Servos { family, ids, class, .. } = robot else {
        return Err("--units is for --family feetech or dynamixel only".into());
    };
    let bytes = std::fs::read(&path).map_err(|error| format!("The servo models file can't be read: {error}"))?;
    let units = parse_units(&bytes, &ids)?;

    Ok(Robot::Servos {
        family,
        ids,
        class,
        units,
    })
}

fn ros2_robot(flags: Flags) -> Result<Robot, String> {
    if !flags.ids.is_empty() || flags.class.is_some() {
        return Err("A ROS 2 robot names its own joints: leave out --ids and --class".into());
    }

    let controller = flags
        .controller
        .ok_or("--controller is required: forward_position, joint_trajectory or diff_drive")?;
    let kind = ControllerKind::parse(&controller)
        .ok_or("Choose a forward_position, joint_trajectory or diff_drive controller")?;
    let topic = flags.topic.unwrap_or_else(|| kind.default_topic().to_string());
    let joints: Vec<String> = flags
        .joints
        .ok_or("--joints is required")?
        .split(',')
        .map(str::to_string)
        .collect();

    checked_topic(kind, &topic)?;
    checked_joints(kind, &joints)?;

    Ok(Robot::Ros2 {
        spec: Ros2Spec { kind, joints },
        topic,
    })
}

fn robot_of(flags: Flags) -> Result<Robot, String> {
    let family = flags
        .family
        .clone()
        .ok_or("--family is required: feetech, dynamixel, unitree-g1 or ros2")?;

    if family == ROS2_FAMILY {
        return ros2_robot(flags);
    }

    if flags.controller.is_some() || flags.topic.is_some() || flags.joints.is_some() {
        return Err("--controller, --topic and --joints are for --family ros2 only".into());
    }

    let Flags { ids, class, .. } = flags;

    if family == G1_FAMILY {
        return match (ids.is_empty(), class) {
            (true, None) => Ok(Robot::G1),
            _ => Err("The G1 has its own 29 motors: leave out --ids and --class".into()),
        };
    }

    if ids.is_empty() {
        return Err("--ids is required".into());
    }

    Ok(Robot::Servos {
        family: parse_family(&family)?,
        ids,
        class: class.unwrap_or(RobotClass::Arm),
        units: Vec::new(),
    })
}

fn parse_family(value: &str) -> Result<Family, String> {
    match value {
        "feetech" => Ok(Family::Feetech),
        "dynamixel" => Ok(Family::Dynamixel),
        other => Err(format!("Unknown family {other}")),
    }
}

fn parse_class(value: &str) -> Result<RobotClass, String> {
    match value {
        "arm" => Ok(RobotClass::Arm),
        "legged" => Ok(RobotClass::Legged),
        other => Err(format!("Unknown robot class {other}")),
    }
}

fn parse_ids(value: &str) -> Result<Vec<u8>, String> {
    value
        .split(',')
        .map(|id| id.trim().parse::<u8>().map_err(|_| format!("Bad servo id {id}")))
        .collect()
}

impl Robot {
    pub fn spec(&self, emulated: bool) -> Value {
        match self {
            Self::G1 => json!({"family":"unitree-g1","emulated":emulated}),
            Self::Ros2 { spec, topic } => {
                json!({"family":"ros2","emulated":emulated,"joints":spec.joints,"controller":{"kind":spec.kind.as_str(),"topic":topic}})
            }
            Self::Servos { family, ids, class, .. } => {
                json!({"family":match family { Family::Feetech => "feetech", Family::Dynamixel => "dynamixel" },"emulated":emulated,"ids":ids,"class":match class { RobotClass::Arm => "arm", RobotClass::Legged => "legged" }})
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    fn seed_of(line: &str) -> Result<Option<u64>, String> {
        let args: Vec<String> = line.split(' ').map(str::to_string).collect();

        Ok(match parse(&args)?.target {
            Target::Emulated { seed, .. } => Some(seed),
            _ => None,
        })
    }

    #[test]
    fn an_emulated_robot_keeps_seed_one_unless_told() {
        assert_eq!(seed_of("--family feetech --ids 1,2 --emulated"), Ok(Some(1)));
        assert_eq!(
            seed_of("--family feetech --ids 1,2 --emulated --seed 2166136261"),
            Ok(Some(2_166_136_261))
        );
        assert_eq!(seed_of("--family unitree-g1 --seed 7 --emulated"), Ok(Some(7)));
    }

    #[test]
    fn refuses_a_seed_that_is_not_a_number_or_not_emulated() {
        assert_eq!(
            seed_of("--family feetech --ids 1 --emulated --seed -3"),
            Err("Bad seed".into())
        );
        assert_eq!(
            seed_of("--family feetech --ids 1 --emulated --seed"),
            Err("--seed needs a value".into())
        );
        assert_eq!(
            seed_of("--family feetech --ids 1 --port /dev/null --seed 3"),
            Err("--seed needs --emulated".into())
        );
    }
}
