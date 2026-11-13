use crate::export::rounded;
use crate::kernels::Math;
use crate::mlp::{Mlp, Scratch};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Squash {
    Clip,
    Tanh,
}

impl Squash {
    pub fn name(self) -> Option<&'static str> {
        match self {
            Squash::Clip => None,
            Squash::Tanh => Some("tanh"),
        }
    }

    pub fn apply(self, value: f32) -> f32 {
        match self {
            Squash::Clip => value,
            Squash::Tanh => value.tanh(),
        }
    }
}

pub struct Deployed {
    pub net: Mlp,
    pub params: Vec<f32>,
    pub squash: Squash,
    scratch: Scratch,
    actions: Vec<f32>,
}

const SCRATCH_ROWS: usize = 64;

impl Deployed {
    pub fn new(net: Mlp, mut params: Vec<f32>, squash: Squash) -> Self {
        net.zero_masked(&mut params);

        let scratch = net.scratch(SCRATCH_ROWS);

        Self {
            net,
            params,
            squash,
            scratch,
            actions: Vec::new(),
        }
    }

    pub fn as_exported(&self) -> Self {
        let params = self.params.iter().map(|v| rounded(*v) as f32).collect();

        Self::new(self.net.clone(), params, self.squash)
    }

    pub fn act(&mut self, math: &Math, obs: &[f32], rows: usize) -> &[f32] {
        let outs = self.net.outs();

        self.actions.resize(rows * outs, 0.0);

        for start in (0..rows).step_by(SCRATCH_ROWS) {
            let count = SCRATCH_ROWS.min(rows - start);
            let input = &obs[start * obs.len() / rows..(start + count) * obs.len() / rows];
            let out = self.net.forward(math, &self.params, input, count, &mut self.scratch);

            for (target, value) in self.actions[start * outs..(start + count) * outs].iter_mut().zip(out) {
                *target = self.squash.apply(*value);
            }
        }

        &self.actions
    }

    pub fn exact(&self, normalized: &[f32]) -> Vec<f32> {
        self.net
            .forward_exact(&self.params, normalized)
            .iter()
            .map(|a| self.squash.apply(*a).clamp(-1.0, 1.0))
            .collect()
    }
}
