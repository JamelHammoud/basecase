use crate::adam::{clip_gradient, Adam};
use crate::heads::{policy_gradient, value_gradient, Head, PolicyTerms};
use crate::kernels::Math;
use crate::mlp::{Mlp, Scratch};
use crate::pool::Pool;
use crate::rng::Rng;
use std::sync::Mutex;

pub use crate::heads::Minibatch;

const HIDDEN: [usize; 3] = [256, 128, 64];
const LOG_STD_INIT: f32 = -0.7;
const ACTOR_OUT_GAIN: f64 = 0.01;
const CRITIC_OUT_GAIN: f64 = 1.0;

pub const LEARN_RATE_MIN: f32 = 1e-5;
pub const LEARN_RATE_MAX: f32 = 1e-2;
pub const GRAD_NORM_MAX: f64 = 1.0;

#[derive(Clone, Copy, Debug)]
pub struct Hyper {
    pub horizon: usize,
    pub epochs: usize,
    pub minibatches: usize,
    pub gamma: f32,
    pub lam: f32,
    pub clip: f32,
    pub ent_coef: f32,
    pub desired_kl: f32,
}

pub const HYPER: Hyper = Hyper {
    horizon: 24,
    epochs: 30,
    minibatches: 4,
    gamma: 0.99,
    lam: 0.95,
    clip: 0.2,
    ent_coef: 0.004,
    desired_kl: 0.01,
};

const REFERENCE_ENVS: usize = 64;
const MIN_EPOCHS: usize = 5;

impl Hyper {
    pub fn for_envs(envs: usize) -> Self {
        let epochs = (HYPER.epochs * REFERENCE_ENVS / envs.max(1)).clamp(MIN_EPOCHS, HYPER.epochs);

        Self { epochs, ..HYPER }
    }
}

pub struct Learner {
    pub nobs: usize,
    pub nact: usize,
    pub actor: Mlp,
    pub critic: Mlp,
    pub params: Vec<f32>,
    log_std_at: usize,
    grads: Vec<f32>,
    adam: Adam,
    pub learn_rate: f32,
    actor_scratch: Scratch,
    critic_scratch: Scratch,
    pair: Pool,
}

fn sized(nobs: usize, nact: usize) -> Vec<usize> {
    let mut sizes = vec![nobs];

    sizes.extend_from_slice(&HIDDEN);
    sizes.push(nact);

    sizes
}

impl Learner {
    pub fn new(nobs: usize, nact: usize, capacity: usize, rng: &mut Rng) -> Self {
        let actor = Mlp::plan(&sized(nobs, nact), 0);
        let critic = Mlp::plan(&sized(nobs, 1), actor.param_end());
        let log_std_at = critic.param_end();
        let total = log_std_at + nact;
        let mut params = vec![0.0f32; total];

        actor.initialize(&mut params, ACTOR_OUT_GAIN, rng);
        critic.initialize(&mut params, CRITIC_OUT_GAIN, rng);
        params[log_std_at..].fill(LOG_STD_INIT);

        Self {
            nobs,
            nact,
            actor_scratch: actor.scratch(capacity),
            critic_scratch: critic.scratch(capacity),
            actor,
            critic,
            params,
            log_std_at,
            grads: vec![0.0; total],
            adam: Adam::new(total),
            learn_rate: 1e-3,
            pair: Pool::new(2),
        }
    }

    pub fn mask_actor(&mut self, inputs: &[usize]) {
        self.actor.mask_inputs(inputs);
        self.actor.zero_masked(&mut self.params);
    }

    pub fn log_std(&self) -> &[f32] {
        &self.params[self.log_std_at..]
    }

    pub fn log_std_mut(&mut self) -> &mut [f32] {
        &mut self.params[self.log_std_at..]
    }

    pub fn act_mean<'a>(&'a mut self, math: &Math, obs: &[f32], rows: usize) -> &'a [f32] {
        self.actor
            .forward(math, &self.params, obs, rows, &mut self.actor_scratch)
    }

    pub fn value<'a>(&'a mut self, math: &Math, obs: &[f32], rows: usize) -> &'a [f32] {
        self.critic
            .forward(math, &self.params, obs, rows, &mut self.critic_scratch)
    }

    fn gradients(&mut self, math: &Math, batch: &Minibatch, hp: &Hyper) -> f32 {
        let params = &self.params[..];
        let (actor_grads, rest) = self.grads.split_at_mut(self.critic.first_param);
        let (critic_grads, log_std_grads) = rest.split_at_mut(self.log_std_at - self.critic.first_param);
        let terms = PolicyTerms {
            log_std: &params[self.log_std_at..],
            log_std_grads,
            clip: hp.clip,
            ent_coef: hp.ent_coef,
        };
        let actor = Head {
            net: &self.actor,
            scratch: &mut self.actor_scratch,
            params,
            grads: actor_grads,
        };
        let critic = Head {
            net: &self.critic,
            scratch: &mut self.critic_scratch,
            params,
            grads: critic_grads,
        };

        if !math.runs_heads_together() {
            let kl = policy_gradient(math, actor, batch, terms);

            value_gradient(math, critic, batch);

            return kl;
        }

        let policy_job = Mutex::new(Some((actor, terms)));
        let value_job = Mutex::new(Some(critic));
        let kl = Mutex::new(0.0f32);

        self.pair.run(2, |task| {
            if task == 0 {
                let (head, terms) = policy_job.lock().expect("policy job").take().expect("runs once");

                *kl.lock().expect("kl") = policy_gradient(math, head, batch, terms);

                return;
            }

            let head = value_job.lock().expect("value job").take().expect("runs once");

            value_gradient(math, head, batch);
        });

        kl.into_inner().expect("kl")
    }

    pub fn minibatch_step(&mut self, math: &Math, batch: &Minibatch, hp: &Hyper) -> f32 {
        let kl = self.gradients(math, batch, hp);
        let norm = clip_gradient(&mut self.grads, GRAD_NORM_MAX);

        if norm.is_finite() {
            self.adam.step(&mut self.params, &self.grads, self.learn_rate);
        }

        if kl > hp.desired_kl * 2.0 {
            self.learn_rate = (self.learn_rate / 1.5).max(LEARN_RATE_MIN);
        } else if kl < hp.desired_kl / 2.0 {
            self.learn_rate = (self.learn_rate * 1.5).min(LEARN_RATE_MAX);
        }

        kl
    }
}

#[cfg(test)]
mod tests {
    use super::{Hyper, HYPER};

    #[test]
    fn small_batches_are_reused_more() {
        assert_eq!(Hyper::for_envs(64).epochs, HYPER.epochs);
        assert_eq!(Hyper::for_envs(32).epochs, HYPER.epochs);
        assert_eq!(Hyper::for_envs(128).epochs, HYPER.epochs / 2);
        assert_eq!(Hyper::for_envs(1024).epochs, 5);
    }
}
