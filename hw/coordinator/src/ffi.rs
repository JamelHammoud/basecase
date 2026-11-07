use std::cell::UnsafeCell;

use crate::control::ControlReader;
use crate::facts::Fact;
use crate::machine::Coordinator;

struct Host {
    coordinator: Coordinator,
    reader: ControlReader,
    tripped: bool,
    json_len: usize,
}

struct Global(UnsafeCell<Option<Host>>);

unsafe impl Sync for Global {}

static HOST: Global = Global(UnsafeCell::new(None));

fn with_host<R>(fallback: R, run: impl FnOnce(&mut Host) -> R) -> R {
    let slot = unsafe { &mut *HOST.0.get() };

    match slot.as_mut() {
        Some(host) => run(host),
        None => fallback,
    }
}

fn to_ms(value: f64) -> u64 {
    if value.is_finite() && value > 0.0 {
        value as u64
    } else {
        0
    }
}

#[no_mangle]
pub extern "C" fn coord_alloc(len: u32) -> *mut u8 {
    let mut bytes = Vec::<u8>::with_capacity(len as usize);
    let ptr = bytes.as_mut_ptr();

    std::mem::forget(bytes);

    ptr
}

#[no_mangle]
pub unsafe extern "C" fn coord_free(ptr: *mut u8, len: u32) {
    drop(unsafe { Vec::from_raw_parts(ptr, 0, len as usize) });
}

#[no_mangle]
pub unsafe extern "C" fn coord_load(ptr: *const u8, len: u32) -> i32 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len as usize) };
    let Ok(text) = std::str::from_utf8(bytes) else {
        return 1;
    };
    let Ok(coordinator) = Coordinator::from_json(text) else {
        return 2;
    };
    let plan = coordinator.plan();
    let reader = ControlReader::new(plan.control_deadline_ms, plan.safe_stop);
    let slot = unsafe { &mut *HOST.0.get() };

    *slot = Some(Host {
        coordinator,
        reader,
        tripped: false,
        json_len: 0,
    });

    0
}

#[no_mangle]
pub extern "C" fn coord_tick(now_ms: f64) -> u32 {
    with_host(0, |host| {
        host.coordinator.tick(to_ms(now_ms));

        host.coordinator.events().len() as u32
    })
}

#[no_mangle]
pub extern "C" fn coord_drain() -> u32 {
    with_host(0, |host| {
        host.json_len = host.coordinator.drain_json();

        host.json_len as u32
    })
}

#[no_mangle]
pub extern "C" fn coord_drain_ptr() -> *const u8 {
    with_host(std::ptr::null(), |host| host.coordinator.json_ptr())
}

#[no_mangle]
pub extern "C" fn coord_publish(fact: u32, num: f64, sym: i32, stamp_ms: f64) -> i32 {
    with_host(0, |host| {
        let value = Fact {
            num,
            sym,
            stamp_ms: to_ms(stamp_ms),
        };

        i32::from(host.coordinator.board().publish(fact as usize, value))
    })
}

#[no_mangle]
pub extern "C" fn coord_complete(token: i32, ok: i32, num: f64, sym: i32) -> i32 {
    with_host(0, |host| {
        i32::from(host.coordinator.complete(token, ok != 0, (num, sym)))
    })
}

#[no_mangle]
pub extern "C" fn coord_answer(token: i32, index: i32) -> i32 {
    with_host(0, |host| i32::from(host.coordinator.answer(token, index)))
}

#[no_mangle]
pub extern "C" fn coord_phase(token: i32) -> i32 {
    with_host(0, |host| i32::from(host.coordinator.phase(token)))
}

#[no_mangle]
pub extern "C" fn coord_stop() {
    with_host((), |host| host.coordinator.stop());
}

#[no_mangle]
pub extern "C" fn coord_watchers() -> u32 {
    with_host(0, |host| host.coordinator.watcher_mask())
}

#[no_mangle]
pub extern "C" fn coord_control(now_ms: f64) -> u32 {
    with_host(0xffff_ffff, |host| {
        let command = host.reader.read(host.coordinator.slot_ref(), to_ms(now_ms));

        host.tripped = command.tripped;

        (u32::from(command.head) << 16) | u32::from(command.body)
    })
}

#[no_mangle]
pub extern "C" fn coord_control_tripped() -> i32 {
    with_host(0, |host| i32::from(host.tripped))
}
