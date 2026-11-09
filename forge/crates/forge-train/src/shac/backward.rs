use super::nets::Net;
use super::rollout::{Rollout, Step};
use super::world::{linearize, observe, run, Actions, Frame};
use crate::kernels::Math;
use crate::normalizer::Normalizer;
use forge_ir::task::Task;
use forge_sim::grad::{Jacobian, Real};
use rayon::prelude::*;

const CLIP: f32 = 5.0;

pub struct Sweep<'s> {
    pub task: &'s Task,
    pub nq: usize,
    pub nx: usize,
    pub std: Vec<f64>,
    pub gamma: f64,
}

#[derive(Clone)]
pub struct Carry {
    pub x: Vec<f64>,
    pub a: Vec<f64>,
}

struct Local {
    x: Vec<f64>,
    last: Vec<f64>,
    mean: Vec<f32>,
}

struct StepInput<'i> {
    after: &'i [f64],
    clipped: &'i [f64],
    last: &'i [f64],
    taken: &'i [f32],
    weight: f64,
}

pub struct Learners<'l> {
    pub actor: &'l mut Net,
    pub target: &'l mut Net,
    pub math: &'l Math,
    pub norm: &'l Normalizer,
}

fn transpose_times(jacobian: &[f64], (rows, cols): (usize, usize), lambda: &[f64]) -> Vec<f64> {
    let mut out = vec![0.0; cols];

    for (r, l) in lambda.iter().enumerate().take(rows) {
        if *l != 0.0 {
            for (o, j) in out.iter_mut().zip(&jacobian[r * cols..(r + 1) * cols]) {
                *o += j * l;
            }
        }
    }

    out
}

fn add(a: &[f64], b: &[f64]) -> Vec<f64> {
    a.iter().zip(b).map(|(x, y)| x + y).collect()
}

impl Sweep<'_> {
    fn frame<'v, S: Real>(&self, x: &'v [S]) -> Frame<'v, S> {
        Frame {
            qpos: &x[..self.nq],
            qvel: &x[self.nq..self.nx],
        }
    }

    fn observation_pullback(&self, (x, last): (&[f64], &[f64]), (grad, norm): (&[f32], &[f32])) -> Carry {
        let raw: Vec<f64> = grad
            .iter()
            .zip(norm)
            .zip(&self.std)
            .map(|((g, n), s)| if n.abs() < CLIP { f64::from(*g) / s } else { 0.0 })
            .collect();
        let point: Vec<f64> = x.iter().chain(last).copied().collect();
        let lin = linearize(&point, raw.len(), |inp| {
            observe(self.task, &self.frame(&inp[..self.nx]), &inp[self.nx..])
        });
        let pulled = transpose_times(&lin.jacobian, (raw.len(), point.len()), &raw);

        Carry {
            x: pulled[..self.nx].to_vec(),
            a: pulled[self.nx..].to_vec(),
        }
    }

    fn reward_pullback(&self, after: &[f64], (clipped, last): (&[f64], &[f64])) -> Vec<f64> {
        let nact = clipped.len();
        let point: Vec<f64> = after.iter().chain(clipped).chain(last).copied().collect();

        linearize(&point, 1, |inp| {
            let actions = Actions {
                action: &inp[self.nx..self.nx + nact],
                last: &inp[self.nx + nact..],
            };

            vec![run(
                &self.task.reward,
                self.task,
                (&self.frame(&inp[..self.nx]), &actions),
            )]
        })
        .jacobian
    }

    fn local(&self, carry: &Carry, input: &StepInput, jacobian: &Jacobian) -> Local {
        let (nx, nact, w) = (self.nx, input.clipped.len(), input.weight);
        let g = self.reward_pullback(input.after, (input.clipped, input.last));
        let lambda: Vec<f64> = carry.x.iter().zip(&g[..nx]).map(|(c, r)| c + w * r).collect();
        let mut a: Vec<f64> = carry.a.iter().zip(&g[nx..nx + nact]).map(|(c, r)| c + w * r).collect();
        let pulled = transpose_times(&jacobian.values, (jacobian.rows, jacobian.cols), &lambda);

        for (j, joint) in self.task.joints.iter().enumerate() {
            let target = joint.default_pose + self.task.action_scale * input.clipped[j];

            if target > joint.ctrl_range[0] && target < joint.ctrl_range[1] {
                a[j] += pulled[nx + j] * self.task.action_scale;
            }
        }

        Local {
            x: pulled[..nx].to_vec(),
            last: g[nx + nact..].iter().map(|r| w * r).collect(),
            mean: (0..nact)
                .map(|j| if input.taken[j].abs() < 1.0 { a[j] as f32 } else { 0.0 })
                .collect(),
        }
    }

    fn value_pullback(
        &self,
        l: &mut Learners,
        norm_obs: &[f32],
        (x, last, seed): (&[f64], &[f64], &[f64]),
    ) -> Vec<Carry> {
        let (nobs, nact, nx) = (self.task.nobs(), self.task.nact(), self.nx);
        let seeds: Vec<f32> = seed.iter().map(|s| *s as f32).collect();
        let grads = l.target.backward(l.math, (norm_obs, &seeds), seed.len());

        l.target.grads.fill(0.0);

        (0..seed.len())
            .into_par_iter()
            .map(|e| {
                if seed[e] == 0.0 {
                    return Carry {
                        x: vec![0.0; nx],
                        a: vec![0.0; nact],
                    };
                }

                self.observation_pullback(
                    (&x[e * nx..(e + 1) * nx], &last[e * nact..(e + 1) * nact]),
                    (&grads[e * nobs..(e + 1) * nobs], &norm_obs[e * nobs..(e + 1) * nobs]),
                )
            })
            .collect()
    }

    fn step_back(&self, l: &mut Learners, (step, w): (&Step, &[f64]), carry: &[Carry]) -> (Vec<Carry>, Vec<f32>) {
        let (count, nact, nx, nobs) = (w.len(), self.task.nact(), self.nx, self.task.nobs());
        let timeout_seed: Vec<f64> = (0..count)
            .map(|e| {
                if step.timeout[e] && !step.fell[e] {
                    self.gamma * w[e]
                } else {
                    0.0
                }
            })
            .collect();
        let mut next_norm = vec![0.0f32; step.next_obs.len()];

        l.norm.apply(&step.next_obs, &mut next_norm);

        let timeouts = self.value_pullback(l, &next_norm, (&step.after, &step.clipped, &timeout_seed));
        let locals: Vec<Local> = (0..count)
            .into_par_iter()
            .map(|e| {
                let start = if step.done(e) { &timeouts[e] } else { &carry[e] };
                let input = StepInput {
                    after: &step.after[e * nx..(e + 1) * nx],
                    clipped: &step.clipped[e * nact..(e + 1) * nact],
                    last: &step.last[e * nact..(e + 1) * nact],
                    taken: &step.taken[e * nact..(e + 1) * nact],
                    weight: w[e],
                };

                self.local(start, &input, &step.jacobians[e])
            })
            .collect();
        let seeds: Vec<f32> = locals.iter().flat_map(|l| l.mean.iter().copied()).collect();
        let obs_grad = l.actor.backward(l.math, (&step.norm, &seeds), count);
        let next = locals
            .into_par_iter()
            .enumerate()
            .map(|(e, local)| {
                let pulled = self.observation_pullback(
                    (&step.x[e * nx..(e + 1) * nx], &step.last[e * nact..(e + 1) * nact]),
                    (
                        &obs_grad[e * nobs..(e + 1) * nobs],
                        &step.norm[e * nobs..(e + 1) * nobs],
                    ),
                );

                Carry {
                    x: add(&local.x, &pulled.x),
                    a: add(&local.last, &pulled.a),
                }
            })
            .collect();

        (next, seeds)
    }
}

fn weights(rollout: &Rollout, gamma: f64, count: usize) -> Vec<Vec<f64>> {
    let mut out: Vec<Vec<f64>> = Vec::with_capacity(rollout.steps.len());
    let mut current = vec![1.0; count];

    for step in &rollout.steps {
        out.push(current.clone());
        current = (0..count)
            .map(|e| if step.done(e) { 1.0 } else { current[e] * gamma })
            .collect();
    }

    out
}

pub fn backward(sweep: &Sweep, rollout: &Rollout, l: &mut Learners, log_std: &[f32]) -> Vec<f64> {
    let horizon = rollout.steps.len();
    let count = rollout.steps[0].reward.len();
    let nact = sweep.task.nact();
    let w = weights(rollout, sweep.gamma, count);
    let end = &rollout.steps[horizon - 1];
    let end_seed: Vec<f64> = (0..count)
        .map(|e| {
            if end.done(e) {
                0.0
            } else {
                sweep.gamma * w[horizon - 1][e]
            }
        })
        .collect();
    let mut carry = sweep.value_pullback(l, &rollout.last_norm, (&end.after, &end.clipped, &end_seed));
    let mut log_std_grad = vec![0.0f64; nact];

    for t in (0..horizon).rev() {
        let step = &rollout.steps[t];
        let (next, seeds) = sweep.step_back(l, (step, &w[t]), &carry);

        for (k, s) in seeds.iter().enumerate() {
            log_std_grad[k % nact] += f64::from(*s) * f64::from(log_std[k % nact].exp() * step.noise[k]);
        }

        carry = next;
    }

    log_std_grad
}
