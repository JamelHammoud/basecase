const BETA1: f32 = 0.9;
const BETA2: f32 = 0.999;
const EPSILON: f32 = 1e-8;

pub struct Adam {
    first: Vec<f32>,
    second: Vec<f32>,
    steps: i32,
}

impl Adam {
    pub fn new(size: usize) -> Self {
        Self {
            first: vec![0.0; size],
            second: vec![0.0; size],
            steps: 0,
        }
    }

    pub fn step(&mut self, params: &mut [f32], grads: &[f32], rate: f32) {
        self.steps += 1;

        let first_scale = 1.0 - (BETA1 as f64).powi(self.steps);
        let second_scale = 1.0 - (BETA2 as f64).powi(self.steps);
        let step_rate = rate / first_scale as f32;
        let second_inverse = 1.0 / second_scale as f32;
        let moments = self.first.iter_mut().zip(self.second.iter_mut());

        for ((param, grad), (m, v)) in params.iter_mut().zip(grads).zip(moments) {
            *m = *m * BETA1 + grad * (1.0 - BETA1);
            *v = *v * BETA2 + grad * grad * (1.0 - BETA2);
            *param -= step_rate * *m / ((*v * second_inverse).sqrt() + EPSILON);
        }
    }
}

pub fn gradient_norm(grads: &[f32]) -> f64 {
    let mut total = 0.0f64;

    for chunk in grads.chunks(1024) {
        let sum: f32 = chunk.iter().map(|g| g * g).sum();

        total += sum as f64;
    }

    total.sqrt()
}

pub fn clip_gradient(grads: &mut [f32], max_norm: f64) -> f64 {
    let norm = gradient_norm(grads);
    let scale = max_norm / (norm + 1e-6);

    if scale < 1.0 {
        let scale = scale as f32;

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
