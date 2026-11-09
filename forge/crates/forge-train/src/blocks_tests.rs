use super::{Blocks, Nets, Refresh};
use crate::adam::gradient_norm;
use crate::heads::{gaussian_constant, log_prob, policy_gradient, value_gradient, Head, Minibatch, PolicyTerms};
use crate::kernels::Math;
use crate::mlp::Mlp;
use crate::rng::Rng;
use crate::update::HYPER;

const NOBS: usize = 10;
const NACT: usize = 3;
const ROWS: usize = 4 * 96 + 5;

struct Fixture {
    actor: Mlp,
    critic: Mlp,
    params: Vec<f32>,
    obs: Vec<f32>,
    act: Vec<f32>,
    logp: Vec<f32>,
    adv: Vec<f32>,
    ret: Vec<f32>,
}

fn draw(rng: &mut Rng, count: usize, scale: f32) -> Vec<f32> {
    (0..count).map(|_| rng.normal() as f32 * scale).collect()
}

fn fixture() -> Fixture {
    let mut rng = Rng::new(21, 0);
    let actor = Mlp::plan(&[NOBS, 32, 16, NACT], 0);
    let critic = Mlp::plan(&[NOBS, 32, 16, 1], actor.param_end());
    let mut params = draw(&mut rng, critic.param_end() + NACT, 0.3);

    params[critic.param_end()..].fill(-0.7);

    Fixture {
        obs: draw(&mut rng, ROWS * NOBS, 1.0),
        act: draw(&mut rng, ROWS * NACT, 0.5),
        logp: draw(&mut rng, ROWS, 0.1).iter().map(|v| v - 2.0).collect(),
        adv: draw(&mut rng, ROWS, 1.0),
        ret: draw(&mut rng, ROWS, 1.0),
        actor,
        critic,
        params,
    }
}

impl Fixture {
    fn nets(&self, squashed: bool) -> Nets<'_> {
        Nets {
            actor: &self.actor,
            critic: &self.critic,
            params: &self.params,
            log_std_at: self.critic.param_end(),
            squashed,
        }
    }

    fn batch(&self) -> Minibatch<'_> {
        Minibatch {
            rows: ROWS,
            obs: &self.obs,
            act: &self.act,
            logp: &self.logp,
            adv: &self.adv,
            ret: &self.ret,
        }
    }

    fn whole_batch_gradient(&self, squashed: bool) -> (Vec<f32>, f32) {
        let math = Math::native(1);
        let at = self.critic.first_param;
        let log_std_at = self.critic.param_end();
        let mut grads = vec![0.0f32; self.params.len()];
        let (actor_grads, rest) = grads.split_at_mut(at);
        let (critic_grads, log_std_grads) = rest.split_at_mut(log_std_at - at);
        let actor = Head {
            net: &self.actor,
            scratch: &mut self.actor.scratch(ROWS),
            params: &self.params,
            grads: actor_grads,
        };
        let terms = PolicyTerms {
            log_std: &self.params[log_std_at..],
            log_std_grads,
            clip: HYPER.clip,
            ent_coef: HYPER.ent_coef,
            squash_coef: if squashed { HYPER.ent_coef } else { 0.0 },
            scale: 1.0 / ROWS as f32,
        };
        let kl = policy_gradient(&math, actor, &self.batch(), terms);
        let critic = Head {
            net: &self.critic,
            scratch: &mut self.critic.scratch(ROWS),
            params: &self.params,
            grads: critic_grads,
        };

        value_gradient(&math, critic, &self.batch(), 1.0 / ROWS as f32);

        (grads, (kl / ROWS as f64) as f32)
    }
}

fn close(a: f32, b: f32) -> bool {
    (a - b).abs() <= 1e-6 + 1e-4 * b.abs()
}

fn check_whole_batch_gradient(squashed: bool) {
    let f = fixture();
    let blocks = Blocks::new(&f.actor, &f.critic, ROWS);
    let (expected, expected_kl) = f.whole_batch_gradient(squashed);
    let mut grads = vec![0.0f32; f.params.len()];

    assert_eq!(blocks.count, 4);

    let kl = blocks.gradients(&Math::native(1), &f.nets(squashed), &f.batch(), &HYPER);
    let norm = blocks.reduce(&mut grads, &f.nets(squashed));

    assert!(close(kl, expected_kl), "kl {kl} against {expected_kl}");
    assert!((norm - gradient_norm(&expected)).abs() < 1e-5 * norm);

    for (index, (got, want)) in grads.iter().zip(&expected).enumerate() {
        assert!(close(*got, *want), "gradient {index}: {got} against {want}");
    }
}

#[test]
fn row_blocks_give_the_whole_batch_gradient() {
    check_whole_batch_gradient(false);
}

#[test]
fn row_blocks_give_the_whole_batch_squashed_gradient() {
    check_whole_batch_gradient(true);
}

#[test]
fn refresh_matches_the_exact_policy_and_value() {
    let f = fixture();
    let blocks = Blocks::new(&f.actor, &f.critic, ROWS);
    let log_std = &f.params[f.critic.param_end()..];
    let inverse_std: Vec<f32> = log_std.iter().map(|s| (-s).exp()).collect();
    let constant = gaussian_constant(log_std);
    let (mut logp, mut val) = (vec![0.0f32; ROWS], vec![0.0f32; ROWS]);
    let targets = Refresh {
        obs: &f.obs,
        act: &f.act,
        logp: &mut logp,
        val: &mut val,
    };

    blocks.refresh(&Math::native(1), &f.nets(false), targets);

    for row in 0..ROWS {
        let input = &f.obs[row * NOBS..(row + 1) * NOBS];
        let mean = f.actor.forward_exact(&f.params, input);
        let taken = &f.act[row * NACT..(row + 1) * NACT];
        let want = log_prob(&mean, taken, &inverse_std, constant);
        let value = f.critic.forward_exact(&f.params, input)[0];

        assert!(
            (logp[row] - want).abs() < 1e-3,
            "row {row}: {} against {want}",
            logp[row]
        );
        assert!(
            (val[row] - value).abs() < 1e-4,
            "row {row}: {} against {value}",
            val[row]
        );
    }
}
