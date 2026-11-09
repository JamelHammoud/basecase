use super::source::K;
use forge_sim::metal::gpu::{Arg, Dispatch, Kernel};

const TILE: usize = 32;
const KT: usize = 16;
const THREADS: usize = 128;
const ROWS_PER_SLICE: usize = 128;
const MAX_SLICES: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ones {
    None = 0,
    Column = 1,
    Row = 2,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Finish {
    Store = 0,
    Elu = 1,
    Slope = 2,
}

#[derive(Clone, Copy, Debug)]
pub struct Shape {
    pub m: usize,
    pub n: usize,
    pub k: usize,
    pub lda: usize,
    pub ldb: usize,
    pub ldc: usize,
}

#[derive(Clone, Copy, Debug)]
pub struct Offsets {
    pub a: usize,
    pub b: usize,
    pub c: usize,
    pub h: usize,
    pub ldh: usize,
}

pub const AT_ZERO: Offsets = Offsets {
    a: 0,
    b: 0,
    c: 0,
    h: 0,
    ldh: 0,
};

pub struct Operands {
    pub a: Arg<'static>,
    pub b: Arg<'static>,
    pub c: Arg<'static>,
    pub h: Arg<'static>,
}

pub struct Gemm {
    pub kernel: K,
    pub shape: Shape,
    pub at: Offsets,
    pub ones: Ones,
    pub finish: Finish,
    pub slices: usize,
}

pub fn slices_for(rows: usize) -> usize {
    (rows / ROWS_PER_SLICE).clamp(1, MAX_SLICES)
}

pub fn dispatch<'a>(kernels: &'a [Kernel], gemm: &Gemm, operands: Operands) -> Dispatch<'a> {
    let Shape { m, n, k, lda, ldb, ldc } = gemm.shape;
    let slices = gemm.slices.max(1);
    let slice_len = k.div_ceil(slices).div_ceil(KT) * KT;
    let used = k.div_ceil(slice_len);
    let words = [
        m,
        n,
        k,
        lda,
        ldb,
        ldc,
        gemm.at.a,
        gemm.at.b,
        gemm.at.c,
        gemm.ones as usize,
        gemm.finish as usize,
        gemm.at.h,
        gemm.at.ldh,
        slice_len,
    ];
    let groups = m.div_ceil(TILE) * n.div_ceil(TILE) * used;

    Dispatch {
        kernel: &kernels[gemm.kernel as usize],
        args: vec![
            operands.a,
            operands.b,
            operands.c,
            operands.h,
            Arg::Owned(words.iter().map(|w| *w as u32).collect()),
        ],
        threads: groups * THREADS,
        group: THREADS,
    }
}

pub fn used_slices(k: usize, slices: usize) -> usize {
    let slice_len = k.div_ceil(slices.max(1)).div_ceil(KT) * KT;

    k.div_ceil(slice_len)
}
