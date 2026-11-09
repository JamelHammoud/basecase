use super::source::K;
use forge_sim::metal::gpu::{Arg, Dispatch, Kernel};

const TILE: usize = 32;
const KT: usize = 16;
const THREADS: usize = 128;
const ROWS_PER_SLICE: usize = 128;
const MAX_SLICES: usize = 64;
const WORDS: usize = 14;

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

#[derive(Clone, Copy, Debug)]
pub struct Gemm {
    pub shape: Shape,
    pub at: Offsets,
    pub ones: Ones,
    pub finish: Finish,
    pub slices: usize,
}

pub struct Problem {
    pub gemm: Gemm,
    pub operands: Operands,
}

pub fn slices_for(rows: usize) -> usize {
    (rows / ROWS_PER_SLICE).clamp(1, MAX_SLICES)
}

fn slice_len(k: usize, slices: usize) -> usize {
    k.div_ceil(slices.max(1)).div_ceil(KT).max(1) * KT
}

pub fn used_slices(k: usize, slices: usize) -> usize {
    k.div_ceil(slice_len(k, slices))
}

fn words(gemm: &Gemm) -> [u32; WORDS] {
    let Shape { m, n, k, lda, ldb, ldc } = gemm.shape;
    let at = gemm.at;

    [
        m,
        n,
        k,
        lda,
        ldb,
        ldc,
        at.a,
        at.b,
        at.c,
        gemm.ones as usize,
        gemm.finish as usize,
        at.h,
        at.ldh,
        slice_len(k, gemm.slices),
    ]
    .map(|w| w as u32)
}

fn groups(gemm: &Gemm) -> usize {
    let Shape { m, n, k, .. } = gemm.shape;

    m.div_ceil(TILE) * n.div_ceil(TILE) * used_slices(k, gemm.slices)
}

fn again(arg: &Arg) -> Arg<'static> {
    arg.buffer()
        .map_or(Arg::Owned(vec![0]), |(slot, bytes)| Arg::At(slot, bytes))
}

pub fn dispatch<'a>(kernels: &'a [Kernel], kernel: K, problems: Vec<Problem>) -> Dispatch<'a> {
    let mut words = Vec::with_capacity(2 * WORDS);
    let mut args = Vec::with_capacity(9);
    let mut count = 0;

    for p in &problems {
        words.extend(self::words(&p.gemm));
        count += groups(&p.gemm);
    }

    for p in problems.iter().chain(problems.iter()).take(2) {
        let o = &p.operands;

        args.extend([again(&o.a), again(&o.b), again(&o.c), again(&o.h)]);
    }

    if problems.len() < 2 {
        words.extend([0; WORDS]);
    }

    args.push(Arg::Owned(words));

    Dispatch {
        kernel: &kernels[kernel as usize],
        args,
        threads: count * THREADS,
        group: THREADS,
    }
}
