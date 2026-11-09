mod collector;
mod resume;
mod rollout;

use crate::algorithm::{Algorithm, Report};
use crate::blocks::Refresh;
use crate::clock::Instant;
use crate::deployed::{Deployed, Squash};
use crate::envs::Envs;
use crate::kernels::Math;
use crate::mask::actor_mask;
use crate::normalizer::Normalizer;
use crate::rng::Rng;
use crate::update::{Hyper, Learner, Minibatch};
use crate::warm::{Snapshot, WarmStart};
use collector::Collector;
use rollout::Rollout;

pub struct Update {
    pub learner: Learner,
    pub math: Math,
    hyper: Hyper,
    shuffle_rng: Rng,
    order: Vec<u32>,
    mb_obs: Vec<f32>,
    mb_act: Vec<f32>,
    mb_logp: Vec<f32>,
    mb_adv: Vec<f32>,
    mb_ret: Vec<f32>,
    seconds: f64,
}

pub struct Ppo<'a> {
    collector: Collector<'a>,
    update: Update,
    rollouts: [Rollout; 2],
    pending: bool,
}

impl Update {
    fn gather(&mut self, rollout: &Rollout, chosen: std::ops::Range<usize>) {
        let nobs = self.learner.nobs;
        let nact = self.learner.nact;

        for (slot, &index) in self.order[chosen].iter().enumerate() {
            let i = index as usize;

            self.mb_obs[slot * nobs..(slot + 1) * nobs].copy_from_slice(&rollout.obs[i * nobs..(i + 1) * nobs]);
            self.mb_act[slot * nact..(slot + 1) * nact].copy_from_slice(&rollout.act[i * nact..(i + 1) * nact]);
            self.mb_logp[slot] = rollout.logp[i];
            self.mb_adv[slot] = rollout.adv[i];
            self.mb_ret[slot] = rollout.ret[i];
        }
    }

    fn refresh(&mut self, rollout: &mut Rollout) {
        let n = rollout.envs;
        let targets = Refresh {
            obs: &rollout.obs,
            act: &rollout.act,
            logp: &mut rollout.logp,
            val: &mut rollout.val,
        };

        self.learner.refresh(&self.math, targets);

        let last = self.learner.value(&self.math, &rollout.final_obs, n);

        rollout.final_values.copy_from_slice(last);
    }

    fn learn(&mut self, rollout: &mut Rollout) {
        let tick = Instant::now();
        let total = rollout.len();
        let mb = total / self.hyper.minibatches;

        self.refresh(rollout);

        rollout.advantages(self.hyper.gamma, self.hyper.lam);
        rollout.normalize_advantages();

        for _ in 0..self.hyper.epochs {
            self.shuffle_rng.shuffle(&mut self.order);

            for k in 0..self.hyper.minibatches {
                self.gather(rollout, k * mb..(k + 1) * mb);

                let batch = Minibatch {
                    rows: mb,
                    obs: &self.mb_obs,
                    act: &self.mb_act,
                    logp: &self.mb_logp,
                    adv: &self.mb_adv,
                    ret: &self.mb_ret,
                };

                self.learner.minibatch_step(&self.math, &batch, &self.hyper);
            }
        }

        self.seconds += tick.elapsed().as_secs_f64();
    }
}

impl<'a> Ppo<'a> {
    pub fn new(envs: Envs<'a>, seed: u64, math: Math) -> Self {
        let n = envs.count;
        let nact = envs.robot.nact;
        let nobs = envs.robot.nobs();
        let hyper = Hyper::for_envs(n);
        let total = hyper.horizon * n;
        let mb = total / hyper.minibatches;
        let mut init_rng = Rng::new(seed, 1_000_000);
        let mut learner = Learner::new(nobs, nact, mb.max(n), &mut init_rng);

        learner.mask_actor(actor_mask(&envs.robot.job.options));
        learner.squashed = envs.robot.job.squash == Squash::Tanh;

        if let Some(floor) = envs.robot.job.log_std_min {
            learner.floor_log_std(floor);
        }

        let collector = Collector::new(envs, &learner, seed);

        Self {
            collector,
            update: Update {
                learner,
                math,
                hyper,
                shuffle_rng: Rng::new(seed, 3_000_000),
                order: (0..total as u32).collect(),
                mb_obs: vec![0.0; mb * nobs],
                mb_act: vec![0.0; mb * nact],
                mb_logp: vec![0.0; mb],
                mb_adv: vec![0.0; mb],
                mb_ret: vec![0.0; mb],
                seconds: 0.0,
            },
            rollouts: [
                Rollout::new(n, hyper.horizon, nobs, nact),
                Rollout::new(n, hyper.horizon, nobs, nact),
            ],
            pending: false,
        }
    }

    fn first_rollout(&mut self) -> Result<(), String> {
        self.collector.follow(&self.update.learner);
        self.collector.collect(&mut self.rollouts[0])?;
        self.pending = true;

        Ok(())
    }

    fn learn_while_collecting(&mut self) -> Result<(), String> {
        self.collector.follow(&self.update.learner);

        let [learning, collecting] = &mut self.rollouts;
        let update = &mut self.update;
        let collector = &mut self.collector;
        let collected = overlap(update, learning, collector, collecting);

        self.rollouts.swap(0, 1);

        collected
    }
}

#[cfg(target_arch = "wasm32")]
fn overlap(
    update: &mut Update,
    learning: &mut Rollout,
    collector: &mut Collector,
    collecting: &mut Rollout,
) -> Result<(), String> {
    update.learn(learning);
    collector.collect(collecting)
}

#[cfg(not(target_arch = "wasm32"))]
fn overlap(
    update: &mut Update,
    learning: &mut Rollout,
    collector: &mut Collector,
    collecting: &mut Rollout,
) -> Result<(), String> {
    std::thread::scope(|scope| {
        let learner = scope.spawn(|| {
            crate::platform::raise_thread_priority();
            update.learn(learning);
        });
        let collected = collector.collect(collecting);

        learner.join().map_err(|_| "The learner thread panicked".to_owned())?;

        collected
    })
}

impl Algorithm for Ppo<'_> {
    fn iterate(&mut self) -> Result<(), String> {
        if !self.pending {
            return self.first_rollout();
        }

        self.learn_while_collecting()
    }

    fn report(&mut self) -> Report {
        self.collector.episodes.trim();

        let mut phases = self.collector.phases;

        phases.gradient = self.update.seconds;

        Report {
            steps: self.collector.steps,
            phases,
            reward_mean: self.rollouts[0].reward_mean(),
            episode_seconds: self.collector.episodes.mean_seconds(),
        }
    }

    fn deployed(&self) -> Deployed {
        let learner = &self.update.learner;

        let squash = if learner.squashed { Squash::Tanh } else { Squash::Clip };

        Deployed::new(learner.actor.clone(), learner.params.clone(), squash)
    }

    fn norm(&self) -> &Normalizer {
        &self.collector.norm
    }

    fn math(&self) -> &Math {
        &self.update.math
    }

    fn snapshot(&self) -> Snapshot {
        resume::snapshot(self)
    }

    fn warm_start(&mut self, source: &WarmStart) -> Result<Vec<String>, String> {
        resume::warm_start(self, source)
    }
}
