use crate::adam::{clip_gradient, Adam};
use crate::deployed::{Deployed, Squash};
use crate::kernels::Math;
use crate::mlp::{BackwardSets, Mlp, Scratch};
use crate::rng::Rng;
use crate::sac::recipe::Recipe;

const LOG_SQRT_TWO_PI: f32 = 0.918_938_5;
const SQUASH_EPSILON: f32 = 1e-6;
const OUT_GAIN: f64 = 0.01;

fn bounded_log_std(low: f32, high: f32, raw: f32) -> f32 {
    low + 0.5 * (high - low) * (raw.tanh() + 1.0)
}

pub struct Actor {
    pub net: Mlp,
    pub params: Vec<f32>,
    pub nact: usize,
    grads: Vec<f32>,
    adam: Adam,
    scratch: Scratch,
    log_std_low: f32,
    log_std_high: f32,
    grad_clip: f64,
    pub actions: Vec<f32>,
    pub log_probs: Vec<f32>,
    pre_squash: Vec<f32>,
}

pub struct Objective<'a> {
    pub action_gradient: &'a [f32],
    pub action_offset: usize,
    pub alpha: f32,
    pub noise: &'a [f32],
}

impl Actor {
    pub fn new(nobs: usize, nact: usize, recipe: &Recipe, capacity: usize, rng: &mut Rng) -> Self {
        let mut sizes = vec![nobs];

        sizes.extend_from_slice(&recipe.actor_hidden);
        sizes.push(2 * nact);

        let net = Mlp::plan(&sizes, 0);
        let mut params = vec![0.0f32; net.param_end()];

        net.initialize(&mut params, OUT_GAIN, rng);

        let (low, high) = recipe.log_std_range;
        let start = ((2.0 * (recipe.log_std_init - low) / (high - low)) - 1.0)
            .clamp(-0.99, 0.99)
            .atanh();
        let head = net.layers.last().expect("an actor has layers");

        params[head.bias_at + nact..head.bias_at + 2 * nact].fill(start);

        Self {
            nact,
            grads: vec![0.0; params.len()],
            adam: Adam::with(params.len(), recipe.beta2, recipe.weight_decay),
            scratch: net.scratch(capacity),
            log_std_low: recipe.log_std_range.0,
            log_std_high: recipe.log_std_range.1,
            grad_clip: recipe.grad_clip,
            actions: vec![0.0; capacity * nact],
            log_probs: vec![0.0; capacity],
            pre_squash: vec![0.0; capacity * nact],
            params,
            net,
        }
    }

    pub fn sample(&mut self, math: &Math, obs: &[f32], noise: &[f32]) -> usize {
        let nact = self.nact;
        let rows = noise.len() / nact;
        let out = self.net.forward(math, &self.params, obs, rows, &mut self.scratch);

        for row in 0..rows {
            let mut log_prob = 0.0f32;

            for j in 0..nact {
                let at = row * nact + j;
                let mean = out[row * 2 * nact + j];
                let log_std = bounded_log_std(self.log_std_low, self.log_std_high, out[row * 2 * nact + nact + j]);
                let unit = noise[at];
                let pre = mean + log_std.exp() * unit;
                let action = pre.tanh();

                self.pre_squash[at] = pre;
                self.actions[at] = action;
                log_prob +=
                    -0.5 * unit * unit - log_std - LOG_SQRT_TWO_PI - (1.0 - action * action + SQUASH_EPSILON).ln();
            }

            self.log_probs[row] = log_prob;
        }

        rows
    }

    pub fn improve(&mut self, math: &Math, obs: &[f32], objective: Objective, rate: f32) {
        self.objective_gradients(math, obs, objective);

        if self.grad_clip > 0.0 {
            clip_gradient(&mut self.grads, self.grad_clip);
        }

        self.adam.step(&mut self.params, &self.grads, rate);
    }

    pub fn objective_gradients(&mut self, math: &Math, obs: &[f32], objective: Objective) -> &[f32] {
        let nact = self.nact;
        let rows = objective.noise.len() / nact;
        let scale = 1.0 / rows as f32;
        let width = objective.action_gradient.len() / rows;
        let alpha = objective.alpha;
        let half_span = 0.5 * (self.log_std_high - self.log_std_low);
        let outputs = self.net.output(rows, &self.scratch).to_vec();
        let seed = self.net.seed_gradient(rows, &mut self.scratch);

        for row in 0..rows {
            for j in 0..nact {
                let at = row * nact + j;
                let action = self.actions[at];
                let kept = 1.0 - action * action;
                let squash_slope = 2.0 * action * kept / (kept + SQUASH_EPSILON);
                let value_slope = objective.action_gradient[row * width + objective.action_offset + j];
                let by_pre = alpha * squash_slope - value_slope * kept;
                let raw_std = outputs[row * 2 * nact + nact + j];
                let log_std = bounded_log_std(self.log_std_low, self.log_std_high, raw_std);
                let by_log_std = -alpha + by_pre * log_std.exp() * objective.noise[at];
                let raw_slope = half_span * (1.0 - raw_std.tanh() * raw_std.tanh());

                seed[row * 2 * nact + j] = by_pre * scale;
                seed[row * 2 * nact + nact + j] = by_log_std * raw_slope * scale;
            }
        }

        let sets = BackwardSets {
            params: &self.params,
            grads: &mut self.grads,
            input: obs,
        };

        self.net.backward(math, sets, rows, &mut self.scratch);

        &self.grads
    }

    pub fn deployed(&self) -> Deployed {
        let mut sizes: Vec<usize> = self.net.layers.iter().map(|l| l.ins).collect();

        sizes.push(self.nact);

        let head = Mlp::plan(&sizes, 0);
        let mut params = vec![0.0f32; head.param_end()];
        for (from, to) in self.net.layers.iter().zip(&head.layers) {
            for i in 0..to.ins {
                let source = &self.params[from.weights_at + i * from.outs..][..to.outs];

                params[to.weights_at + i * to.outs..][..to.outs].copy_from_slice(source);
            }

            params[to.bias_at..to.bias_at + to.outs]
                .copy_from_slice(&self.params[from.bias_at..from.bias_at + to.outs]);
        }

        Deployed::new(head, params, Squash::Tanh)
    }
}

#[cfg(test)]
#[path = "actor_tests.rs"]
mod tests;
