use crate::kernels::Math;
use crate::mlp::{BackwardSets, Mlp, Scratch};

const LOG_TWO_PI_HALF: f32 = 0.918_938_5;

pub struct Minibatch<'a> {
    pub rows: usize,
    pub obs: &'a [f32],
    pub act: &'a [f32],
    pub logp: &'a [f32],
    pub adv: &'a [f32],
    pub ret: &'a [f32],
}

#[derive(Clone, Copy, Debug)]
pub struct Widths {
    pub obs: usize,
    pub act: usize,
}

impl<'a> Minibatch<'a> {
    pub fn rows_between(&self, from: usize, to: usize, widths: Widths) -> Minibatch<'a> {
        Minibatch {
            rows: to - from,
            obs: &self.obs[from * widths.obs..to * widths.obs],
            act: &self.act[from * widths.act..to * widths.act],
            logp: &self.logp[from..to],
            adv: &self.adv[from..to],
            ret: &self.ret[from..to],
        }
    }
}

pub struct Head<'a> {
    pub net: &'a Mlp,
    pub scratch: &'a mut Scratch,
    pub params: &'a [f32],
    pub grads: &'a mut [f32],
}

pub struct PolicyTerms<'a> {
    pub log_std: &'a [f32],
    pub log_std_grads: &'a mut [f32],
    pub clip: f32,
    pub ent_coef: f32,
    pub squash_coef: f32,
    pub scale: f32,
}

pub fn gaussian_constant(log_std: &[f32]) -> f32 {
    log_std.iter().sum::<f32>() + log_std.len() as f32 * LOG_TWO_PI_HALF
}

pub fn log_prob(mean: &[f32], taken: &[f32], inverse_std: &[f32], constant: f32) -> f32 {
    let quadratic: f32 = taken
        .iter()
        .zip(mean)
        .zip(inverse_std)
        .map(|((a, m), s)| {
            let unit = (a - m) * s;

            unit * unit
        })
        .sum();

    -0.5 * quadratic - constant
}

fn squash_pull(coef: f32, taken: f32) -> f32 {
    if coef == 0.0 {
        return 0.0;
    }

    2.0 * coef * taken.tanh()
}

pub fn policy_gradient(math: &Math, head: Head, batch: &Minibatch, terms: PolicyTerms) -> f64 {
    let Minibatch {
        rows,
        obs,
        act,
        logp,
        adv,
        ..
    } = *batch;
    let Head {
        net,
        scratch,
        params,
        grads,
    } = head;
    let nact = terms.log_std.len();

    net.forward(math, params, obs, rows, scratch);

    let inverse_var: Vec<f32> = terms.log_std.iter().map(|s| (-2.0 * s).exp()).collect();
    let constant = gaussian_constant(terms.log_std);
    let scale = terms.scale;
    let (mean, seed) = net.output_and_seed(rows, scratch);
    let mut kl_sum = 0.0f64;

    terms.log_std_grads.fill(-terms.ent_coef);

    for row in 0..rows {
        let span = row * nact..(row + 1) * nact;
        let (mu, taken, target) = (&mean[span.clone()], &act[span.clone()], &mut seed[span]);
        let mut quadratic = 0.0f32;

        for j in 0..nact {
            let off = taken[j] - mu[j];

            target[j] = off * inverse_var[j];
            quadratic += off * target[j];
        }

        let new_logp = -0.5 * quadratic - constant;
        let ratio = (new_logp - logp[row]).exp();
        let kept = ratio * adv[row];
        let clipped = ratio.clamp(1.0 - terms.clip, 1.0 + terms.clip) * adv[row];
        let weight = if kept <= clipped { -kept * scale } else { 0.0 };

        kl_sum += (logp[row] - new_logp) as f64;

        for j in 0..nact {
            let off = taken[j] - mu[j];
            let pull = squash_pull(terms.squash_coef * scale, taken[j]);

            terms.log_std_grads[j] += weight * (off * target[j] - 1.0) + pull * off;
            target[j] = target[j] * weight + pull;
        }
    }

    net.backward(
        math,
        BackwardSets {
            params,
            grads,
            input: obs,
        },
        rows,
        scratch,
    );

    kl_sum
}

pub fn value_gradient(math: &Math, head: Head, batch: &Minibatch, scale: f32) {
    let Minibatch { rows, obs, ret, .. } = *batch;
    let Head {
        net,
        scratch,
        params,
        grads,
    } = head;

    net.forward(math, params, obs, rows, scratch);

    let (values, seed) = net.output_and_seed(rows, scratch);

    for row in 0..rows {
        seed[row] = (values[row] - ret[row]) * scale;
    }

    net.backward(
        math,
        BackwardSets {
            params,
            grads,
            input: obs,
        },
        rows,
        scratch,
    );
}
