const LOG2_E: f32 = std::f32::consts::LOG2_E;
const LN2_HIGH: f32 = 0.693_359_4;
const LN2_LOW: f32 = -2.121_944_4e-4;
const LOWEST_EXPONENT: f32 = -87.0;
const ROUNDING_SHIFT: f32 = 12_582_912.0;

#[inline(always)]
fn exp_negative(x: f32) -> f32 {
    let clamped = x.max(LOWEST_EXPONENT);
    let shifted = clamped.mul_add(LOG2_E, ROUNDING_SHIFT);
    let whole = shifted - ROUNDING_SHIFT;
    let r = whole.mul_add(-LN2_LOW, whole.mul_add(-LN2_HIGH, clamped));
    let poly = r.mul_add(
        r.mul_add(
            r.mul_add(
                r.mul_add(
                    r.mul_add(r.mul_add(0.001_388_89, 0.008_333_33), 0.041_666_67),
                    0.166_666_67,
                ),
                0.5,
            ),
            1.0,
        ),
        1.0,
    );
    let exponent_bits = shifted
        .to_bits()
        .wrapping_sub(ROUNDING_SHIFT.to_bits())
        .wrapping_add(127)
        << 23;

    poly * f32::from_bits(exponent_bits)
}

#[inline(always)]
fn activate_row(values: &mut [f32], bias: &[f32], slopes: &mut [f32]) {
    let n = values.len();
    let (bias, slopes) = (&bias[..n], &mut slopes[..n]);

    for i in 0..n {
        let x = values[i] + bias[i];
        let exp = exp_negative(x.min(0.0));
        let positive = x > 0.0;

        slopes[i] = if positive { 1.0 } else { exp };
        values[i] = if positive { x } else { exp - 1.0 };
    }
}

#[inline(always)]
fn apply_body(values: &mut [f32], bias: &[f32], slopes: &mut [f32]) {
    let width = bias.len();

    for (row, slope) in values.chunks_exact_mut(width).zip(slopes.chunks_exact_mut(width)) {
        activate_row(row, bias, slope);
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn apply_avx2(values: &mut [f32], bias: &[f32], slopes: &mut [f32]) {
    apply_body(values, bias, slopes);
}

#[cfg(target_arch = "x86_64")]
pub fn apply_with_bias(values: &mut [f32], bias: &[f32], slopes: &mut [f32]) {
    if std::is_x86_feature_detected!("avx2") && std::is_x86_feature_detected!("fma") {
        return unsafe { apply_avx2(values, bias, slopes) };
    }

    apply_body(values, bias, slopes);
}

#[cfg(not(target_arch = "x86_64"))]
pub fn apply_with_bias(values: &mut [f32], bias: &[f32], slopes: &mut [f32]) {
    apply_body(values, bias, slopes);
}

pub fn exact(x: f32) -> f32 {
    if x > 0.0 {
        x
    } else {
        x.exp_m1()
    }
}

#[cfg(test)]
mod tests {
    use super::{apply_with_bias, exact};

    #[test]
    fn matches_the_exact_activation() {
        let mut values: Vec<f32> = (-4000..1000).map(|i| i as f32 * 0.01).collect();
        let inputs = values.clone();
        let mut slopes = vec![0.0; values.len()];

        let zeros = vec![0.0f32; values.len()];

        apply_with_bias(&mut values, &zeros, &mut slopes);

        for ((v, s), x) in values.iter().zip(&slopes).zip(&inputs) {
            assert!((v - exact(*x)).abs() < 2e-6, "elu({x}) = {v}");

            let slope = if *x > 0.0 { 1.0 } else { x.exp() };

            assert!((s - slope).abs() < 2e-6, "slope({x}) = {s}");
        }
    }

    #[test]
    fn large_negative_values_saturate() {
        let mut values = vec![-500.0f32, -1e30, f32::MIN];
        let mut slopes = vec![1.0; 3];

        apply_with_bias(&mut values, &[0.0; 3], &mut slopes);

        assert!(values.iter().all(|v| (*v + 1.0).abs() < 1e-6));
        assert!(slopes.iter().all(|s| *s >= 0.0 && *s < 1e-6));
    }
}
