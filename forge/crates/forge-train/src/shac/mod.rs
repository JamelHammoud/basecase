mod backward;
mod critic;
mod env;
mod nets;
pub mod probe;
mod rollout;
pub mod world;

use crate::adam::Adam;
use crate::algorithm::{Algorithm, Report};
use crate::clock::Instant;
use crate::deployed::{Deployed, Squash};
use crate::episodes::Episodes;
use crate::events::Phases;
use crate::kernels::Math;
use crate::normalizer::Normalizer;
use crate::rng::Rng;
use crate::robot::Robot;
use crate::warm::{Net as SavedNet, Snapshot, WarmStart};
use backward::{backward, Learners, Sweep};
use critic::{blend, targets, train, Fit, Td};
use env::Env;
use forge_sim::grad::Smooth;
use nets::Net;
use rollout::{collect, Policy};

pub const ALGO: &str = "shac";

#[derive(Clone, Copy, Debug)]
pub struct Hyper {
    pub horizon: usize,
    pub gamma: f64,
    pub lambda: f64,
    pub actor_rate: f32,
    pub critic_rate: f32,
    pub critic_iterations: usize,
    pub critic_batches: usize,
    pub target_keep: f32,
    pub max_norm: f64,
    pub log_std_init: f32,
    pub log_std_min: f32,
    pub smoothing: Smooth,
}

impl Default for Hyper {
    fn default() -> Self {
        Self {
            horizon: 32,
            gamma: 0.99,
            lambda: 0.95,
            actor_rate: 2e-3,
            critic_rate: 2e-3,
            critic_iterations: 16,
            critic_batches: 4,
            target_keep: 0.2,
            max_norm: 1.0,
            log_std_init: -1.0,
            log_std_min: -2.5,
            smoothing: Smooth { force: 0.05 },
        }
    }
}

pub struct Shac<'a> {
    env: Env<'a>,
    actor: Net,
    critic: Net,
    target: Net,
    log_std: Vec<f32>,
    log_std_adam: Adam,
    norm: Normalizer,
    math: Math,
    rng: Rng,
    hyper: Hyper,
    steps: u64,
    phases: Phases,
    reward_mean: f64,
    episodes: Episodes,
}

impl<'a> Shac<'a> {
    pub fn new(robot: &'a Robot, hyper: Hyper, math: Math) -> Result<Self, String> {
        if robot.job.options.reference.is_some() {
            return Err("SHAC can't train this job: it follows a motion reference".to_owned());
        }

        let task = crate::gpu_loop::task::describe(robot).map_err(|why| format!("SHAC can't train this job: {why}"))?;
        let (nobs, nact) = (task.nobs(), task.nact());
        let count = robot.job.envs;
        let seed = robot.job.seed;
        let env = Env::new(robot, task, (count, seed + 1))?;
        let mut rng = Rng::new(seed, 0x5AAC);
        let rows = count.max(count * hyper.horizon / hyper.critic_batches);
        let actor = Net::actor(nobs, nact, (count, &mut rng));
        let critic = Net::critic(nobs, (rows, &mut rng));
        let mut target = Net::critic(nobs, (count, &mut rng));

        target.params.clone_from(&critic.params);

        Ok(Self {
            episodes: Episodes::new(count, robot.control_dt),
            env,
            actor,
            critic,
            target,
            log_std: vec![hyper.log_std_init; nact],
            log_std_adam: Adam::with(nact, 0.95, 0.0),
            norm: Normalizer::new(nobs),
            math,
            rng,
            hyper,
            steps: 0,
            phases: Phases::default(),
            reward_mean: 0.0,
        })
    }

    fn learn_actor(&mut self, rollout: &rollout::Rollout) {
        let (nq, nv) = (self.env.plan.kernel.nq, self.env.plan.kernel.nv);
        let sweep = Sweep {
            task: &self.env.task,
            nq,
            nx: nq + nv,
            std: self.norm.std(),
            gamma: self.hyper.gamma,
        };
        let mut learners = Learners {
            actor: &mut self.actor,
            target: &mut self.target,
            math: &self.math,
            norm: &self.norm,
        };
        let log_std_grad = backward(&sweep, rollout, &mut learners, &self.log_std);
        let scale = -1.0 / (self.env.count * self.hyper.horizon) as f32;
        let mut grads: Vec<f32> = log_std_grad.iter().map(|g| *g as f32 * scale).collect();

        self.actor.grads.iter_mut().for_each(|g| *g *= scale);
        self.actor.step(self.hyper.actor_rate, self.hyper.max_norm);
        crate::adam::clip_gradient(&mut grads, self.hyper.max_norm);
        self.log_std_adam.step(&mut self.log_std, &grads, self.hyper.actor_rate);
        self.log_std
            .iter_mut()
            .for_each(|l| *l = l.clamp(self.hyper.log_std_min, 0.0));
    }

    fn learn_critic(&mut self, rollout: &rollout::Rollout) {
        let td = Td {
            gamma: self.hyper.gamma,
            lambda: self.hyper.lambda,
        };
        let goals = targets(rollout, (&mut self.target, &self.math, &self.norm), &td);
        let fit = Fit {
            iterations: self.hyper.critic_iterations,
            batches: self.hyper.critic_batches,
            rate: self.hyper.critic_rate,
            max_norm: self.hyper.max_norm,
        };

        train(&mut self.critic, &self.math, (rollout, &goals), (&fit, &mut self.rng));
        blend(&mut self.target, &self.critic, self.hyper.target_keep);
    }

    fn record(&mut self, rollout: &rollout::Rollout) {
        let count = self.env.count;
        let mut total = 0.0;

        for step in &rollout.steps {
            self.norm.update(&step.obs);
            self.episodes.track(&step.fell, &step.timeout);
            total += step.reward.iter().sum::<f64>();
        }

        self.episodes.trim();
        self.steps += (count * rollout.steps.len()) as u64;
        self.reward_mean = total / (count * rollout.steps.len()) as f64;
    }
}

impl Algorithm for Shac<'_> {
    fn iterate(&mut self) -> Result<(), String> {
        let started = Instant::now();
        let mut policy = Policy {
            actor: &mut self.actor,
            log_std: &self.log_std,
            norm: &self.norm,
            math: &self.math,
            rng: &mut self.rng,
        };
        let rollout = collect(&mut self.env, &mut policy, (self.hyper.horizon, self.hyper.smoothing))?;

        self.phases.physics += started.elapsed().as_secs_f64();

        let learning = Instant::now();

        self.learn_actor(&rollout);
        self.learn_critic(&rollout);
        self.record(&rollout);
        self.phases.gradient += learning.elapsed().as_secs_f64();

        Ok(())
    }

    fn report(&mut self) -> Report {
        Report {
            steps: self.steps,
            phases: self.phases,
            reward_mean: self.reward_mean,
            episode_seconds: self.episodes.mean_seconds(),
        }
    }

    fn deployed(&self) -> Deployed {
        Deployed::new(self.actor.mlp.clone(), self.actor.params.clone(), Squash::Clip)
    }

    fn norm(&self) -> &Normalizer {
        &self.norm
    }

    fn math(&self) -> &Math {
        &self.math
    }

    fn snapshot(&self) -> Snapshot {
        Snapshot {
            algo: ALGO.to_owned(),
            actor: SavedNet::of(&self.actor.mlp, &self.actor.params),
            critic: SavedNet::of(&self.critic.mlp, &self.critic.params),
            log_std: self.log_std.clone(),
            learn_rate: Some(self.hyper.actor_rate),
            log_alpha: None,
        }
    }

    fn warm_start(&mut self, source: &WarmStart) -> Result<Vec<String>, String> {
        let state = &source.state;
        let nact = self.log_std.len();
        let mut notes = Vec::new();

        state.actor.load_into(&self.actor.mlp, &mut self.actor.params, nact)?;

        if state.algo == ALGO && state.critic.sizes == self.critic.mlp.sizes() {
            state.critic.load_into(&self.critic.mlp, &mut self.critic.params, 1)?;
            self.target.params.clone_from(&self.critic.params);
        } else {
            notes.push("Its value estimate starts fresh".to_owned());
        }

        if state.log_std.len() == nact {
            self.log_std.clone_from(&state.log_std);
        }

        self.norm = source.norm.clone();

        Ok(notes)
    }
}
