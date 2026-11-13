mod arm;
mod base;
mod command;
mod robot;
mod serve;

pub use crate::joint::Hidden;
pub use crate::topic_robot::SampleFilter;
pub use arm::{ARM_GAINS, ARM_TORQUE_LIMIT, START_SPREAD_RAD};
pub use base::{ANGULAR_ACCEL, CMD_VEL_TIMEOUT_US, LINEAR_ACCEL, WHEEL_RADIUS_M, WHEEL_SEPARATION_M};
pub use robot::{Ros2Counters, Ros2Emulator, Ros2Fault, Ros2Options, JOINT_STATES_EVERY_US};
pub use serve::{in_process_ros2, serve_ros2_loopback, LoopbackRos2};

pub type SharedRos2 = std::sync::Arc<std::sync::Mutex<Ros2Emulator>>;
pub type InProcessRos2 = crate::topic_robot::InProcessRobot<Ros2Emulator>;
