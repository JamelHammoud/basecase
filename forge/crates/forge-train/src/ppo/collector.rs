use crate::envs::{Envs, StepResult};
use crate::episodes::Episodes;
use crate::events::Phases;
use crate::heads::gaussian_constant;
use crate::kernels::Math;
use crate::mlp::{Mlp, Scratch};
use crate::normalizer::Normalizer;
use crate::ppo::rollout::Rollout;
use crate::rng::Rng;
use crate::update::Learner;
use std::time::Instant;

pub struct Collector<'a> {
    pub envs: Envs<'a>,
    pub norm: Normalizer,
    pub episodes: Episodes,
    pub phases: Phases,
    pub steps: u64,
    math: Math,
    actor: Mlp,
    critic: Mlp,
    params: Vec<f32>,
    actor_scratch: Scratch,
    critic_scratch: Scratch,
    obs_raw: Vec<f32>,
    noise_rngs: Vec<Rng>,
    reward: Vec<f32>,
    fell: Vec<bool>,
    timeout: Vec<bool>,
}

impl<'a> Collector<'a> {
    pub fn new(mut envs: Envs<'a>, learner: &Learner, seed: u64) -> Self {
        let n = envs.count;
        let nobs = envs.robot.nobs();
        let mut norm = Normalizer::new(nobs);
        let mut obs_raw = vec![0.0f32; n * nobs];

        envs.observe(&mut obs_raw);
        norm.update(&obs_raw);

        Self {
            norm,
            episodes: Episodes::new(n, envs.robot.control_dt),
            phases: Phases::default(),
            steps: 0,
            math: Math::native(1),
            actor: learner.actor.clone(),
            critic: learner.critic.clone(),
            params: learner.params.clone(),
            actor_scratch: learner.actor.scratch(n),
            critic_scratch: learner.critic.scratch(n),
            obs_raw,
            noise_rngs: (0..n).map(|i| Rng::new(seed, 2_000_000 + i as u64)).collect(),
            reward: vec![0.0; n],
            fell: vec![false; n],
            timeout: vec![false; n],
            envs,
        }
    }

    pub fn follow(&mut self, learner: &Learner) {
        self.params.copy_from_slice(&learner.params);
    }

    fn sample_actions(&mut self, rollout: &mut Rollout, t: usize) {
        let n = self.envs.count;
        let nact = self.envs.robot.nact;
        let nobs = self.envs.robot.nobs();
        let start = t * n;
        let log_std = &self.params[self.params.len() - nact..];
        let std: Vec<f32> = log_std.iter().map(|s| s.exp()).collect();
        let constant = gaussian_constant(log_std);
        let obs = &rollout.obs[start * nobs..(start + n) * nobs];
        let mean = self
            .actor
            .forward(&self.math, &self.params, obs, n, &mut self.actor_scratch);
        let act = &mut rollout.act[start * nact..(start + n) * nact];
        let logp = &mut rollout.logp[start..start + n];

        for (sim, rng) in self.noise_rngs.iter_mut().enumerate() {
            let mut quadratic = 0.0f32;

            for j in 0..nact {
                let unit = rng.normal() as f32;

                act[sim * nact + j] = mean[sim * nact + j] + std[j] * unit;
                quadratic += unit * unit;
            }

            logp[sim] = -0.5 * quadratic - constant;
        }

        let value = self
            .critic
            .forward(&self.math, &self.params, obs, n, &mut self.critic_scratch);

        rollout.val[start..start + n].copy_from_slice(value);
    }

    pub fn collect(&mut self, rollout: &mut Rollout) -> Result<(), String> {
        let n = self.envs.count;
        let nobs = self.envs.robot.nobs();
        let nact = self.envs.robot.nact;
        let horizon = rollout.len() / n;

        for t in 0..horizon {
            let tick = Instant::now();
            let start = t * n;

            self.norm
                .apply(&self.obs_raw, &mut rollout.obs[start * nobs..(start + n) * nobs]);
            self.sample_actions(rollout, t);
            self.phases.inference += tick.elapsed().as_secs_f64();

            let action = &rollout.act[start * nact..(start + n) * nact];
            let result = StepResult {
                reward: &mut self.reward,
                fell: &mut self.fell,
                timeout: &mut self.timeout,
            };

            self.envs.step(action, result, &mut self.phases)?;
            self.episodes.track(&self.fell, &self.timeout);

            for sim in 0..n {
                let finished = self.fell[sim] || self.timeout[sim];

                rollout.rew[start + sim] = self.reward[sim];
                rollout.done[start + sim] = f32::from(u8::from(finished));
                rollout.timeout[start + sim] = f32::from(u8::from(self.timeout[sim]));
            }

            let tick = Instant::now();

            self.envs.observe(&mut self.obs_raw);
            self.norm.update(&self.obs_raw);
            self.phases.observe += tick.elapsed().as_secs_f64();
            self.steps += n as u64;
        }

        self.norm.apply(&self.obs_raw, &mut rollout.final_obs);

        let last = self.critic.forward(
            &self.math,
            &self.params,
            &rollout.final_obs,
            n,
            &mut self.critic_scratch,
        );

        rollout.final_values.copy_from_slice(last);

        Ok(())
    }
}
