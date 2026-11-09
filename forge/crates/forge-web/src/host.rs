#[link(wasm_import_module = "forge")]
extern "C" {
    fn now_ms() -> f64;
    fn emit(ptr: *const u8, len: usize);
    fn gpu_workgroup_bytes() -> u32;
    fn gpu_open() -> i32;
    fn gpu_load(batch: i32, source: *const u8, source_len: usize, tables: *const u32) -> i32;
    fn gpu_run(batch: i32, call: *const u32) -> i32;
    fn gpu_error(ptr: *mut u8, cap: usize) -> usize;
}

pub struct Tables<'a> {
    pub reals: &'a [f32],
    pub ints: &'a [i32],
    pub sizes: [usize; 4],
}

pub struct Run<'a> {
    pub entry: u32,
    pub groups: u32,
    pub params: [u32; 4],
    pub io: &'a mut [f32],
    pub order: &'a [u32],
    pub stats: &'a mut [i32],
}

fn address<T>(ptr: *const T) -> u32 {
    ptr as usize as u32
}

pub fn now() -> f64 {
    unsafe { now_ms() / 1000.0 }
}

pub fn send(text: &str) {
    unsafe { emit(text.as_ptr(), text.len()) }
}

pub fn workgroup_bytes() -> usize {
    unsafe { gpu_workgroup_bytes() as usize }
}

pub fn open() -> i32 {
    unsafe { gpu_open() }
}

fn last_error() -> String {
    let mut buffer = vec![0u8; 4096];
    let len = unsafe { gpu_error(buffer.as_mut_ptr(), buffer.len()) }.min(buffer.len());

    String::from_utf8_lossy(&buffer[..len]).into_owned()
}

fn checked(code: i32) -> Result<(), String> {
    if code == 0 {
        Ok(())
    } else {
        Err(last_error())
    }
}

pub fn load(batch: i32, source: &str, tables: &Tables) -> Result<(), String> {
    let s = tables.sizes;
    let words = [
        address(tables.reals.as_ptr()),
        tables.reals.len() as u32,
        address(tables.ints.as_ptr()),
        tables.ints.len() as u32,
        s[0] as u32,
        s[1] as u32,
        s[2] as u32,
        s[3] as u32,
    ];

    checked(unsafe { gpu_load(batch, source.as_ptr(), source.len(), words.as_ptr()) })
}

pub fn run(batch: i32, call: Run) -> Result<(), String> {
    let p = call.params;
    let words = [
        call.entry,
        call.groups,
        p[0],
        p[1],
        p[2],
        p[3],
        address(call.io.as_mut_ptr().cast_const()),
        call.io.len() as u32,
        address(call.order.as_ptr()),
        call.order.len() as u32,
        address(call.stats.as_mut_ptr().cast_const()),
        call.stats.len() as u32,
    ];

    checked(unsafe { gpu_run(batch, words.as_ptr()) })
}
