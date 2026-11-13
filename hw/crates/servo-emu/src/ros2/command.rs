use servo_wire::ros2::{ControllerKind, Float64MultiArray, JointTrajectory, Ros2Error, Twist};
use servo_wire::Sample;

#[derive(Debug, Clone, PartialEq)]
pub struct Waypoint {
    pub after_us: u64,
    pub positions: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Command {
    Positions(Vec<f64>),
    Trajectory(Vec<Waypoint>),
    Twist { forward: f64, turn: f64 },
}

#[derive(Debug, Clone, PartialEq)]
pub enum Heard {
    Taken(Command),
    Rejected,
    Unreadable,
    NotOurs,
}

impl From<Result<Option<Command>, Ros2Error>> for Heard {
    fn from(command: Result<Option<Command>, Ros2Error>) -> Self {
        match command {
            Ok(Some(command)) => Heard::Taken(command),
            Ok(None) => Heard::Rejected,
            Err(_) => Heard::Unreadable,
        }
    }
}

pub fn heard(kind: ControllerKind, joints: &[String], sample: &Sample) -> Heard {
    if sample.topic != kind.command_topic() {
        return Heard::NotOurs;
    }

    let command = match kind {
        ControllerKind::ForwardPosition => positions(joints, &sample.payload),
        ControllerKind::JointTrajectory => trajectory(joints, &sample.payload),
        ControllerKind::DiffDrive => twist(&sample.payload),
    };

    command.into()
}

fn positions(joints: &[String], payload: &[u8]) -> Result<Option<Command>, Ros2Error> {
    let array = Float64MultiArray::decode(payload)?;

    Ok((array.data.len() == joints.len()).then_some(Command::Positions(array.data)))
}

fn twist(payload: &[u8]) -> Result<Option<Command>, Ros2Error> {
    let twist = Twist::decode(payload)?;

    Ok(Some(Command::Twist {
        forward: twist.linear.x,
        turn: twist.angular.z,
    }))
}

fn slots(joints: &[String], names: &[String]) -> Option<Vec<usize>> {
    if names.len() != joints.len() {
        return None;
    }

    names
        .iter()
        .map(|name| joints.iter().position(|joint| joint == name))
        .collect()
}

fn in_controller_order(slots: &[usize], positions: &[f64]) -> Vec<f64> {
    let mut ordered = vec![0.0; slots.len()];

    for (slot, position) in slots.iter().zip(positions) {
        ordered[*slot] = *position;
    }

    ordered
}

fn trajectory(joints: &[String], payload: &[u8]) -> Result<Option<Command>, Ros2Error> {
    let trajectory = JointTrajectory::decode(payload)?;

    Ok(waypoints(joints, &trajectory))
}

fn waypoints(joints: &[String], trajectory: &JointTrajectory) -> Option<Command> {
    let slots = slots(joints, &trajectory.joint_names)?;
    let mut waypoints = Vec::with_capacity(trajectory.points.len());

    for point in &trajectory.points {
        let after_us = point.time_from_start.as_micros()?;

        if waypoints
            .last()
            .is_some_and(|last: &Waypoint| last.after_us >= after_us)
        {
            return None;
        }

        waypoints.push(Waypoint {
            after_us,
            positions: in_controller_order(&slots, &point.positions),
        });
    }

    Some(Command::Trajectory(waypoints))
}
