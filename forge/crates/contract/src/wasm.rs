use std::slice;

const NOT_UTF8: &str = "{\"error\":\"The text is not UTF-8\"}";

fn pack(reply: String) -> u64 {
    let bytes = reply.into_bytes().into_boxed_slice();
    let len = bytes.len() as u64;
    let ptr = Box::into_raw(bytes) as *mut u8 as usize as u64;

    (ptr << 32) | len
}

unsafe fn text<'a>(ptr: *const u8, len: usize) -> Option<&'a str> {
    std::str::from_utf8(slice::from_raw_parts(ptr, len)).ok()
}

#[no_mangle]
pub extern "C" fn contract_alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}

#[no_mangle]
pub unsafe extern "C" fn contract_free(ptr: *mut u8, len: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
}

#[no_mangle]
pub unsafe extern "C" fn contract_evaluate(
    contract_ptr: *const u8,
    contract_len: usize,
    trace_ptr: *const u8,
    trace_len: usize,
) -> u64 {
    let reply = match (text(contract_ptr, contract_len), text(trace_ptr, trace_len)) {
        (Some(contract), Some(trace)) => crate::evaluate_reply(contract, trace),
        _ => String::from(NOT_UTF8),
    };

    pack(reply)
}

#[no_mangle]
pub unsafe extern "C" fn contract_check(contract_ptr: *const u8, contract_len: usize) -> u64 {
    let reply = match text(contract_ptr, contract_len) {
        Some(contract) => crate::check_reply(contract),
        None => String::from(NOT_UTF8),
    };

    pack(reply)
}
