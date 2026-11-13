use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);

pub fn stop_requested() -> bool {
    STOP_REQUESTED.load(Ordering::Relaxed)
}

pub fn should_stop(folder: &Path) -> bool {
    stop_requested() || folder.join("stop").exists()
}

#[cfg(unix)]
mod signals {
    use super::{Ordering, STOP_REQUESTED};
    use std::ffi::c_int;

    const SIGINT: c_int = 2;
    const SIGTERM: c_int = 15;

    extern "C" {
        fn signal(number: c_int, handler: extern "C" fn(c_int)) -> usize;
    }

    extern "C" fn request_stop(_: c_int) {
        STOP_REQUESTED.store(true, Ordering::Relaxed);
    }

    pub fn install() {
        unsafe {
            signal(SIGTERM, request_stop);
            signal(SIGINT, request_stop);
        }
    }
}

#[cfg(not(unix))]
mod signals {
    pub fn install() {}
}

pub fn install_stop_handlers() {
    signals::install();
}

#[cfg(target_os = "macos")]
pub fn raise_thread_priority() {
    const QOS_CLASS_USER_INTERACTIVE: u32 = 0x21;

    extern "C" {
        fn pthread_set_qos_class_self_np(qos: u32, relative: i32) -> i32;
    }

    unsafe { pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0) };
}

#[cfg(not(target_os = "macos"))]
pub fn raise_thread_priority() {}
