#![doc = include_str!("../compile_fail.md")]

pub mod artefacts;
pub mod calibration;
pub mod caps;
pub mod control;
pub mod fault;
pub mod intent;
pub mod ladder;
pub mod monitor;
pub mod policy;
pub mod protocol;
pub mod runner;
pub mod safety;
pub mod stop;
pub mod telemetry;
pub mod transport;
pub mod watchdog;

pub use control::{Command, Daemon, DaemonConfig, DaemonEvent, Inputs, Run};
