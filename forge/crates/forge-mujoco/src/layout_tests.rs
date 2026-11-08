use crate::ffi;
use std::ffi::c_int;
use std::mem::{offset_of, size_of};

extern "C" {
    fn forge_header_version() -> c_int;
    fn forge_library_version() -> c_int;
    fn forge_batch_config_size() -> c_int;
    fn forge_batch_config_nthread_offset() -> c_int;
    fn forge_batch_config_persistent_offset() -> c_int;
}

#[test]
fn batch_config_matches_the_header() {
    let (size, nthread, persistent) = unsafe {
        (
            forge_batch_config_size(),
            forge_batch_config_nthread_offset(),
            forge_batch_config_persistent_offset(),
        )
    };

    assert_eq!(size_of::<ffi::MjBatchConfig>(), size as usize);
    assert_eq!(offset_of!(ffi::MjBatchConfig, nthread), nthread as usize);
    assert_eq!(offset_of!(ffi::MjBatchConfig, persistent), persistent as usize);
}

#[test]
fn linked_library_matches_the_headers() {
    let (header, library) = unsafe { (forge_header_version(), forge_library_version()) };
    let expected = format!("{}.{}.{}", header / 1_000_000, header / 1000 % 1000, header % 1000);

    assert_eq!(header, library);
    assert_eq!(crate::version(), expected);
}
