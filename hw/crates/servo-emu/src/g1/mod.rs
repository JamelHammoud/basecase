mod joint;
mod robot;
mod serve;

pub use crate::joint::{Gains, Hidden};
pub use crate::loopback::LoopbackLink;
pub use crate::topic_robot::SampleFilter;
pub use joint::{own_gains, STAND_POSE};
pub use robot::{G1Counters, G1Emulator, G1Fault, G1Options, MODE_MACHINE, STATE_EVERY_US};
pub use serve::{serve_loopback, LoopbackG1};

pub type SharedG1 = std::sync::Arc<std::sync::Mutex<G1Emulator>>;
pub type InProcessG1 = crate::topic_robot::InProcessRobot<G1Emulator>;
