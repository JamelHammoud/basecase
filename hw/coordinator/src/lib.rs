#![cfg_attr(
    not(test),
    deny(
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::panic,
        clippy::indexing_slicing
    )
)]

mod body;
pub mod cond;
pub mod control;
pub mod facts;
pub mod ffi;
mod fibers;
pub mod json;
pub mod machine;
mod ops;
pub mod plan;
mod plan_read;
mod reactions;
pub mod slots;
pub mod trace;

pub use control::{ControlCommand, ControlReader};
pub use facts::{Fact, FactBoard, NO_SYMBOL};
pub use machine::{Coordinator, Status};
pub use plan::{LoadError, Plan};
pub use slots::{Intent, IntentSlot, NO_SKILL};
pub use trace::{Event, EventKind};
