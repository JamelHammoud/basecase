use crate::fields;
use crate::train::{self, Start};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::slice;

thread_local! {
    static REPLY: RefCell<String> = const { RefCell::new(String::new()) };
}

fn reply(value: Value) -> u64 {
    REPLY.with_borrow_mut(|r| {
        *r = value.to_string();

        ((r.as_ptr() as usize as u64) << 32) | r.len() as u64
    })
}

unsafe fn bytes<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if len == 0 {
        return &[];
    }

    slice::from_raw_parts(ptr, len)
}

unsafe fn text(ptr: *const u8, len: usize) -> String {
    String::from_utf8_lossy(bytes(ptr, len)).into_owned()
}

#[no_mangle]
pub extern "C" fn forge_alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len.max(1)].into_boxed_slice()) as *mut u8
}

#[no_mangle]
pub unsafe extern "C" fn forge_free(ptr: *mut u8, len: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len.max(1))));
}

#[no_mangle]
pub extern "C" fn forge_reset() {
    fields::reset();
}

#[no_mangle]
pub unsafe extern "C" fn forge_field(kind: u32, at: *const u8, name_len: usize, data_len: usize) {
    fields::set(kind, &text(at, name_len), bytes(at.add(name_len), data_len));
}

#[no_mangle]
pub extern "C" fn forge_prepare() -> u64 {
    reply(fields::prepare())
}

#[no_mangle]
pub extern "C" fn forge_stop() {
    train::stop();
}

fn start(header: &Value, row: Vec<f64>) -> Start {
    Start {
        job: header["job"].clone(),
        row,
        holds_pose: header["holdsPose"].as_bool().unwrap_or(true),
        z0: header["z0"].as_f64().unwrap_or(0.0),
        warm: header["warm"].as_str().map(str::to_owned),
        version: header["mujoco"].as_str().unwrap_or_default().to_owned(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn forge_train(header: *const u8, header_len: usize, row: *const f64, row_len: usize) -> u64 {
    let parsed: Result<Value, _> = serde_json::from_slice(bytes(header, header_len));
    let row = if row_len == 0 {
        Vec::new()
    } else {
        slice::from_raw_parts(row, row_len).to_vec()
    };
    let result = parsed
        .map_err(|e| format!("The training request isn't JSON: {e}"))
        .and_then(|h| train::train(start(&h, row)));

    reply(match result {
        Ok(done) => json!({ "ok": true, "done": done }),
        Err(error) => json!({ "ok": false, "error": error }),
    })
}
