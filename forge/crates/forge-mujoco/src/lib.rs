mod batch;
mod ffi;
mod model;

pub use batch::{Batch, StateLayout};
pub use model::{Data, Field, Model};

use std::ffi::CStr;
use std::sync::Once;

static HANDLERS: Once = Once::new();

pub(crate) fn install_handlers() {
    HANDLERS.call_once(|| unsafe { ffi::forge_install_handlers() });
}

pub fn version() -> String {
    let raw = unsafe { CStr::from_ptr(ffi::mj_versionString()) };

    raw.to_string_lossy().into_owned()
}

pub fn integration_state() -> i32 {
    unsafe { ffi::forge_state_integration() }
}
