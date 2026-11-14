#![doc = include_str!("../compile_fail.md")]

pub mod artefacts;
pub mod calibration;
pub mod caps;
pub mod control;
pub mod fault;
pub mod g1;
pub mod intent;
pub mod ladder;
pub mod monitor;
pub mod policy;
pub mod protocol;
pub mod ros2;
pub mod runner;
pub mod safety;
pub mod session;
pub mod stop;
pub mod telemetry;
pub mod transport;
pub mod units;
pub mod watchdog;

pub use control::{Command, Daemon, DaemonConfig, DaemonEvent, Inputs, Run};
