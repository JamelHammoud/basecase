mod commands;
mod joint_state;
pub mod names;
mod wire;

pub use commands::{
    Float64MultiArray, JointTrajectory, JointTrajectoryPoint, MultiArrayDimension, MultiArrayLayout, Twist, Vector3,
};
pub use joint_state::{Duration, Header, JointState, Time};
pub use names::{checked_joint_name, checked_joints, checked_topic, dds_topic_name, ControllerKind};

pub const MAX_ROS_JOINTS: usize = 64;
pub const MAX_ROS_STRING: usize = 256;
pub const MAX_TRAJECTORY_POINTS: usize = 64;
pub const JOINT_STATES_TOPIC: &str = "/joint_states";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ros2Error {
    Short,
    TooMany,
    TooLong,
    NotText,
    Mismatched,
    Duplicate,
    NotFinite,
}

impl From<crate::cdr::Short> for Ros2Error {
    fn from(_: crate::cdr::Short) -> Self {
        Ros2Error::Short
    }
}

#[cfg(test)]
mod golden_tests;
#[cfg(test)]
mod hostile_tests;
