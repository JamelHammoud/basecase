use super::env::Env;
use super::nets::Net;
use crate::kernels::Math;
use crate::normalizer::Normalizer;
use crate::rng::Rng;
use forge_sim::grad::{Jacobian, Smooth};

pub struct Step {
    pub obs: Vec<f32>,
    pub norm: Vec<f32>,
    pub noise: Vec<f32>,
    pub taken: Vec<f32>,
    pub clipped: Vec<f64>,
    pub last: Vec<f64>,
    pub x: Vec<f64>,
    pub after: Vec<f64>,
    pub next_obs: Vec<f32>,
    pub jacobians: Vec<Jacobian>,
    pub reward: Vec<f64>,
    pub fell: Vec<bool>,
    pub timeout: Vec<bool>,
}

impl Step {
    pub fn done(&self, env: usize) -> bool {
        self.fell[env] || self.timeout[env]
    }
}

pub struct Rollout {
    pub steps: Vec<Step>,
    pub last_obs: Vec<f32>,
    pub last_norm: Vec<f32>,
}

pub struct Policy<'p> {
    pub actor: &'p mut Net,
    pub log_std: &'p [f32],
    pub norm: &'p Normalizer,
    pub math: &'p Math,
    pub rng: &'p mut Rng,
}

fn observe_all(env: &mut Env) -> Vec<f32> {
    let width = env.task.nobs();
    let mut out = vec![0.0f32; env.count * width];

    for sim in 0..env.count {
        env.observe(sim, &mut out[sim * width..(sim + 1) * width]);
    }

    out
}

fn normalized(norm: &Normalizer, obs: &[f32]) -> Vec<f32> {
    let mut out = vec![0.0f32; obs.len()];

    norm.apply(obs, &mut out);
    out
}

fn sample(policy: &mut Policy, norm: &[f32], count: usize) -> (Vec<f32>, Vec<f32>) {
    let mean = policy.actor.forward(policy.math, norm, count);
    let nact = policy.log_std.len();
    let noise: Vec<f32> = (0..mean.len()).map(|_| policy.rng.normal() as f32).collect();
    let taken = mean
        .iter()
        .zip(&noise)
        .enumerate()
        .map(|(i, (m, e))| m + policy.log_std[i % nact].exp() * e)
        .collect();

    (noise, taken)
}

fn act(env: &mut Env, taken: &[f32]) -> (Vec<f64>, Vec<f64>, Vec<Vec<f64>>) {
    let nact = env.task.nact();
    let clipped: Vec<f64> = taken.iter().map(|a| f64::from(a.clamp(-1.0, 1.0))).collect();
    let last = env.last.clone();

    for sim in 0..env.count {
        env.write_controls(sim, &clipped[sim * nact..(sim + 1) * nact]);
        env.push(sim);
    }

    (clipped, last, env.rows())
}

fn states(env: &mut Env) -> Vec<f64> {
    (0..env.count).flat_map(|s| env.state(s)).collect()
}

fn finish(env: &mut Env, clipped: &[f64], step: &mut Step) {
    let nact = env.task.nact();
    let width = env.task.nobs();

    step.after = states(env);
    step.next_obs = vec![0.0f32; env.count * width];

    for sim in 0..env.count {
        let outcome = env.finish(sim, &clipped[sim * nact..(sim + 1) * nact]);

        env.observe(sim, &mut step.next_obs[sim * width..(sim + 1) * width]);
        step.reward.push(outcome.reward);
        step.fell.push(outcome.fell);
        step.timeout.push(outcome.timeout);

        if outcome.fell || outcome.timeout {
            env.reset(sim);
        }
    }
}

pub fn collect(env: &mut Env, policy: &mut Policy, (horizon, smoothing): (usize, Smooth)) -> Result<Rollout, String> {
    let mut steps = Vec::with_capacity(horizon);

    for _ in 0..horizon {
        let obs = observe_all(env);
        let norm = normalized(policy.norm, &obs);
        let (noise, taken) = sample(policy, &norm, env.count);
        let (clipped, last, rows) = act(env, &taken);
        let x = rows
            .iter()
            .flat_map(|r| {
                let o = env.robot.layout;
                let (nq, nv) = (env.plan.kernel.nq, env.plan.kernel.nv);

                r[o.qpos..o.qpos + nq]
                    .iter()
                    .chain(&r[o.qvel..o.qvel + nv])
                    .copied()
                    .collect::<Vec<_>>()
            })
            .collect();
        let jacobians = env.advance(&rows, smoothing)?;
        let mut step = Step {
            obs,
            norm,
            noise,
            taken,
            clipped: clipped.clone(),
            last,
            x,
            after: Vec::new(),
            next_obs: Vec::new(),
            jacobians,
            reward: Vec::with_capacity(env.count),
            fell: Vec::with_capacity(env.count),
            timeout: Vec::with_capacity(env.count),
        };

        finish(env, &clipped, &mut step);
        steps.push(step);
    }

    let last_obs = observe_all(env);
    let last_norm = normalized(policy.norm, &last_obs);

    Ok(Rollout {
        steps,
        last_obs,
        last_norm,
    })
}
