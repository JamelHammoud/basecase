use super::engine::{Engine, Entry, QUALIFY_CASES};
use crate::gpu::sink::split;

const TOLERANCE: f64 = 1e-12;

fn case(i: usize) -> (f64, f64) {
    let x = i as f64 + 1.0;
    let a = (x * 0.731_234_567_891_234_5).sin() * 10f64.powi(i as i32 % 4 - 2) + 0.3;
    let b = (x * 1.377_215_964_123_456).cos() * 10f64.powi(3 - i as i32 % 5) - 0.7;

    (a, b)
}

fn joined(io: &[f32], slot: usize) -> f64 {
    f64::from(io[2 * slot]) + f64::from(io[2 * slot + 1])
}

fn put(io: &mut [f32], slot: usize, x: f64) {
    let (hi, lo) = split(x);

    io[2 * slot] = hi;
    io[2 * slot + 1] = lo;
}

fn truth(a: f64, b: f64) -> [f64; 6] {
    [a + b, a - b, a * b, a / b, a.abs().sqrt(), a.sin()]
}

fn worst(io: &[f32], inputs: &[(f64, f64)]) -> (f64, usize) {
    let mut worst = (0.0, 0);

    for (i, (a, b)) in inputs.iter().enumerate() {
        for (k, want) in truth(*a, *b).iter().enumerate() {
            let got = joined(io, 8 * i + 2 + k);
            let error = (got - want).abs() / want.abs().max(1.0);

            if error.is_nan() || error > worst.0 {
                worst = (if error.is_nan() { f64::INFINITY } else { error }, k);
            }
        }
    }

    worst
}

pub fn qualify(engine: &mut Engine) -> Result<(), String> {
    let inputs: Vec<(f64, f64)> = (0..QUALIFY_CASES)
        .map(|i| {
            let (a, b) = case(i);

            (
                f64::from(split(a).0) + f64::from(split(a).1),
                f64::from(split(b).0) + f64::from(split(b).1),
            )
        })
        .collect();

    for (i, (a, b)) in inputs.iter().enumerate() {
        put(&mut engine.io, 8 * i, *a);
        put(&mut engine.io, 8 * i + 1, *b);
    }

    engine.dispatch(Entry::Qualify, [QUALIFY_CASES as u32, 0, 0])?;

    let (error, op) = worst(&engine.io, &inputs);

    if error > TOLERANCE {
        let names = ["add", "subtract", "multiply", "divide", "square root", "sine"];

        return Err(format!(
            "This GPU computes Forge's double-float {} to {error:.1e}, and parity needs {TOLERANCE:.0e}",
            names[op]
        ));
    }

    Ok(())
}
