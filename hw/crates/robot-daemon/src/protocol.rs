use crate::control::{Command, Daemon, DaemonEvent, Run};
use crate::fault::{daemon_lost_message, g1_lost_message};
use crate::g1::G1Daemon;
use crate::ladder::Mode;
use crate::safety::Reading;
use crate::telemetry::Sample;
use crate::transport::real_motors_unlocked;
use serde::{Deserialize, Serialize};
use servo_wire::Family;

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum Inbound {
    Enter { mode: Mode },
    Intent { joints: Vec<Option<f32>> },
    Heartbeat,
    Stop,
    Fall,
    Release,
    ClearFault,
    Recheck,
}

pub enum Routed {
    Intent(Vec<f32>),
    Heartbeat,
    Command(Command),
}

pub fn parse_line(line: &str) -> Result<Routed, String> {
    let inbound: Inbound = serde_json::from_str(line).map_err(|error| format!("Unreadable command: {error}"))?;

    Ok(match inbound {
        Inbound::Intent { joints } => {
            Routed::Intent(joints.into_iter().map(|value| value.unwrap_or(f32::NAN)).collect())
        }
        Inbound::Heartbeat => Routed::Heartbeat,
        Inbound::Enter { mode } => Routed::Command(Command::Enter(mode)),
        Inbound::Stop => Routed::Command(Command::Stop),
        Inbound::Fall => Routed::Command(Command::Fall),
        Inbound::Release => Routed::Command(Command::Release),
        Inbound::ClearFault => Routed::Command(Command::ClearFault),
        Inbound::Recheck => Routed::Command(Command::Recheck),
    })
}

#[derive(Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
enum Outbound<'a> {
    Fault {
        at_us: u64,
        code: &'a str,
        message: &'a str,
    },
    Mode {
        at_us: u64,
        mode: Mode,
    },
    Stopped {
        at_us: u64,
        message: &'a str,
    },
    Completed {
        at_us: u64,
        mode: Mode,
    },
    Refused {
        message: &'a str,
    },
    Status {
        at_us: u64,
        mode: Mode,
        run: &'a str,
        sealed: bool,
        fault_latched: bool,
        joints: Vec<JointStatus>,
    },
}

#[derive(Serialize)]
struct Hello {
    event: &'static str,
    version: &'static str,
    family: &'static str,
    emulated: bool,
    real_transport: bool,
    lost_message: String,
}

fn hello(family: &'static str, emulated: bool, lost_message: String) -> String {
    let hello = Hello {
        event: "hello",
        version: env!("CARGO_PKG_VERSION"),
        family,
        emulated,
        real_transport: real_motors_unlocked(),
        lost_message,
    };

    serde_json::to_string(&hello).unwrap_or_default()
}

pub fn hello_line(family: Family, emulated: bool) -> String {
    let name = match family {
        Family::Feetech => "feetech",
        Family::Dynamixel => "dynamixel",
    };

    hello(name, emulated, daemon_lost_message(family))
}

pub fn g1_hello_line(emulated: bool) -> String {
    hello(G1_FAMILY, emulated, g1_lost_message(emulated))
}

pub const G1_FAMILY: &str = "unitree-g1";

#[derive(Serialize)]
struct JointStatus {
    id: Option<u8>,
    position: Option<i32>,
    temp_c: Option<f32>,
    volts: Option<f32>,
    torque_on: Option<bool>,
    reply: &'static str,
}

pub fn event_line(event: &DaemonEvent) -> String {
    let outbound = match event {
        DaemonEvent::Fault { at_us, code, message } => Outbound::Fault {
            at_us: *at_us,
            code,
            message,
        },
        DaemonEvent::Mode { at_us, mode } => Outbound::Mode {
            at_us: *at_us,
            mode: *mode,
        },
        DaemonEvent::Stopped { at_us, message } => Outbound::Stopped { at_us: *at_us, message },
        DaemonEvent::Completed { at_us, mode } => Outbound::Completed {
            at_us: *at_us,
            mode: *mode,
        },
        DaemonEvent::Refused { message } => Outbound::Refused { message },
    };

    serde_json::to_string(&outbound).unwrap_or_default()
}

pub fn status_line(daemon: &Daemon) -> String {
    let run = match daemon.run() {
        Run::Idle => "idle",
        Run::SoftStart { .. } => "soft_start",
        Run::Running => "running",
        Run::Rehearsing => "rehearsing",
        Run::Stopping { .. } => "stopping",
        Run::Stopped => "stopped",
    };
    let joints = daemon.samples().iter().map(joint_status).collect();
    let outbound = Outbound::Status {
        at_us: daemon.now_us(),
        mode: daemon.mode(),
        run,
        sealed: daemon.is_sealed(),
        fault_latched: daemon.fault_latched(),
        joints,
    };

    serde_json::to_string(&outbound).unwrap_or_default()
}

#[derive(Serialize)]
struct G1Status<'a> {
    event: &'static str,
    at_us: u64,
    mode: Mode,
    run: &'a str,
    sealed: bool,
    fault_latched: bool,
    weight: f32,
    joints: Vec<JointStatus>,
}

fn g1_joints(reading: Option<&Reading>) -> Vec<JointStatus> {
    let motors = reading.map(|reading| reading.motors.as_slice()).unwrap_or_default();

    motors
        .iter()
        .enumerate()
        .map(|(motor, state)| JointStatus {
            id: Some(servo_wire::unitree::g1::joint_id(motor)),
            position: Some(
                (2048.0 + state.q * crate::calibration::COUNTS_PER_TURN / std::f32::consts::TAU).round() as i32,
            ),
            temp_c: Some(state.temp_c),
            volts: Some(state.volts),
            torque_on: Some(state.enabled),
            reply: if state.error == 0 { "ok" } else { "missing" },
        })
        .collect()
}

pub fn g1_status_line(daemon: &G1Daemon) -> String {
    let status = G1Status {
        event: "status",
        at_us: daemon.now_us(),
        mode: daemon.mode(),
        run: daemon.run().label(),
        sealed: daemon.is_sealed(),
        fault_latched: daemon.fault_latched(),
        weight: daemon.weight(),
        joints: g1_joints(daemon.reading()),
    };

    serde_json::to_string(&status).unwrap_or_default()
}

fn joint_status(sample: &Sample) -> JointStatus {
    let telemetry = sample.telemetry();
    let reply = match sample {
        Sample::Good(_) => "ok",
        Sample::Missing => "missing",
        Sample::Corrupt => "garbled",
        Sample::WrongId(_) => "wrong_id",
    };

    JointStatus {
        id: telemetry.map(|t| t.id),
        position: telemetry.map(|t| t.position),
        temp_c: telemetry.map(|t| t.temp_c),
        volts: telemetry.map(|t| t.volts),
        torque_on: telemetry.map(|t| t.torque_on),
        reply,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_every_documented_command() {
        assert!(matches!(
            parse_line(r#"{"cmd":"enter","mode":"first_run"}"#),
            Ok(Routed::Command(Command::Enter(Mode::FirstRun)))
        ));
        assert!(matches!(parse_line(r#"{"cmd":"heartbeat"}"#), Ok(Routed::Heartbeat)));
        assert!(matches!(
            parse_line(r#"{"cmd":"stop"}"#),
            Ok(Routed::Command(Command::Stop))
        ));
        assert!(matches!(
            parse_line(r#"{"cmd":"release"}"#),
            Ok(Routed::Command(Command::Release))
        ));
    }

    #[test]
    fn a_null_joint_becomes_nan_so_the_guard_refuses_it() {
        let Ok(Routed::Intent(values)) = parse_line(r#"{"cmd":"intent","joints":[0.1,null]}"#) else {
            panic!("expected an intent");
        };

        assert_eq!(values[0], 0.1);
        assert!(values[1].is_nan());
    }

    #[test]
    fn unknown_commands_are_refused() {
        assert!(parse_line(r#"{"cmd":"write_register","address":40}"#).is_err());
        assert!(parse_line("not json").is_err());
    }

    #[test]
    fn events_are_single_json_lines() {
        let line = event_line(&DaemonEvent::Fault {
            at_us: 5,
            code: "overheat".into(),
            message: "Servo 2 is hot.".into(),
        });

        assert!(!line.contains('\n'));
        assert!(line.contains(r#""event":"fault""#));
    }

    #[test]
    fn the_g1_says_hello_with_its_own_family_and_words() {
        let hello: serde_json::Value = serde_json::from_str(&g1_hello_line(true)).unwrap();

        assert_eq!(hello["family"], "unitree-g1");
        assert_eq!(hello["real_transport"], false);
        assert_eq!(hello["lost_message"], g1_lost_message(true));
        assert!(!g1_lost_message(true).contains("remote"));
    }

    #[test]
    fn hello_names_the_build_and_the_words_for_a_lost_daemon() {
        let hello: serde_json::Value = serde_json::from_str(&hello_line(Family::Feetech, true)).unwrap();

        assert_eq!(hello["event"], "hello");
        assert_eq!(hello["family"], "feetech");
        assert_eq!(hello["emulated"], true);
        assert_eq!(hello["real_transport"], false);
        assert_eq!(hello["lost_message"], daemon_lost_message(Family::Feetech));
    }
}
