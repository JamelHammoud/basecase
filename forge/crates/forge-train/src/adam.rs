const BETA1: f32 = 0.9;
const BETA2: f32 = 0.999;
const EPSILON: f32 = 1e-8;
const NORM_LANES: usize = 16;
pub const NORM_CHUNK: usize = 1024;

#[derive(Clone)]
pub struct Adam {
    first: Vec<f32>,
    second: Vec<f32>,
    steps: i32,
    beta2: f32,
    decay: f32,
}

impl Adam {
    pub fn new(size: usize) -> Self {
        Self::with(size, BETA2, 0.0)
    }

    pub fn with(size: usize, beta2: f32, decay: f32) -> Self {
        Self {
            first: vec![0.0; size],
            second: vec![0.0; size],
            steps: 0,
            beta2,
            decay,
        }
    }

    pub fn begin(&mut self, rate: f32) -> AdamStep {
        self.steps += 1;

        let first_scale = 1.0 - (BETA1 as f64).powi(self.steps);
        let second_scale = 1.0 - (self.beta2 as f64).powi(self.steps);

        AdamStep {
            step_rate: rate / first_scale as f32,
            second_inverse: 1.0 / second_scale as f32,
            beta2: self.beta2,
            decay: self.decay,
            kept: 1.0 - rate * self.decay,
        }
    }

    pub fn moments(&mut self) -> Moments<'_> {
        Moments {
            first: &mut self.first,
            second: &mut self.second,
        }
    }

    pub fn step(&mut self, params: &mut [f32], grads: &[f32], rate: f32) {
        let step = self.begin(rate);

        step.apply(params, grads, self.moments());
    }
}

pub struct Moments<'a> {
    pub first: &'a mut [f32],
    pub second: &'a mut [f32],
}

#[derive(Clone, Copy, Debug)]
pub struct AdamStep {
    step_rate: f32,
    second_inverse: f32,
    beta2: f32,
    decay: f32,
    kept: f32,
}

impl AdamStep {
    pub fn apply(&self, params: &mut [f32], grads: &[f32], moments: Moments) {
        let Self {
            step_rate,
            second_inverse,
            beta2,
            decay,
            kept,
        } = *self;
        let pairs = moments.first.iter_mut().zip(moments.second.iter_mut());

        for ((param, grad), (m, v)) in params.iter_mut().zip(grads).zip(pairs) {
            *m = *m * BETA1 + grad * (1.0 - BETA1);
            *v = *v * beta2 + grad * grad * (1.0 - beta2);

            if decay > 0.0 {
                *param *= kept;
            }

            *param -= step_rate * *m / ((*v * second_inverse).sqrt() + EPSILON);
        }
    }
}

pub fn square_sum(chunk: &[f32]) -> f32 {
    let mut lanes = [0.0f32; NORM_LANES];
    let (blocks, remainder) = chunk.as_chunks::<NORM_LANES>();

    for block in blocks {
        lanes.iter_mut().zip(block).for_each(|(lane, g)| *lane += g * g);
    }

    let tail: f32 = remainder.iter().map(|g| g * g).sum();

    lanes.iter().sum::<f32>() + tail
}

pub fn gradient_norm(grads: &[f32]) -> f64 {
    grads
        .chunks(NORM_CHUNK)
        .map(|chunk| square_sum(chunk) as f64)
        .sum::<f64>()
        .sqrt()
}

pub fn clip_scale(norm: f64, max_norm: f64) -> f32 {
    (max_norm / (norm + 1e-6)).min(1.0) as f32
}

pub fn clip_gradient(grads: &mut [f32], max_norm: f64) -> f64 {
    let norm = gradient_norm(grads);
    let scale = clip_scale(norm, max_norm);

    if scale < 1.0 {
        grads.iter_mut().for_each(|g| *g *= scale);
    }

    norm
}

#[cfg(test)]
mod tests {
    use super::{clip_gradient, gradient_norm, Adam};

    #[test]
    fn first_step_moves_each_parameter_by_the_rate() {
        let mut adam = Adam::new(2);
        let mut params = vec![1.0f32, 1.0];

        adam.step(&mut params, &[0.5, -2.0], 0.01);

        assert!((params[0] - 0.99).abs() < 1e-5);
        assert!((params[1] - 1.01).abs() < 1e-5);
    }

    #[test]
    fn matches_adam_on_a_known_sequence() {
        let mut adam = Adam::new(1);
        let mut param = vec![1.0f32];
        let (mut m, mut v, mut x) = (0.0f64, 0.0f64, 1.0f64);

        for t in 1..=50 {
            let g = 2.0 * x;

            m = 0.9 * m + 0.1 * g;
            v = 0.999 * v + 0.001 * g * g;
            x -= 0.01 * (m / (1.0 - 0.9f64.powi(t))) / ((v / (1.0 - 0.999f64.powi(t))).sqrt() + 1e-8);

            let grad = [2.0 * param[0]];

            adam.step(&mut param, &grad, 0.01);
        }

        assert!((param[0] as f64 - x).abs() < 1e-3, "{} against {x}", param[0]);
    }

    #[test]
    fn clipping_keeps_small_gradients_and_scales_large_ones() {
        let mut small = vec![0.3f32, 0.4];

        clip_gradient(&mut small, 1.0);
        assert_eq!(small, vec![0.3, 0.4]);

        let mut large = vec![3.0f32, 4.0];

        clip_gradient(&mut large, 1.0);
        assert!((gradient_norm(&large) - 1.0).abs() < 1e-5);
    }
}
