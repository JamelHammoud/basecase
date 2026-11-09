use super::{Hyper, Learner, Minibatch, GRAD_NORM_MAX, LEARN_RATE_MAX, LEARN_RATE_MIN, LOG_STD_MAX};
use crate::adam::{clip_gradient, Adam};
use crate::blocks::Refresh;
use crate::heads::{policy_gradient, value_gradient, Head, PolicyTerms};
use crate::kernels::Math;
use crate::mask::LINEAR_VELOCITY;
use crate::mlp::{Mlp, Scratch};
use crate::rng::Rng;

const NOBS: usize = 30;
const NACT: usize = 6;
const ROWS: usize = 384;
const STEPS: usize = 60;
const LOG_STD_FLOOR: f32 = -2.5;

struct WholeBatch {
    actor: Mlp,
    critic: Mlp,
    params: Vec<f32>,
    log_std_at: usize,
    log_std_min: f32,
    squashed: bool,
    adam: Adam,
    learn_rate: f32,
    actor_scratch: Scratch,
    critic_scratch: Scratch,
}

impl WholeBatch {
    fn copy_of(learner: &Learner, log_std_min: f32) -> Self {
        Self {
            actor_scratch: learner.actor.scratch(ROWS),
            critic_scratch: learner.critic.scratch(ROWS),
            actor: learner.actor.clone(),
            critic: learner.critic.clone(),
            params: learner.params.clone(),
            log_std_at: learner.log_std_at,
            log_std_min,
            squashed: learner.squashed,
            adam: learner.adam.clone(),
            learn_rate: learner.learn_rate,
        }
    }

    fn step(&mut self, math: &Math, batch: &Minibatch, hp: &Hyper) -> (f32, Vec<f32>) {
        let mut grads = vec![0.0f32; self.params.len()];
        let (actor_grads, rest) = grads.split_at_mut(self.critic.first_param);
        let (critic_grads, log_std_grads) = rest.split_at_mut(self.log_std_at - self.critic.first_param);
        let scale = 1.0 / batch.rows as f32;
        let actor = Head {
            net: &self.actor,
            scratch: &mut self.actor_scratch,
            params: &self.params,
            grads: actor_grads,
        };
        let terms = PolicyTerms {
            log_std: &self.params[self.log_std_at..],
            log_std_grads,
            clip: hp.clip,
            ent_coef: hp.ent_coef,
            squash_coef: if self.squashed { hp.ent_coef } else { 0.0 },
            scale,
        };
        let kl = (policy_gradient(math, actor, batch, terms) / batch.rows as f64) as f32;
        let critic = Head {
            net: &self.critic,
            scratch: &mut self.critic_scratch,
            params: &self.params,
            grads: critic_grads,
        };

        value_gradient(math, critic, batch, scale);

        let norm = clip_gradient(&mut grads, GRAD_NORM_MAX);

        if norm.is_finite() {
            self.adam.step(&mut self.params, &grads, self.learn_rate);

            let (low, high) = (self.log_std_min, LOG_STD_MAX);

            self.params[self.log_std_at..]
                .iter_mut()
                .for_each(|s| *s = s.clamp(low, high));
        }

        if kl > hp.desired_kl * 2.0 {
            self.learn_rate = (self.learn_rate / 1.5).max(LEARN_RATE_MIN);
        } else if kl < hp.desired_kl / 2.0 {
            self.learn_rate = (self.learn_rate * 1.5).min(LEARN_RATE_MAX);
        }

        (kl, grads)
    }
}

struct Samples {
    obs: Vec<f32>,
    act: Vec<f32>,
    logp: Vec<f32>,
    adv: Vec<f32>,
    ret: Vec<f32>,
}

fn draw(rng: &mut Rng, count: usize, scale: f32) -> Vec<f32> {
    (0..count).map(|_| rng.normal() as f32 * scale).collect()
}

fn samples(learner: &Learner, rng: &mut Rng) -> Samples {
    let obs = draw(rng, ROWS * NOBS, 1.0);
    let act = draw(rng, ROWS * NACT, 0.5);
    let (mut logp, mut val) = (vec![0.0f32; ROWS], vec![0.0f32; ROWS]);
    let targets = Refresh {
        obs: &obs,
        act: &act,
        logp: &mut logp,
        val: &mut val,
    };

    learner.refresh(&Math::native(1), targets);
    logp.iter_mut().for_each(|l| *l += rng.normal() as f32 * 0.1);

    Samples {
        adv: draw(rng, ROWS, 1.0),
        ret: val.iter().map(|v| v + rng.normal() as f32).collect(),
        obs,
        act,
        logp,
    }
}

fn minibatch(s: &Samples) -> Minibatch<'_> {
    Minibatch {
        rows: ROWS,
        obs: &s.obs,
        act: &s.act,
        logp: &s.logp,
        adv: &s.adv,
        ret: &s.ret,
    }
}

fn worst_gap(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| (x - y).abs()).fold(0.0, f32::max)
}

fn check_steps(squashed: bool) {
    let math = Math::native(4);
    let hp = Hyper::for_envs(64);
    let mut rng = Rng::new(7, 0);
    let mut learner = Learner::new(NOBS, NACT, ROWS, &mut rng);

    learner.mask_actor(&LINEAR_VELOCITY);
    learner.squashed = squashed;
    learner.set_log_std(&[-2.49, -2.45, -0.7, -0.01, 0.0, -1.2]);
    learner.floor_log_std(LOG_STD_FLOOR);

    for step in 0..STEPS {
        let data = samples(&learner, &mut rng);
        let mut reference = WholeBatch::copy_of(&learner, LOG_STD_FLOOR);
        let rate = learner.learn_rate;
        let kl = learner.minibatch_step(&math, &minibatch(&data), &hp);
        let (expected_kl, grads) = reference.step(&math, &minibatch(&data), &hp);
        let grad_scale = grads.iter().fold(0.0f32, |m, g| m.max(g.abs()));
        let grad_gap = worst_gap(&learner.grads, &grads);
        let param_gap = worst_gap(&learner.params, &reference.params);

        assert!(
            (kl - expected_kl).abs() <= 1e-6 * expected_kl.abs() + 1e-9,
            "step {step}: kl {kl} against {expected_kl}"
        );
        assert_eq!(learner.learn_rate, reference.learn_rate, "step {step}");
        assert!(
            grad_gap <= 1e-5 * grad_scale,
            "step {step}: gradients differ by {grad_gap} of {grad_scale}"
        );
        assert!(
            param_gap <= 1e-2 * rate,
            "step {step}: parameters differ by {param_gap} after a step of {rate}"
        );
        assert!(learner
            .log_std()
            .iter()
            .all(|s| (LOG_STD_FLOOR..=LOG_STD_MAX).contains(s)));
    }
}

#[test]
fn row_blocks_take_the_whole_batch_learners_steps() {
    check_steps(false);
}

#[test]
fn row_blocks_take_the_whole_batch_learners_squashed_steps() {
    check_steps(true);
}
