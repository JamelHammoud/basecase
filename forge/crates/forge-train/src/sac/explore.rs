use crate::rng::Rng;

const ZETA_EXPONENT: f64 = 2.0;
const MAX_REPEAT: usize = 16;
const SCALE_EPSILON: f64 = 1e-8;

pub struct Noise {
    nact: usize,
    repeat: bool,
    values: Vec<f32>,
    left: Vec<usize>,
    repeat_cdf: Vec<f64>,
}

impl Noise {
    pub fn new(count: usize, nact: usize, repeat: bool) -> Self {
        let weights: Vec<f64> = (1..=MAX_REPEAT).map(|k| (k as f64).powf(-ZETA_EXPONENT)).collect();
        let total: f64 = weights.iter().sum();
        let repeat_cdf = weights
            .iter()
            .scan(0.0, |acc, w| {
                *acc += w / total;

                Some(*acc)
            })
            .collect();

        Self {
            nact,
            repeat,
            values: vec![0.0; count * nact],
            left: vec![0; count],
            repeat_cdf,
        }
    }

    fn repeat_length(&self, rng: &mut Rng) -> usize {
        let u = rng.unit();

        self.repeat_cdf.iter().position(|c| u <= *c).unwrap_or(MAX_REPEAT - 1) + 1
    }

    pub fn draw(&mut self, rngs: &mut [Rng]) -> &[f32] {
        let nact = self.nact;

        for (sim, rng) in rngs.iter_mut().enumerate() {
            if self.repeat && self.left[sim] > 0 {
                self.left[sim] -= 1;

                continue;
            }

            for v in &mut self.values[sim * nact..(sim + 1) * nact] {
                *v = rng.normal() as f32;
            }

            if self.repeat {
                self.left[sim] = self.repeat_length(rng) - 1;
            }
        }

        &self.values
    }

    pub fn restart(&mut self, sim: usize) {
        self.left[sim] = 0;
    }
}

pub struct RewardScale {
    gamma: f64,
    high: f64,
    returns: Vec<f64>,
    count: f64,
    mean: f64,
    var: f64,
    largest: f64,
}

impl RewardScale {
    pub fn new(count: usize, gamma: f32, high: f32) -> Self {
        Self {
            gamma: gamma as f64,
            high: high as f64,
            returns: vec![0.0; count],
            count: 0.0,
            mean: 0.0,
            var: 0.0,
            largest: 0.0,
        }
    }

    pub fn observe(&mut self, rewards: &[f32], finished: &[bool]) {
        for (sim, g) in self.returns.iter_mut().enumerate() {
            *g = self.gamma * *g + rewards[sim] as f64;
            self.largest = self.largest.max(g.abs());
            self.count += 1.0;

            let delta = *g - self.mean;

            self.mean += delta / self.count;
            self.var += (delta * (*g - self.mean) - self.var) / self.count;

            if finished[sim] {
                *g = 0.0;
            }
        }
    }

    pub fn divisor(&self) -> f32 {
        if self.count < 1.0 {
            return 1.0;
        }

        (self.var + SCALE_EPSILON)
            .sqrt()
            .max(self.largest / self.high)
            .max(SCALE_EPSILON) as f32
    }
}
