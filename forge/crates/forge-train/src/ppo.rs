use crate::envs::{Envs, StepResult};
use crate::events::Phases;
use crate::heads::gaussian_constant;
use crate::kernels::Math;
use crate::normalizer::Normalizer;
use crate::rng::Rng;
use crate::update::{Hyper, Learner, Minibatch, HYPER};
use std::time::Instant;

const RECENT_EPISODES: usize = 200;

pub struct Rollout {
    obs: Vec<f32>,
    act: Vec<f32>,
    logp: Vec<f32>,
    val: Vec<f32>,
    rew: Vec<f32>,
    done: Vec<f32>,
    timeout: Vec<f32>,
    adv: Vec<f32>,
    ret: Vec<f32>,
}

pub struct Ppo<'a> {
    pub envs: Envs<'a>,
    pub learner: Learner,
    pub norm: Normalizer,
    pub math: Math,
    pub hyper: Hyper,
    pub steps: u64,
    pub phases: Phases,
    pub last_reward_mean: f64,
    obs_raw: Vec<f32>,
    obs_normalized: Vec<f32>,
    noise_rngs: Vec<Rng>,
    shuffle_rng: Rng,
    rollout: Rollout,
    episode_return: Vec<f32>,
    episode_length: Vec<f64>,
    recent_lengths: Vec<f64>,
    step_reward: Vec<f32>,
    step_fell: Vec<bool>,
    step_timeout: Vec<bool>,
    order: Vec<u32>,
    mb_obs: Vec<f32>,
    mb_act: Vec<f32>,
    mb_logp: Vec<f32>,
    mb_adv: Vec<f32>,
    mb_ret: Vec<f32>,
    final_values: Vec<f32>,
}

impl Rollout {
    fn new(total: usize, nobs: usize, nact: usize) -> Self {
        Self {
            obs: vec![0.0; total * nobs],
            act: vec![0.0; total * nact],
            logp: vec![0.0; total],
            val: vec![0.0; total],
            rew: vec![0.0; total],
            done: vec![0.0; total],
            timeout: vec![0.0; total],
            adv: vec![0.0; total],
            ret: vec![0.0; total],
        }
    }
}

impl<'a> Ppo<'a> {
    pub fn new(mut envs: Envs<'a>, seed: u64, math: Math) -> Self {
        let n = envs.count;
        let nact = envs.robot.nact;
        let nobs = 12 + 3 * nact;
        let hyper = HYPER;
        let total = hyper.horizon * n;
        let mb = total / hyper.minibatches;
        let mut init_rng = Rng::new(seed, 1_000_000);
        let learner = Learner::new(nobs, nact, mb.max(n), &mut init_rng);
        let mut norm = Normalizer::new(nobs);
        let mut obs_raw = vec![0.0f32; n * nobs];

        envs.observe(&mut obs_raw);
        norm.update(&obs_raw);

        Self {
            envs,
            learner,
            norm,
            math,
            hyper,
            steps: 0,
            phases: Phases::default(),
            last_reward_mean: 0.0,
            obs_raw,
            obs_normalized: vec![0.0; n * nobs],
            noise_rngs: (0..n).map(|i| Rng::new(seed, 2_000_000 + i as u64)).collect(),
            shuffle_rng: Rng::new(seed, 3_000_000),
            rollout: Rollout::new(total, nobs, nact),
            episode_return: vec![0.0; n],
            episode_length: vec![0.0; n],
            recent_lengths: Vec::new(),
            step_reward: vec![0.0; n],
            step_fell: vec![false; n],
            step_timeout: vec![false; n],
            order: (0..total as u32).collect(),
            mb_obs: vec![0.0; mb * nobs],
            mb_act: vec![0.0; mb * nact],
            mb_logp: vec![0.0; mb],
            mb_adv: vec![0.0; mb],
            mb_ret: vec![0.0; mb],
            final_values: vec![0.0; n],
        }
    }

    pub fn mean_episode_seconds(&self) -> f64 {
        if self.recent_lengths.is_empty() {
            return 0.0;
        }

        self.recent_lengths.iter().sum::<f64>() / self.recent_lengths.len() as f64
    }

    fn sample_actions(&mut self, t: usize) {
        let n = self.envs.count;
        let nact = self.learner.nact;
        let nobs = self.learner.nobs;
        let start = t * n;
        let learner = &mut self.learner;
        let log_std: Vec<f32> = learner.log_std().to_vec();
        let std: Vec<f32> = log_std.iter().map(|s| s.exp()).collect();
        let constant = gaussian_constant(&log_std);
        let obs = &self.rollout.obs[start * nobs..(start + n) * nobs];
        let mean = learner.act_mean(&self.math, obs, n);
        let act = &mut self.rollout.act[start * nact..(start + n) * nact];
        let logp = &mut self.rollout.logp[start..start + n];

        for (sim, rng) in self.noise_rngs.iter_mut().enumerate() {
            let mut quadratic = 0.0f32;

            for j in 0..nact {
                let unit = rng.normal() as f32;

                act[sim * nact + j] = mean[sim * nact + j] + std[j] * unit;
                quadratic += unit * unit;
            }

            logp[sim] = -0.5 * quadratic - constant;
        }

        let value = self.learner.value(&self.math, obs, n);

        self.rollout.val[start..start + n].copy_from_slice(value);
    }

    fn track_episodes(&mut self) {
        let dt = self.envs.robot.control_dt;

        for sim in 0..self.envs.count {
            self.episode_return[sim] += self.step_reward[sim];
            self.episode_length[sim] += 1.0;

            if self.step_fell[sim] || self.step_timeout[sim] {
                self.recent_lengths.push(self.episode_length[sim] * dt);
                self.episode_return[sim] = 0.0;
                self.episode_length[sim] = 0.0;
            }
        }
    }

    fn collect(&mut self) -> Result<(), String> {
        let n = self.envs.count;
        let nobs = self.learner.nobs;
        let nact = self.learner.nact;

        for t in 0..self.hyper.horizon {
            let tick = Instant::now();
            let start = t * n;

            self.norm
                .apply(&self.obs_raw, &mut self.rollout.obs[start * nobs..(start + n) * nobs]);
            self.sample_actions(t);
            self.phases.inference += tick.elapsed().as_secs_f64();

            let action = &self.rollout.act[start * nact..(start + n) * nact];
            let result = StepResult {
                reward: &mut self.step_reward,
                fell: &mut self.step_fell,
                timeout: &mut self.step_timeout,
            };

            self.envs.step(action, result, &mut self.phases)?;
            self.track_episodes();

            for sim in 0..n {
                let finished = self.step_fell[sim] || self.step_timeout[sim];

                self.rollout.rew[start + sim] = self.step_reward[sim];
                self.rollout.done[start + sim] = f32::from(u8::from(finished));
                self.rollout.timeout[start + sim] = f32::from(u8::from(self.step_timeout[sim]));
            }

            let tick = Instant::now();

            self.envs.observe(&mut self.obs_raw);
            self.norm.update(&self.obs_raw);
            self.phases.observe += tick.elapsed().as_secs_f64();
            self.steps += n as u64;
        }

        Ok(())
    }

    fn advantages(&mut self) {
        let n = self.envs.count;
        let horizon = self.hyper.horizon;
        let Hyper { gamma, lam, .. } = self.hyper;

        self.norm.apply(&self.obs_raw, &mut self.obs_normalized);
        self.final_values
            .copy_from_slice(self.learner.value(&self.math, &self.obs_normalized, n));

        let rollout = &mut self.rollout;

        for i in 0..horizon * n {
            rollout.rew[i] += gamma * rollout.val[i] * rollout.timeout[i];
        }

        for sim in 0..n {
            let mut gae = 0.0f32;

            for t in (0..horizon).rev() {
                let at = t * n + sim;
                let next_value = if t == horizon - 1 {
                    self.final_values[sim]
                } else {
                    rollout.val[at + n]
                };
                let alive = 1.0 - rollout.done[at];
                let delta = rollout.rew[at] + gamma * next_value * alive - rollout.val[at];

                gae = delta + gamma * lam * alive * gae;
                rollout.adv[at] = gae;
                rollout.ret[at] = gae + rollout.val[at];
            }
        }
    }

    fn normalize_advantages(&mut self) {
        let adv = &mut self.rollout.adv;
        let total = adv.len() as f64;
        let mean = adv.iter().map(|v| *v as f64).sum::<f64>() / total;
        let var = adv.iter().map(|v| (*v as f64 - mean).powi(2)).sum::<f64>() / (total - 1.0).max(1.0);
        let std = var.sqrt() + 1e-8;

        adv.iter_mut().for_each(|v| *v = ((*v as f64 - mean) / std) as f32);
    }

    fn gather(&mut self, chosen: std::ops::Range<usize>) {
        let nobs = self.learner.nobs;
        let nact = self.learner.nact;
        let rollout = &self.rollout;

        for (slot, &index) in self.order[chosen].iter().enumerate() {
            let i = index as usize;

            self.mb_obs[slot * nobs..(slot + 1) * nobs].copy_from_slice(&rollout.obs[i * nobs..(i + 1) * nobs]);
            self.mb_act[slot * nact..(slot + 1) * nact].copy_from_slice(&rollout.act[i * nact..(i + 1) * nact]);
            self.mb_logp[slot] = rollout.logp[i];
            self.mb_adv[slot] = rollout.adv[i];
            self.mb_ret[slot] = rollout.ret[i];
        }
    }

    fn update(&mut self) {
        let total = self.hyper.horizon * self.envs.count;
        let mb = total / self.hyper.minibatches;

        self.normalize_advantages();

        for _ in 0..self.hyper.epochs {
            self.shuffle_rng.shuffle(&mut self.order);

            for k in 0..self.hyper.minibatches {
                self.gather(k * mb..(k + 1) * mb);

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
    }

    pub fn trim_recent(&mut self) {
        let extra = self.recent_lengths.len().saturating_sub(RECENT_EPISODES);

        self.recent_lengths.drain(..extra);
    }

    pub fn iterate(&mut self) -> Result<(), String> {
        self.collect()?;

        let tick = Instant::now();

        self.advantages();
        self.last_reward_mean = self.rollout.rew.iter().map(|v| *v as f64).sum::<f64>() / self.rollout.rew.len() as f64;
        self.update();
        self.phases.gradient += tick.elapsed().as_secs_f64();

        Ok(())
    }
}
