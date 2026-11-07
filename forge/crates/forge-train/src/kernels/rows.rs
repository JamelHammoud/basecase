use super::Shape;

const BLOCK: usize = 4;

#[inline(always)]
fn accumulate<const FUSED: bool>(out: &mut [f32], scale: [f32; BLOCK], block: [&[f32]; BLOCK]) {
    let n = out.len();
    let [x0, x1, x2, x3] = block.map(|s| &s[..n]);

    for i in 0..n {
        let sum = if FUSED {
            x3[i].mul_add(
                scale[3],
                x2[i].mul_add(scale[2], x1[i].mul_add(scale[1], x0[i].mul_add(scale[0], out[i]))),
            )
        } else {
            out[i] + x0[i] * scale[0] + x1[i] * scale[1] + x2[i] * scale[2] + x3[i] * scale[3]
        };

        out[i] = sum;
    }
}

#[inline(always)]
fn add_scaled<const FUSED: bool>(out: &mut [f32], scale: f32, x: &[f32]) {
    for (o, v) in out.iter_mut().zip(x) {
        *o = if FUSED { v.mul_add(scale, *o) } else { *o + v * scale };
    }
}

#[inline(always)]
fn multiply_rows_body<const FUSED: bool>(out: &mut [f32], a: &[f32], b: &[f32], shape: Shape) {
    let Shape { inner, cols, .. } = shape;

    for (row, a_row) in out.chunks_exact_mut(cols).zip(a.chunks_exact(inner)) {
        row.fill(0.0);

        let mut k = 0;

        while k + BLOCK <= inner {
            let scale = [a_row[k], a_row[k + 1], a_row[k + 2], a_row[k + 3]];
            let block = [0, 1, 2, 3].map(|j| &b[(k + j) * cols..(k + j + 1) * cols]);

            accumulate::<FUSED>(row, scale, block);
            k += BLOCK;
        }

        while k < inner {
            add_scaled::<FUSED>(row, a_row[k], &b[k * cols..(k + 1) * cols]);
            k += 1;
        }
    }
}

#[inline(always)]
fn transposed_rows_body<const FUSED: bool>(out: &mut [f32], first: usize, a: &[f32], g: &[f32], shape: Shape) {
    let Shape { rows, inner, cols } = shape;

    for (offset, row) in out.chunks_exact_mut(cols).enumerate() {
        let index = first + offset;

        row.fill(0.0);

        let mut s = 0;

        while s + BLOCK <= rows {
            let scale = [0, 1, 2, 3].map(|j| a[(s + j) * inner + index]);
            let block = [0, 1, 2, 3].map(|j| &g[(s + j) * cols..(s + j + 1) * cols]);

            accumulate::<FUSED>(row, scale, block);
            s += BLOCK;
        }

        while s < rows {
            add_scaled::<FUSED>(row, a[s * inner + index], &g[s * cols..(s + 1) * cols]);
            s += 1;
        }
    }
}

#[cfg(target_arch = "aarch64")]
pub fn multiply_rows(out: &mut [f32], a: &[f32], b: &[f32], shape: Shape) {
    multiply_rows_body::<true>(out, a, b, shape);
}

#[cfg(target_arch = "aarch64")]
pub fn transposed_rows(out: &mut [f32], first: usize, a: &[f32], g: &[f32], shape: Shape) {
    transposed_rows_body::<true>(out, first, a, g, shape);
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn multiply_rows_avx2(out: &mut [f32], a: &[f32], b: &[f32], shape: Shape) {
    multiply_rows_body::<true>(out, a, b, shape);
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn transposed_rows_avx2(out: &mut [f32], first: usize, a: &[f32], g: &[f32], shape: Shape) {
    transposed_rows_body::<true>(out, first, a, g, shape);
}

#[cfg(target_arch = "x86_64")]
pub fn multiply_rows(out: &mut [f32], a: &[f32], b: &[f32], shape: Shape) {
    if std::is_x86_feature_detected!("avx2") && std::is_x86_feature_detected!("fma") {
        return unsafe { multiply_rows_avx2(out, a, b, shape) };
    }

    multiply_rows_body::<false>(out, a, b, shape);
}

#[cfg(target_arch = "x86_64")]
pub fn transposed_rows(out: &mut [f32], first: usize, a: &[f32], g: &[f32], shape: Shape) {
    if std::is_x86_feature_detected!("avx2") && std::is_x86_feature_detected!("fma") {
        return unsafe { transposed_rows_avx2(out, first, a, g, shape) };
    }

    transposed_rows_body::<false>(out, first, a, g, shape);
}

#[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
pub fn multiply_rows(out: &mut [f32], a: &[f32], b: &[f32], shape: Shape) {
    multiply_rows_body::<false>(out, a, b, shape);
}

#[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
pub fn transposed_rows(out: &mut [f32], first: usize, a: &[f32], g: &[f32], shape: Shape) {
    transposed_rows_body::<false>(out, first, a, g, shape);
}
