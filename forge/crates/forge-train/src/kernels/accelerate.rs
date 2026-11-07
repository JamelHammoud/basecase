use super::Shape;
use std::ffi::c_int;

const ROW_MAJOR: c_int = 101;
const NO_TRANS: c_int = 111;
const TRANS: c_int = 112;

#[link(name = "Accelerate", kind = "framework")]
extern "C" {
    #[allow(clippy::too_many_arguments)]
    fn cblas_sgemm(
        order: c_int,
        trans_a: c_int,
        trans_b: c_int,
        m: c_int,
        n: c_int,
        k: c_int,
        alpha: f32,
        a: *const f32,
        lda: c_int,
        b: *const f32,
        ldb: c_int,
        beta: f32,
        c: *mut f32,
        ldc: c_int,
    );
}

pub fn multiply(out: &mut [f32], a: &[f32], b: &[f32], s: Shape) {
    let (m, n, k) = (s.rows as c_int, s.cols as c_int, s.inner as c_int);

    unsafe {
        cblas_sgemm(
            ROW_MAJOR,
            NO_TRANS,
            NO_TRANS,
            m,
            n,
            k,
            1.0,
            a.as_ptr(),
            k,
            b.as_ptr(),
            n,
            0.0,
            out.as_mut_ptr(),
            n,
        )
    };
}

pub fn multiply_by_transpose(out: &mut [f32], g: &[f32], w: &[f32], s: Shape) {
    let (m, n, k) = (s.rows as c_int, s.cols as c_int, s.inner as c_int);

    unsafe {
        cblas_sgemm(
            ROW_MAJOR,
            NO_TRANS,
            TRANS,
            m,
            k,
            n,
            1.0,
            g.as_ptr(),
            n,
            w.as_ptr(),
            n,
            0.0,
            out.as_mut_ptr(),
            k,
        )
    };
}

pub fn transpose_multiply(out: &mut [f32], a: &[f32], g: &[f32], s: Shape) {
    let (m, n, k) = (s.rows as c_int, s.cols as c_int, s.inner as c_int);

    unsafe {
        cblas_sgemm(
            ROW_MAJOR,
            TRANS,
            NO_TRANS,
            k,
            n,
            m,
            1.0,
            a.as_ptr(),
            k,
            g.as_ptr(),
            n,
            0.0,
            out.as_mut_ptr(),
            n,
        )
    };
}
