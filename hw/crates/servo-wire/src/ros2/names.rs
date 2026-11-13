use super::JOINT_STATES_TOPIC;
use crate::{Endpoint, Endpoints, Topic};

pub const MAX_JOINT_NAME: usize = 64;
pub const MAX_TOPIC_NAME: usize = 128;
pub const MAX_TOPIC_PARTS: usize = 4;
pub const MAX_SPEC_JOINTS: usize = 32;
pub const DDS_TOPIC_PREFIX: &str = "rt";
const SHOWN_CHARACTERS: usize = 48;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ControllerKind {
    ForwardPosition,
    JointTrajectory,
    DiffDrive,
}

impl ControllerKind {
    pub const ALL: [ControllerKind; 3] = [
        ControllerKind::ForwardPosition,
        ControllerKind::JointTrajectory,
        ControllerKind::DiffDrive,
    ];

    pub fn parse(text: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|kind| kind.as_str() == text)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            ControllerKind::ForwardPosition => "forward_position",
            ControllerKind::JointTrajectory => "joint_trajectory",
            ControllerKind::DiffDrive => "diff_drive",
        }
    }

    pub fn command_topic(self) -> Topic {
        match self {
            ControllerKind::ForwardPosition => Topic::PositionCommands,
            ControllerKind::JointTrajectory => Topic::TrajectoryCommands,
            ControllerKind::DiffDrive => Topic::CmdVel,
        }
    }

    pub fn default_topic(self) -> &'static str {
        match self {
            ControllerKind::ForwardPosition => "/forward_position_controller/commands",
            ControllerKind::JointTrajectory => "/joint_trajectory_controller/joint_trajectory",
            ControllerKind::DiffDrive => "/cmd_vel",
        }
    }

    pub fn topic_endings(self) -> &'static [&'static str] {
        match self {
            ControllerKind::ForwardPosition => &["commands"],
            ControllerKind::JointTrajectory => &["joint_trajectory"],
            ControllerKind::DiffDrive => &["cmd_vel", "cmd_vel_unstamped"],
        }
    }

    fn joints_fit(self, count: usize) -> bool {
        match self {
            ControllerKind::DiffDrive => count == 2,
            ControllerKind::ForwardPosition | ControllerKind::JointTrajectory => (1..=MAX_SPEC_JOINTS).contains(&count),
        }
    }
}

fn shown(text: &str) -> String {
    let mut out: String = text.chars().take(SHOWN_CHARACTERS).collect();

    if text.chars().count() > SHOWN_CHARACTERS {
        out.push('…');
    }

    format!("{out:?}")
}

fn is_name_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || byte == b'_'
}

fn is_name_part(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

fn is_ros_name(text: &str) -> bool {
    match text.as_bytes() {
        [first, rest @ ..] => is_name_start(*first) && rest.iter().all(|byte| is_name_part(*byte)),
        [] => false,
    }
}

pub fn checked_joint_name(name: &str) -> Result<&str, String> {
    if name.len() <= MAX_JOINT_NAME && is_ros_name(name) {
        return Ok(name);
    }

    Err(format!(
        "{} isn't a ROS 2 joint name. Use letters, digits and underscores, starting with a letter or underscore, up to 64 characters.",
        shown(name)
    ))
}

pub fn checked_joints(kind: ControllerKind, names: &[String]) -> Result<(), String> {
    if !kind.joints_fit(names.len()) {
        return Err(match kind {
            ControllerKind::DiffDrive => format!(
                "A diff_drive controller drives two wheels, left then right, not {} joints.",
                names.len()
            ),
            _ => format!("A ROS 2 robot needs 1 to 32 joints, not {}.", names.len()),
        });
    }

    for (at, name) in names.iter().enumerate() {
        checked_joint_name(name)?;

        if names[..at].contains(name) {
            return Err(format!("{} is listed twice.", shown(name)));
        }
    }

    Ok(())
}

fn is_ros_topic(topic: &str) -> bool {
    let Some(path) = topic.strip_prefix('/') else {
        return false;
    };
    let parts = path.split('/').count();

    topic.len() <= MAX_TOPIC_NAME
        && !topic.contains("__")
        && (1..=MAX_TOPIC_PARTS).contains(&parts)
        && path.split('/').all(is_ros_name)
}

fn checked_ros_topic(topic: &str) -> Result<&str, String> {
    if is_ros_topic(topic) {
        return Ok(topic);
    }

    Err(format!(
        "{} isn't a ROS 2 topic name. Use one to four /parts of letters, digits and underscores, up to 128 characters.",
        shown(topic)
    ))
}

pub fn checked_topic(kind: ControllerKind, topic: &str) -> Result<&str, String> {
    let topic = checked_ros_topic(topic)?;
    let ending = topic.rsplit('/').next().unwrap_or_default();

    if kind.topic_endings().contains(&ending) {
        return Ok(topic);
    }

    let endings: Vec<String> = kind.topic_endings().iter().map(|end| format!("/{end}")).collect();

    Err(format!(
        "A {} controller listens on a topic ending in {}, not {}.",
        kind.as_str(),
        endings.join(" or "),
        shown(topic)
    ))
}

pub fn dds_topic_name(topic: &str) -> Result<String, String> {
    Ok(format!("{DDS_TOPIC_PREFIX}{}", checked_ros_topic(topic)?))
}

impl Endpoints {
    pub fn ros2(kind: ControllerKind, controller_topic: &str) -> Result<Self, String> {
        let command = Endpoint {
            topic: kind.command_topic(),
            name: dds_topic_name(checked_topic(kind, controller_topic)?)?,
        };
        let states = Endpoint {
            topic: Topic::JointStates,
            name: dds_topic_name(JOINT_STATES_TOPIC)?,
        };

        Ok(Self {
            reads: vec![states],
            writes: vec![command],
        })
    }
}

#[cfg(test)]
#[path = "names_tests.rs"]
mod tests;
