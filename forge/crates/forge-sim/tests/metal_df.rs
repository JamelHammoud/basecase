#![cfg(target_os = "macos")]

use forge_metal::{Dispatch, Gpu};

const DF: &str = include_str!("../src/metal/shaders/df.metal");
const KERNEL: &str = r"
kernel void ops(device const float4 *in [[buffer(0)]], device float2 *out [[buffer(1)]],
                uint t [[thread_position_in_grid]]) {
    df a = df{in[t].x, in[t].y};
    df b = df{in[t].z, in[t].w};
    df r[6] = {a + b, a - b, a * b, a / b, dsqrt(dabs(a)), (a + b) - a - b};
    for (int k = 0; k < 6; k++) {
        out[6 * t + k] = float2(r[k].hi, r[k].lo);
    }
}
";
const N: usize = 4096;

fn split(x: f64) -> [f32; 2] {
    let hi = x as f32;

    [hi, (x - f64::from(hi)) as f32]
}

fn sample(i: usize) -> (f64, f64) {
    let a = (i as f64 * 0.618_033_988_749_894_9).sin() * 10f64.powi((i % 9) as i32 - 4);
    let b = (i as f64 * 0.414_213_562_373_095).cos() * 10f64.powi((i % 7) as i32 - 3) + 1e-9;

    (a, b)
}

fn expected(a: f64, b: f64) -> [f64; 6] {
    [a + b, a - b, a * b, a / b, a.abs().sqrt(), (a + b) - a - b]
}

#[test]
fn double_float_arithmetic_on_the_gpu_tracks_f64() {
    let mut gpu = Gpu::new().expect("a Metal device");
    let kernels = gpu.compile(&format!("{DF}\n{KERNEL}"), &["ops"]).expect("compiles");
    let input = gpu.alloc::<f32>(4 * N).expect("input");
    let output = gpu.alloc::<f32>(12 * N).expect("output");
    let pairs: Vec<(f64, f64)> = (0..N).map(sample).collect();

    for (slot, (a, b)) in gpu.slice_mut(input).as_chunks_mut::<4>().0.iter_mut().zip(&pairs) {
        let (sa, sb) = (split(*a), split(*b));

        *slot = [sa[0], sa[1], sb[0], sb[1]];
    }

    let dispatch = Dispatch {
        kernel: &kernels[0],
        args: vec![input.arg(), output.arg()],
        threads: N,
        group: 64,
    };

    gpu.run(&[dispatch]).expect("runs");

    let out = gpu.slice(output);
    let mut worst = 0.0f64;

    for (i, (a, b)) in pairs.iter().enumerate() {
        let (a, b) = (
            f64::from(split(*a)[0]) + f64::from(split(*a)[1]),
            f64::from(split(*b)[0]) + f64::from(split(*b)[1]),
        );

        for (k, want) in expected(a, b).iter().enumerate() {
            let got = f64::from(out[12 * i + 2 * k]) + f64::from(out[12 * i + 2 * k + 1]);
            let scale = if matches!(k, 0 | 1 | 5) {
                a.abs() + b.abs()
            } else {
                want.abs().max(1e-30)
            };

            worst = worst.max((got - want).abs() / scale);
        }
    }

    assert!(worst < 1e-13, "worst relative error {worst:e}");
}
