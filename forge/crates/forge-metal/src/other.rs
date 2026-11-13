use crate::{BufferId, Dispatch, Plain, Timing, NEEDS_A_MAC};

pub struct Kernel;

impl Kernel {
    pub fn max_group(&self) -> usize {
        1
    }

    pub fn simd_width(&self) -> usize {
        1
    }
}

pub struct Gpu;

impl Gpu {
    pub fn new() -> Result<Self, String> {
        Err(NEEDS_A_MAC.to_owned())
    }

    pub fn name(&self) -> String {
        String::new()
    }

    pub fn compile(&self, _source: &str, _names: &[&str]) -> Result<Vec<Kernel>, String> {
        Err(NEEDS_A_MAC.to_owned())
    }

    pub fn alloc<T: Plain>(&mut self, _len: usize) -> Result<BufferId<T>, String> {
        Err(NEEDS_A_MAC.to_owned())
    }

    pub fn slice<T: Plain>(&self, _id: BufferId<T>) -> &[T] {
        &[]
    }

    pub fn slice_mut<T: Plain>(&mut self, _id: BufferId<T>) -> &mut [T] {
        &mut []
    }

    pub fn run(&mut self, _dispatches: &[Dispatch]) -> Result<Timing, String> {
        Err(NEEDS_A_MAC.to_owned())
    }

    pub fn run_chain(&mut self, _lists: &[&[Dispatch]]) -> Result<Vec<Timing>, String> {
        Err(NEEDS_A_MAC.to_owned())
    }
}
