use super::sink::split;

pub const CASES: usize = 16;
pub const SLOTS: usize = 8 * CASES;
const TOLERANCE: f64 = 1e-12;
const NAMES: [&str; 6] = ["add", "subtract", "multiply", "divide", "square root", "sine"];

fn case(i: usize) -> (f64, f64) {
    let x = i as f64 + 1.0;
    let a = (x * 0.731_234_567_891_234_5).sin() * 10f64.powi(i as i32 % 4 - 2) + 0.3;
    let b = (x * 1.377_215_964_123_456).cos() * 10f64.powi(3 - i as i32 % 5) - 0.7;

    (a, b)
}

fn rounded(x: f64) -> f64 {
    let (hi, lo) = split(x);

    f64::from(hi) + f64::from(lo)
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

pub fn inputs() -> Vec<(f64, f64)> {
    (0..CASES)
        .map(|i| {
            let (a, b) = case(i);

            (rounded(a), rounded(b))
        })
        .collect()
}

pub fn load(io: &mut [f32], inputs: &[(f64, f64)]) {
    for (i, (a, b)) in inputs.iter().enumerate() {
        put(io, 8 * i, *a);
        put(io, 8 * i + 1, *b);
    }
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

pub fn check(io: &[f32], inputs: &[(f64, f64)]) -> Result<(), String> {
    let (error, op) = worst(io, inputs);

    if error > TOLERANCE {
        return Err(format!(
            "This GPU computes Forge's double-float {} to {error:.1e}, and parity needs {TOLERANCE:.0e}",
            NAMES[op]
        ));
    }

    Ok(())
}
