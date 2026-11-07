#[derive(Debug, Clone)]
pub struct SplitMix {
    state: u64,
}

impl SplitMix {
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);

        let mut mixed = self.state;

        mixed = (mixed ^ (mixed >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        mixed = (mixed ^ (mixed >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);

        mixed ^ (mixed >> 31)
    }

    pub fn unit(&mut self) -> f64 {
        let mantissa = self.next_u64() >> 11;

        (mantissa as f64) / ((1u64 << 53) as f64)
    }

    pub fn spread(&mut self, fraction: f64) -> f64 {
        1.0 + fraction * (2.0 * self.unit() - 1.0)
    }

    pub fn below(&mut self, limit: u64) -> u64 {
        if limit == 0 {
            return 0;
        }

        self.next_u64() % limit
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_stream() {
        let mut first = SplitMix::new(42);
        let mut second = SplitMix::new(42);

        for _ in 0..100 {
            assert_eq!(first.next_u64(), second.next_u64());
        }
    }

    #[test]
    fn spread_stays_inside_the_band() {
        let mut rng = SplitMix::new(7);

        for _ in 0..1000 {
            let value = rng.spread(0.1);

            assert!((0.9..=1.1).contains(&value));
        }
    }
}
