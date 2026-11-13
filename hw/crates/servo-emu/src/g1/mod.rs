mod inprocess;
mod joint;
mod loopback;
mod robot;

pub use inprocess::InProcessG1;
pub use joint::{own_gains, Gains, Hidden, STAND_POSE};
pub use loopback::{serve_loopback, LoopbackG1, LoopbackLink};
pub use robot::{G1Counters, G1Emulator, G1Fault, G1Options, MODE_MACHINE, STATE_EVERY_US};

pub type SharedG1 = std::sync::Arc<std::sync::Mutex<G1Emulator>>;
