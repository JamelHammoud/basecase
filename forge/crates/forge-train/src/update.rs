use crate::adam::{clip_scale, Adam, Moments};
use crate::blocks::{Blocks, Nets, Refresh};
use crate::kernels::Math;
use crate::mlp::{Mlp, Scratch};
use crate::pool::SharedSlice;
use crate::rng::Rng;

pub use crate::heads::Minibatch;

const HIDDEN: [usize; 3] = [256, 128, 64];
const LOG_STD_INIT: f32 = -0.7;
pub const LOG_STD_MAX: f32 = 0.0;
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
    log_std_min: f32,
    actor_scratch: Scratch,
    critic_scratch: Scratch,
    blocks: Blocks,
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
            blocks: Blocks::new(&actor, &critic, capacity),
            actor,
            critic,
            params,
            log_std_at,
            grads: vec![0.0; total],
            adam: Adam::new(total),
            learn_rate: 1e-3,
            log_std_min: f32::NEG_INFINITY,
        }
    }

    pub fn mask_actor(&mut self, inputs: &[usize]) {
        self.actor.mask_inputs(inputs);
        self.actor.zero_masked(&mut self.params);
    }

    pub fn log_std(&self) -> &[f32] {
        &self.params[self.log_std_at..]
    }

    pub fn set_log_std(&mut self, values: &[f32]) {
        self.params[self.log_std_at..].copy_from_slice(values);
        self.cap_log_std();
    }

    pub fn floor_log_std(&mut self, floor: f32) {
        self.log_std_min = floor.min(LOG_STD_MAX);
        self.cap_log_std();
    }

    fn cap_log_std(&mut self) {
        let (low, high) = (self.log_std_min, LOG_STD_MAX);

        self.params[self.log_std_at..]
            .iter_mut()
            .for_each(|s| *s = s.clamp(low, high));
    }

    pub fn act_mean<'a>(&'a mut self, math: &Math, obs: &[f32], rows: usize) -> &'a [f32] {
        self.actor
            .forward(math, &self.params, obs, rows, &mut self.actor_scratch)
    }

    pub fn value<'a>(&'a mut self, math: &Math, obs: &[f32], rows: usize) -> &'a [f32] {
        self.critic
            .forward(math, &self.params, obs, rows, &mut self.critic_scratch)
    }

    fn nets(&self) -> Nets<'_> {
        Nets {
            actor: &self.actor,
            critic: &self.critic,
            params: &self.params,
            log_std_at: self.log_std_at,
        }
    }

    pub fn refresh(&self, math: &Math, targets: Refresh) {
        self.blocks.refresh(math, &self.nets(), targets);
    }

    fn apply_gradients(&mut self, scale: f32) {
        let step = self.adam.begin(self.learn_rate);
        let Moments { first, second } = self.adam.moments();
        let len = self.params.len();
        let slices = [
            SharedSlice::new(&mut self.params),
            SharedSlice::new(&mut self.grads),
            SharedSlice::new(first),
            SharedSlice::new(second),
        ];

        self.blocks.spans(len, |from, to| {
            let [params, grads, first, second] = slices.each_ref().map(|s| unsafe { s.range(from, to) });

            if scale < 1.0 {
                grads.iter_mut().for_each(|g| *g *= scale);
            }

            step.apply(params, grads, Moments { first, second });
        });
    }

    pub fn minibatch_step(&mut self, math: &Math, batch: &Minibatch, hp: &Hyper) -> f32 {
        let kl = self.blocks.gradients(math, &self.nets(), batch, hp);
        let mut grads = std::mem::take(&mut self.grads);
        let norm = self.blocks.reduce(&mut grads, &self.nets());

        self.grads = grads;

        if norm.is_finite() {
            self.apply_gradients(clip_scale(norm, GRAD_NORM_MAX));
            self.cap_log_std();
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
    fn exploration_noise_never_passes_the_action_range() {
        let mut learner = super::Learner::new(4, 2, 4, &mut crate::rng::Rng::new(1, 0));

        learner.set_log_std(&[1.7, -2.0]);

        assert_eq!(learner.log_std(), &[super::LOG_STD_MAX, -2.0]);

        learner.floor_log_std(-1.5);

        assert_eq!(learner.log_std(), &[super::LOG_STD_MAX, -1.5]);
    }

    #[test]
    fn small_batches_are_reused_more() {
        assert_eq!(Hyper::for_envs(64).epochs, HYPER.epochs);
        assert_eq!(Hyper::for_envs(32).epochs, HYPER.epochs);
        assert_eq!(Hyper::for_envs(128).epochs, HYPER.epochs / 2);
        assert_eq!(Hyper::for_envs(1024).epochs, 5);
    }
}
