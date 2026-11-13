use std::sync::atomic::{AtomicBool, Ordering};

static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);

pub fn stop_requested() -> bool {
    STOP_REQUESTED.load(Ordering::Relaxed)
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
mod qos {
    pub const USER_INTERACTIVE: u32 = 0x21;
    pub const UTILITY: u32 = 0x11;

    extern "C" {
        fn pthread_set_qos_class_self_np(qos: u32, relative: i32) -> i32;
    }

    pub fn set(class: u32) {
        unsafe { pthread_set_qos_class_self_np(class, 0) };
    }
}

#[cfg(target_os = "macos")]
pub fn raise_thread_priority() {
    qos::set(qos::USER_INTERACTIVE);
}

#[cfg(target_os = "macos")]
pub fn lower_thread_priority() {
    qos::set(qos::UTILITY);
}

#[cfg(not(target_os = "macos"))]
pub fn raise_thread_priority() {}

#[cfg(not(target_os = "macos"))]
pub fn lower_thread_priority() {}
