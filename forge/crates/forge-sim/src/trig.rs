use crate::lanes::{LANES, V};

const TWO_OVER_PI: f64 = std::f64::consts::FRAC_2_PI;
const PIO2_1: f64 = 1.570_796_326_734_125_6;
const PIO2_1T: f64 = 6.077_100_506_506_192e-11;
const S: [f64; 6] = [
    -1.666_666_666_666_663_2e-1,
    8.333_333_333_322_49e-3,
    -1.984_126_982_985_795e-4,
    2.755_731_370_707_007e-6,
    -2.505_076_025_340_686_3e-8,
    1.589_690_995_211_55e-10,
];
const C: [f64; 6] = [
    4.166_666_666_666_66e-2,
    -1.388_888_888_887_411e-3,
    2.480_158_728_947_673e-5,
    -2.755_731_435_139_066_3e-7,
    2.087_572_321_298_175e-9,
    -1.135_964_755_778_819_5e-11,
];

fn quadrants(k: V) -> [u64; LANES] {
    std::array::from_fn(|i| (k.0[i] as i64).rem_euclid(4) as u64)
}

fn kernel_sin(x: V) -> V {
    let z = x * x;
    let w = z * z;
    let r = V::splat(S[1]) + z * (V::splat(S[2]) + z * S[3]) + z * w * (V::splat(S[4]) + z * S[5]);
    let v = z * x;

    x + v * (V::splat(S[0]) + z * r)
}

fn kernel_cos(x: V) -> V {
    let z = x * x;
    let w = z * z;
    let r = z * (V::splat(C[0]) + z * (V::splat(C[1]) + z * C[2]))
        + w * w * (V::splat(C[3]) + z * (V::splat(C[4]) + z * C[5]));
    let hz = z * 0.5;
    let one = V::splat(1.0);
    let w = one - hz;

    w + (((one - w) - hz) + z * r)
}

pub fn sin_cos(x: V) -> (V, V) {
    let k = (x * TWO_OVER_PI).map(f64::round);
    let r = (x - k * PIO2_1) - k * PIO2_1T;
    let s = kernel_sin(r);
    let c = kernel_cos(r);
    let q = quadrants(k);
    let mut sin = s;
    let mut cos = c;

    for i in 0..LANES {
        let (a, b) = (s.0[i], c.0[i]);

        (sin.0[i], cos.0[i]) = match q[i] {
            0 => (a, b),
            1 => (b, -a),
            2 => (-a, -b),
            _ => (-b, a),
        };
    }

    (sin, cos)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_libm_to_a_few_ulps() {
        let mut worst = (0.0, 0.0);
        let mut x = -40.0;

        while x < 40.0 {
            let v = V([x, x * 0.37, -x * 0.11, x * 1e-3]);
            let (s, c) = sin_cos(v);

            for i in 0..LANES {
                let e = (s.0[i] - v.0[i].sin()).abs().max((c.0[i] - v.0[i].cos()).abs());

                if e > worst.0 {
                    worst = (e, v.0[i]);
                }
            }

            x += 0.000_731;
        }

        assert!(worst.0 < 5e-16, "worst error {:e} at {}", worst.0, worst.1);
    }
}
