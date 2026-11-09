use crate::adam::{clip_gradient, Adam};
use crate::kernels::Math;
use crate::mlp::{BackwardSets, Mlp, Scratch};
use crate::rng::Rng;

const HIDDEN: [usize; 3] = [256, 128, 64];
const ACTOR_GAIN: f64 = 0.01;
const CRITIC_GAIN: f64 = 1.0;

pub struct Net {
    pub mlp: Mlp,
    pub params: Vec<f32>,
    pub grads: Vec<f32>,
    pub scratch: Scratch,
    adam: Adam,
}

fn sizes(ins: usize, outs: usize) -> Vec<usize> {
    let mut s = vec![ins];

    s.extend(HIDDEN);
    s.push(outs);
    s
}

impl Net {
    pub fn new(shape: (usize, usize), (gain, rows): (f64, usize), rng: &mut Rng) -> Self {
        let mlp = Mlp::plan(&sizes(shape.0, shape.1), 0);
        let mut params = vec![0.0f32; mlp.param_end()];

        mlp.initialize(&mut params, gain, rng);

        Self {
            scratch: mlp.scratch(rows),
            grads: vec![0.0; params.len()],
            adam: Adam::with(params.len(), 0.95, 0.0),
            mlp,
            params,
        }
    }

    pub fn actor(nobs: usize, nact: usize, (rows, rng): (usize, &mut Rng)) -> Self {
        Self::new((nobs, nact), (ACTOR_GAIN, rows), rng)
    }

    pub fn critic(nobs: usize, (rows, rng): (usize, &mut Rng)) -> Self {
        Self::new((nobs, 1), (CRITIC_GAIN, rows), rng)
    }

    pub fn forward(&mut self, math: &Math, input: &[f32], rows: usize) -> Vec<f32> {
        self.mlp
            .forward(math, &self.params, input, rows, &mut self.scratch)
            .to_vec()
    }

    pub fn backward(&mut self, math: &Math, (input, seed): (&[f32], &[f32]), rows: usize) -> Vec<f32> {
        let mut grads = vec![0.0f32; self.params.len()];

        self.mlp.forward(math, &self.params, input, rows, &mut self.scratch);
        self.mlp.seed_gradient(rows, &mut self.scratch).copy_from_slice(seed);
        self.mlp.backward(
            math,
            BackwardSets {
                params: &self.params,
                grads: &mut grads,
                input,
            },
            rows,
            &mut self.scratch,
        );
        self.grads.iter_mut().zip(&grads).for_each(|(g, d)| *g += d);
        self.mlp.input_gradient(math, &self.params, rows, &mut self.scratch)
    }

    pub fn step(&mut self, rate: f32, max_norm: f64) -> f64 {
        let norm = clip_gradient(&mut self.grads, max_norm);

        self.adam.step(&mut self.params, &self.grads, rate);
        self.grads.fill(0.0);
        norm
    }
}
