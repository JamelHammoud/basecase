mod decode;
mod detect;
mod geometry;
mod image;
mod quad;
mod refine;
mod segment;

use std::cell::UnsafeCell;

pub const MAX_DETECTIONS: usize = 64;
const RESULT_STRIDE: usize = 10;

struct State {
    book: decode::Codebook,
    gray: Vec<u8>,
    work: detect::Workspace,
    results: Vec<f32>,
}

struct Global(UnsafeCell<Option<State>>);

unsafe impl Sync for Global {}

static STATE: Global = Global(UnsafeCell::new(None));

fn state() -> &'static mut State {
    unsafe {
        (*STATE.0.get()).get_or_insert_with(|| State {
            book: decode::Codebook::empty(),
            gray: Vec::new(),
            work: detect::Workspace::default(),
            results: Vec::with_capacity(MAX_DETECTIONS * RESULT_STRIDE),
        })
    }
}

#[no_mangle]
pub extern "C" fn tags_alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}

#[no_mangle]
pub unsafe extern "C" fn tags_free(ptr: *mut u8, len: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
}

#[no_mangle]
pub unsafe extern "C" fn tags_init(codes: *const u8, count: usize, bit_x: *const u8, bit_y: *const u8) {
    let bytes = std::slice::from_raw_parts(codes, count * 8);
    let xs = std::slice::from_raw_parts(bit_x, decode::CODE_BITS);
    let ys = std::slice::from_raw_parts(bit_y, decode::CODE_BITS);

    state().book = decode::Codebook::new(bytes, xs, ys);
}

#[no_mangle]
pub extern "C" fn tags_frame(width: usize, height: usize) -> *mut u8 {
    let s = state();

    s.gray.resize(width * height, 0);
    s.gray.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn tags_detect(width: usize, height: usize) -> usize {
    let s = state();

    s.results.clear();

    if s.gray.len() < width * height {
        return 0;
    }

    let found = detect::detect(&s.gray[..width * height], width, height, &s.book, &mut s.work);

    for d in found.iter().take(MAX_DETECTIONS) {
        s.results.push(d.id as f32);
        s.results.push(d.hamming as f32);

        for c in d.corners.iter() {
            s.results.push(c[0] as f32);
            s.results.push(c[1] as f32);
        }
    }

    s.results.len() / RESULT_STRIDE
}

#[no_mangle]
pub extern "C" fn tags_results() -> *const f32 {
    state().results.as_ptr()
}
