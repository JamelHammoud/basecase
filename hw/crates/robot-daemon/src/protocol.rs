use crate::control::{Command, Daemon, DaemonEvent, Run};
use crate::fault::{daemon_lost_message, g1_lost_message, ros2_lost_message};
use crate::g1::G1Daemon;
use crate::ladder::Mode;
use crate::ros2::Ros2Daemon;
use crate::safety::{Reading, Ros2Joint};
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
    AssignId { id: u8, model: u16 },
    PlugIn,
}

pub enum Routed {
    Intent(Vec<f32>),
    Heartbeat,
    PlugIn,
    Command(Command),
}

pub fn parse_line(line: &str) -> Result<Routed, String> {
    let inbound: Inbound = serde_json::from_str(line).map_err(|error| format!("Unreadable command: {error}"))?;

    Ok(match inbound {
        Inbound::Intent { joints } => {
            Routed::Intent(joints.into_iter().map(|value| value.unwrap_or(f32::NAN)).collect())
        }
        Inbound::Heartbeat => Routed::Heartbeat,
        Inbound::PlugIn => Routed::PlugIn,
        Inbound::AssignId { id, model } => Routed::Command(Command::AssignId { id, model }),
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
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<u8>,
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
    Assigned {
        at_us: u64,
        id: u8,
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
pub const ROS2_FAMILY: &str = "ros2";

pub fn ros2_hello_line(emulated: bool) -> String {
    hello(ROS2_FAMILY, emulated, ros2_lost_message(emulated))
}

#[derive(Serialize)]
struct JointStatus {
    id: Option<u8>,
    position: Option<i32>,
    temp_c: Option<f32>,
    volts: Option<f32>,
    torque_on: Option<bool>,
    reply: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    velocity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    effort: Option<f64>,
}

fn finite(value: f32) -> Option<f64> {
    value.is_finite().then_some(f64::from(value))
}

pub fn event_line(event: &DaemonEvent) -> String {
    let outbound = match event {
        DaemonEvent::Fault {
            at_us,
            code,
            message,
            id,
        } => Outbound::Fault {
            at_us: *at_us,
            code,
            message,
            id: *id,
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
        DaemonEvent::Assigned { at_us, id } => Outbound::Assigned { at_us: *at_us, id: *id },
    };

    serde_json::to_string(&outbound).unwrap_or_default()
}

pub fn refused_line(message: &str) -> String {
    serde_json::to_string(&Outbound::Refused { message }).unwrap_or_default()
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
            velocity: finite(state.dq),
            effort: finite(state.tau),
        })
        .collect()
}

fn status_counts(rad: f64) -> i32 {
    (2048.0 + rad * f64::from(crate::calibration::COUNTS_PER_TURN) / std::f64::consts::TAU).round() as i32
}

fn ros2_joints(joints: Vec<Ros2Joint>, torque_on: bool) -> Vec<JointStatus> {
    joints
        .into_iter()
        .zip(1..=u8::MAX)
        .map(|(joint, id)| JointStatus {
            id: Some(id),
            position: joint.position.map(status_counts),
            temp_c: None,
            volts: None,
            torque_on: Some(torque_on),
            reply: if joint.position.is_some() { "ok" } else { "missing" },
            velocity: joint.velocity,
            effort: joint.effort,
        })
        .collect()
}

pub fn ros2_status_line(daemon: &Ros2Daemon) -> String {
    let joints = ros2_joints(daemon.joints(), daemon.run().is_commanding());
    let outbound = Outbound::Status {
        at_us: daemon.now_us(),
        mode: daemon.mode(),
        run: daemon.run().label(),
        sealed: daemon.is_sealed(),
        fault_latched: daemon.fault_latched(),
        joints,
    };

    serde_json::to_string(&outbound).unwrap_or_default()
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
        velocity: None,
        effort: None,
    }
}

#[cfg(test)]
#[path = "protocol_tests.rs"]
mod tests;
