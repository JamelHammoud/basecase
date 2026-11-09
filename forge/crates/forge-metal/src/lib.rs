mod plain;

#[cfg(target_os = "macos")]
mod mac;
#[cfg(not(target_os = "macos"))]
mod other;

#[cfg(target_os = "macos")]
pub use mac::{Gpu, Kernel};
#[cfg(not(target_os = "macos"))]
pub use other::{Gpu, Kernel};
pub use plain::Plain;

use std::marker::PhantomData;

pub const NEEDS_A_MAC: &str = "Forge's Metal backend needs a Mac with Apple silicon";

pub struct BufferId<T: Plain> {
    index: usize,
    len: usize,
    kind: PhantomData<T>,
}

impl<T: Plain> Clone for BufferId<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T: Plain> Copy for BufferId<T> {}

impl<T: Plain> BufferId<T> {
    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn arg(&self) -> Arg<'static> {
        Arg::Buffer(self.index)
    }

    pub fn at(&self, offset: usize) -> Arg<'static> {
        Arg::At(self.index, offset * std::mem::size_of::<T>())
    }
}

pub enum Arg<'a> {
    Buffer(usize),
    At(usize, usize),
    Words(&'a [u32]),
    Owned(Vec<u32>),
}

impl Arg<'_> {
    pub fn buffer(&self) -> Option<(usize, usize)> {
        match self {
            Arg::Buffer(slot) => Some((*slot, 0)),
            Arg::At(slot, bytes) => Some((*slot, *bytes)),
            _ => None,
        }
    }

    pub fn floats(values: &[f32]) -> Arg<'static> {
        Arg::Owned(values.iter().map(|v| v.to_bits()).collect())
    }

    pub fn words(&self) -> Option<&[u32]> {
        match self {
            Arg::Buffer(_) | Arg::At(..) => None,
            Arg::Words(words) => Some(words),
            Arg::Owned(words) => Some(words),
        }
    }
}

pub struct Dispatch<'a> {
    pub kernel: &'a Kernel,
    pub args: Vec<Arg<'a>>,
    pub threads: usize,
    pub group: usize,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Timing {
    pub gpu_seconds: f64,
}
