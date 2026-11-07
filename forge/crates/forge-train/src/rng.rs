const GOLDEN: u64 = 0x9E37_79B9_7F4A_7C15;

fn split_mix(state: &mut u64) -> u64 {
    *state = state.wrapping_add(GOLDEN);

    let mut z = *state;

    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);

    z ^ (z >> 31)
}

pub struct Rng {
    words: [u64; 4],
    spare_normal: Option<f64>,
}

impl Rng {
    pub fn new(seed: u64, stream: u64) -> Self {
        let mut mix = seed.wrapping_mul(GOLDEN) ^ stream.wrapping_add(1).wrapping_mul(0xD6E8_FEB8_6659_FD93);
        let words = [
            split_mix(&mut mix),
            split_mix(&mut mix),
            split_mix(&mut mix),
            split_mix(&mut mix),
        ];

        Self {
            words,
            spare_normal: None,
        }
    }

    pub fn next_u64(&mut self) -> u64 {
        let [a, b, c, d] = &mut self.words;
        let result = a.wrapping_add(*d).rotate_left(23).wrapping_add(*a);
        let shifted = *b << 17;

        *c ^= *a;
        *d ^= *b;
        *b ^= *c;
        *a ^= *d;
        *c ^= shifted;
        *d = d.rotate_left(45);

        result
    }

    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    pub fn uniform(&mut self, low: f64, high: f64) -> f64 {
        low + (high - low) * self.unit()
    }

    pub fn below(&mut self, bound: usize) -> usize {
        ((self.next_u64() as u128 * bound as u128) >> 64) as usize
    }

    pub fn range(&mut self, low: i64, high: i64) -> i64 {
        low + self.below((high - low).max(1) as usize) as i64
    }

    pub fn normal(&mut self) -> f64 {
        if let Some(value) = self.spare_normal.take() {
            return value;
        }

        loop {
            let x = 2.0 * self.unit() - 1.0;
            let y = 2.0 * self.unit() - 1.0;
            let r2 = x * x + y * y;

            if r2 > 0.0 && r2 < 1.0 {
                let scale = (-2.0 * r2.ln() / r2).sqrt();

                self.spare_normal = Some(y * scale);

                return x * scale;
            }
        }
    }

    pub fn shuffle(&mut self, items: &mut [u32]) {
        for last in (1..items.len()).rev() {
            items.swap(last, self.below(last + 1));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Rng;

    #[test]
    fn normals_have_unit_spread() {
        let mut rng = Rng::new(7, 0);
        let n = 200_000;
        let samples: Vec<f64> = (0..n).map(|_| rng.normal()).collect();
        let mean = samples.iter().sum::<f64>() / n as f64;
        let var = samples.iter().map(|v| (v - mean) * (v - mean)).sum::<f64>() / n as f64;

        assert!(mean.abs() < 0.01, "mean {mean}");
        assert!((var - 1.0).abs() < 0.02, "variance {var}");
    }

    #[test]
    fn streams_differ_and_replay() {
        let mut first = Rng::new(3, 0);
        let mut again = Rng::new(3, 0);
        let mut other = Rng::new(3, 1);
        let value = first.next_u64();

        assert_eq!(value, again.next_u64());
        assert_ne!(value, other.next_u64());
    }

    #[test]
    fn ranges_stay_inside() {
        let mut rng = Rng::new(1, 0);

        for _ in 0..1000 {
            let v = rng.range(100, 250);

            assert!((100..250).contains(&v));
        }
    }
}
