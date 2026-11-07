use super::{Math, Shape};
use crate::rng::Rng;

fn random(n: usize, seed: u64) -> Vec<f32> {
    let mut rng = Rng::new(seed, 0);

    (0..n).map(|_| rng.normal() as f32).collect()
}

fn naive(a: &[f32], b: &[f32], s: Shape) -> Vec<f32> {
    let mut out = vec![0.0f32; s.rows * s.cols];

    for r in 0..s.rows {
        for k in 0..s.inner {
            for c in 0..s.cols {
                out[r * s.cols + c] += a[r * s.inner + k] * b[k * s.cols + c];
            }
        }
    }

    out
}

fn close(a: &[f32], b: &[f32]) {
    for (x, y) in a.iter().zip(b) {
        assert!((x - y).abs() < 2e-3, "{x} against {y}");
    }
}

fn check_all(math: &Math) {
    for &(rows, inner, cols) in &[(7usize, 13usize, 5usize), (64, 48, 256), (16, 256, 128), (3, 2, 1)] {
        let s = Shape { rows, inner, cols };
        let a = random(rows * inner, 1);
        let b = random(inner * cols, 2);
        let g = random(rows * cols, 3);
        let mut out = vec![9.0f32; rows * cols];

        math.multiply(&mut out, &a, &b, s);
        close(&out, &naive(&a, &b, s));

        let mut scratch = vec![0.0f32; inner * cols];
        let mut by_transpose = vec![9.0f32; rows * inner];
        let wt: Vec<f32> = (0..cols)
            .flat_map(|c| {
                let b = &b;

                (0..inner).map(move |k| b[k * cols + c])
            })
            .collect();

        math.multiply_by_transpose(&mut by_transpose, &g, &b, s, &mut scratch);
        close(
            &by_transpose,
            &naive(
                &g,
                &wt,
                Shape {
                    rows,
                    inner: cols,
                    cols: inner,
                },
            ),
        );

        let mut transposed = vec![9.0f32; inner * cols];
        let at: Vec<f32> = (0..inner)
            .flat_map(|k| {
                let a = &a;

                (0..rows).map(move |r| a[r * inner + k])
            })
            .collect();

        math.transpose_multiply(&mut transposed, &a, &g, s);
        close(
            &transposed,
            &naive(
                &at,
                &g,
                Shape {
                    rows: inner,
                    inner: rows,
                    cols,
                },
            ),
        );
    }
}

#[test]
fn portable_kernels_match_the_definition() {
    check_all(&Math::portable(1));
    check_all(&Math::portable(4));
}

#[test]
fn native_kernels_match_the_definition() {
    check_all(&Math::native(4));
}
