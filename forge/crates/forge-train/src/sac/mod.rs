pub mod actor;
pub mod critic;
pub mod dense;
pub mod explore;
pub mod recipe;
pub mod replay;
pub mod rows;

use crate::adam::Adam;
use crate::algorithm::{Algorithm, Report};
use crate::deployed::Deployed;
use crate::envs::{Envs, StepResult};
use crate::episodes::Episodes;
use crate::events::Phases;
use crate::kernels::Math;
use crate::normalizer::Normalizer;
use crate::rng::Rng;
use actor::{Actor, Objective};
use critic::{project, Bellman, Twin};
use explore::{Noise, RewardScale};
use replay::{Replay, Sample, Transitions};
use std::time::Instant;

pub use recipe::Recipe;

struct Step {
    obs_raw: Vec<f32>,
    obs: Vec<f32>,
    next_raw: Vec<f32>,
    stored_next: Vec<f32>,
    reward: Vec<f32>,
    fell: Vec<bool>,
    timeout: Vec<bool>,
    alive: Vec<f32>,
}

struct Batch {
    sample: Sample,
    obs: Vec<f32>,
    next_obs: Vec<f32>,
    rewards: Vec<f32>,
    noise: Vec<f32>,
    critic_in: Vec<f32>,
    entropy: Vec<f32>,
    target: Vec<f32>,
}

pub struct Sac<'a> {
    envs: Envs<'a>,
    recipe: Recipe,
    math: Math,
    actor: Actor,
    critic: Twin,
    log_alpha: Vec<f32>,
    alpha_adam: Adam,
    target_entropy: f32,
    norm: Normalizer,
    replay: Replay,
    scale: RewardScale,
    noise: Noise,
    noise_rngs: Vec<Rng>,
    batch_rng: Rng,
    step: Step,
    batch: Batch,
    steps: u64,
    updates: usize,
    phases: Phases,
    episodes: Episodes,
    reward_sum: f64,
    reward_count: usize,
    last_loss: f32,
}

fn join_rows(left: &[f32], right: &[f32], rows: usize, out: &mut [f32]) {
    let (a, b) = (left.len() / rows, right.len() / rows);

    for row in 0..rows {
        let target = &mut out[row * (a + b)..(row + 1) * (a + b)];

        target[..a].copy_from_slice(&left[row * a..(row + 1) * a]);
        target[a..].copy_from_slice(&right[row * b..(row + 1) * b]);
    }
}

impl<'a> Sac<'a> {
    pub fn new(mut envs: Envs<'a>, seed: u64, math: Math, recipe: Recipe) -> Self {
        let n = envs.count;
        let nact = envs.robot.nact;
        let nobs = envs.robot.nobs();
        let rows = recipe.batch;
        let mut init_rng = Rng::new(seed, 1_000_000);
        let actor = Actor::new(nobs, nact, &recipe, rows.max(n), &mut init_rng);
        let critic = Twin::new(nobs + nact, &recipe, rows, &mut init_rng);
        let mut norm = Normalizer::new(nobs);
        let mut obs_raw = vec![0.0f32; n * nobs];

        envs.keep_final_obs();
        envs.observe(&mut obs_raw);
        norm.update(&obs_raw);

        Self {
            log_alpha: vec![recipe.alpha_init.ln()],
            alpha_adam: Adam::new(1),
            target_entropy: recipe.target_entropy_per_action * nact as f32,
            replay: Replay::new(recipe.replay_capacity, nobs, nact),
            scale: RewardScale::new(n, recipe.gamma, recipe.support.high),
            noise: Noise::new(n, nact, recipe.repeat_noise),
            noise_rngs: (0..n).map(|i| Rng::new(seed, 2_000_000 + i as u64)).collect(),
            batch_rng: Rng::new(seed, 3_000_000),
            step: Step {
                obs_raw,
                obs: vec![0.0; n * nobs],
                next_raw: vec![0.0; n * nobs],
                stored_next: vec![0.0; n * nobs],
                reward: vec![0.0; n],
                fell: vec![false; n],
                timeout: vec![false; n],
                alive: vec![0.0; n],
            },
            batch: Batch {
                sample: Sample::new(rows, nobs, nact),
                obs: vec![0.0; rows * nobs],
                next_obs: vec![0.0; rows * nobs],
                rewards: vec![0.0; rows],
                noise: vec![0.0; rows * nact],
                critic_in: vec![0.0; rows * (nobs + nact)],
                entropy: vec![0.0; rows],
                target: vec![0.0; rows * recipe.support.atoms],
            },
            steps: 0,
            updates: 0,
            phases: Phases::default(),
            episodes: Episodes::new(n, envs.robot.control_dt),
            reward_sum: 0.0,
            reward_count: 0,
            last_loss: 0.0,
            envs,
            recipe,
            math,
            actor,
            critic,
            norm,
        }
    }

    fn alpha(&self) -> f32 {
        self.log_alpha[0].exp()
    }

    fn collect(&mut self) -> Result<(), String> {
        let tick = Instant::now();
        let n = self.envs.count;
        let nobs = self.envs.robot.nobs();
        let step = &mut self.step;

        self.norm.apply(&step.obs_raw, &mut step.obs);

        let noise = self.noise.draw(&mut self.noise_rngs);

        self.actor.sample(&self.math, &step.obs, noise);
        self.phases.inference += tick.elapsed().as_secs_f64();

        let result = StepResult {
            reward: &mut step.reward,
            fell: &mut step.fell,
            timeout: &mut step.timeout,
        };
        let actions = &self.actor.actions[..n * self.envs.robot.nact];

        self.envs.step(actions, result, &mut self.phases)?;

        let tick = Instant::now();

        self.envs.observe(&mut step.next_raw);
        step.stored_next.copy_from_slice(&step.next_raw);

        for sim in 0..n {
            let finished = step.fell[sim] || step.timeout[sim];

            step.alive[sim] = f32::from(u8::from(!step.fell[sim]));
            self.reward_sum += step.reward[sim] as f64;

            if finished {
                let span = sim * nobs..(sim + 1) * nobs;

                step.stored_next[span.clone()].copy_from_slice(&self.envs.final_obs()[span]);
                self.noise.restart(sim);
            }
        }

        self.replay.push(Transitions {
            obs: &step.obs_raw,
            next_obs: &step.stored_next,
            actions,
            rewards: &step.reward,
            alive: &step.alive,
        });

        let finished: Vec<bool> = step.fell.iter().zip(&step.timeout).map(|(f, t)| *f || *t).collect();

        self.scale.observe(&step.reward, &finished);
        self.episodes.track(&step.fell, &step.timeout);
        std::mem::swap(&mut step.obs_raw, &mut step.next_raw);
        self.norm.update(&step.obs_raw);
        self.reward_count += n;
        self.steps += n as u64;
        self.phases.observe += tick.elapsed().as_secs_f64();

        Ok(())
    }

    fn draw_batch_noise(&mut self) {
        for v in &mut self.batch.noise {
            *v = self.batch_rng.normal() as f32;
        }
    }

    fn prepare_batch(&mut self) {
        let batch = &mut self.batch;
        let divisor = if self.recipe.scale_rewards {
            self.scale.divisor()
        } else {
            1.0
        };

        self.replay.sample(&mut self.batch_rng, &mut batch.sample);
        self.norm.apply(&batch.sample.obs, &mut batch.obs);
        self.norm.apply(&batch.sample.next_obs, &mut batch.next_obs);

        for (r, raw) in batch.rewards.iter_mut().zip(&batch.sample.rewards) {
            *r = raw / divisor;
        }
    }

    fn train_critic(&mut self, rate: f32) {
        let rows = self.recipe.batch;
        let alpha = self.alpha();

        self.draw_batch_noise();
        self.actor.sample(&self.math, &self.batch.next_obs, &self.batch.noise);

        let batch = &mut self.batch;

        join_rows(
            &batch.next_obs,
            &self.actor.actions[..batch.noise.len()],
            rows,
            &mut batch.critic_in,
        );

        for (e, logp) in batch.entropy.iter_mut().zip(&self.actor.log_probs) {
            *e = alpha * logp;
        }

        let next = self
            .critic
            .next_distribution(&self.math, &batch.critic_in, self.recipe.mix);
        let bellman = Bellman {
            reward: &batch.rewards,
            alive: &batch.sample.alive,
            discount: self.recipe.gamma,
            entropy: &batch.entropy,
        };

        project(&self.recipe.support, next, bellman, &mut batch.target);
        join_rows(&batch.obs, &batch.sample.actions, rows, &mut batch.critic_in);
        self.last_loss = self.critic.train(&self.math, &batch.critic_in, &batch.target, rate);
    }

    fn train_actor(&mut self, rate: f32) {
        let rows = self.recipe.batch;
        let nobs = self.envs.robot.nobs();
        let alpha = self.alpha();

        self.draw_batch_noise();
        self.actor.sample(&self.math, &self.batch.obs, &self.batch.noise);

        let batch = &mut self.batch;

        join_rows(
            &batch.obs,
            &self.actor.actions[..batch.noise.len()],
            rows,
            &mut batch.critic_in,
        );

        let gradient = self
            .critic
            .value_gradient(&self.math, &batch.critic_in, self.recipe.mix);
        let mean_log_prob = self.actor.log_probs[..rows].iter().sum::<f32>() / rows as f32;
        let objective = Objective {
            action_gradient: gradient,
            action_offset: nobs,
            alpha,
            noise: &batch.noise,
        };

        self.actor.improve(&self.math, &batch.obs, objective, rate);

        let alpha_grad = [-(mean_log_prob + self.target_entropy)];

        self.alpha_adam
            .step(&mut self.log_alpha, &alpha_grad, self.recipe.alpha_learn_rate);
    }

    fn update(&mut self) {
        let rate = self.recipe.learn_rate_at(self.updates);

        self.prepare_batch();
        self.train_critic(rate);

        if self.updates.is_multiple_of(self.recipe.actor_every) {
            self.train_actor(rate);
        }

        self.critic.soft_update(self.recipe.tau);
        self.updates += 1;
    }
}

impl Algorithm for Sac<'_> {
    fn iterate(&mut self) -> Result<(), String> {
        for _ in 0..self.recipe.horizon {
            self.collect()?;
        }

        if self.replay.len() < self.recipe.learning_starts.max(self.recipe.batch) {
            return Ok(());
        }

        let tick = Instant::now();

        for _ in 0..self.recipe.updates {
            self.update();
        }

        self.phases.gradient += tick.elapsed().as_secs_f64();

        Ok(())
    }

    fn report(&mut self) -> Report {
        self.episodes.trim();

        if std::env::var_os("FORGE_DEBUG").is_some() {
            let n = self.envs.count * self.envs.robot.nact;
            let mean_abs = self.actor.actions[..n].iter().map(|a| a.abs()).sum::<f32>() / n as f32;

            eprintln!(
                "alpha {:.4} |a| {:.3} logp {:.2} q {:.3} loss {:.4} scale {:.3} updates {}",
                self.alpha(),
                mean_abs,
                self.actor.log_probs[0],
                self.critic.mean_value(self.recipe.batch),
                self.last_loss,
                self.scale.divisor(),
                self.updates
            );
        }

        let reward_mean = self.reward_sum / self.reward_count.max(1) as f64;

        self.reward_sum = 0.0;
        self.reward_count = 0;

        Report {
            steps: self.steps,
            phases: self.phases,
            reward_mean,
            episode_seconds: self.episodes.mean_seconds(),
        }
    }

    fn deployed(&self) -> Deployed {
        self.actor.deployed()
    }

    fn norm(&self) -> &Normalizer {
        &self.norm
    }

    fn math(&self) -> &Math {
        &self.math
    }
}
