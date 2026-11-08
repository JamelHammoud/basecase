use crate::conditions::{Conditions, Setup};
use crate::events::Phases;
use crate::physics::Physics;
use crate::randomize::{randomize, RANDOMIZED_FIELDS};
use crate::rewarder::Rewarder;
use crate::rng::Rng;
use crate::robot::{quat_multiply, rotate_into_frame, Robot};
use crate::threads::ThreadTuner;
use forge_reward::{handwritten, RewardState};
use std::time::Instant;

const PUSH_SPEED: (f64, f64) = (0.2, 0.6);
const PUSH_GAP_SECONDS: (f64, f64) = (2.0, 5.0);
pub const NEVER: i64 = i64::MAX / 2;

pub struct Envs<'a> {
    pub robot: &'a Robot,
    batch: Physics,
    pub count: usize,
    rngs: Vec<Rng>,
    pub steps_taken: Vec<i64>,
    push_at: Vec<i64>,
    last_action: Vec<f64>,
    action: Vec<f64>,
    joint_pos: Vec<f64>,
    joint_vel: Vec<f64>,
    final_obs: Option<Vec<f32>>,
    tuner: Option<ThreadTuner>,
    delayed: Vec<f64>,
    conditions: Conditions,
    rewarder: Rewarder,
}

pub struct EnvsSpec {
    pub count: usize,
    pub seed: u64,
    pub randomized: bool,
    pub threads: Option<usize>,
}

pub struct StepResult<'a> {
    pub reward: &'a mut [f32],
    pub fell: &'a mut [bool],
    pub timeout: &'a mut [bool],
}

fn push_gap(rng: &mut Rng, control_dt: f64) -> i64 {
    rng.range(
        (PUSH_GAP_SECONDS.0 / control_dt) as i64,
        (PUSH_GAP_SECONDS.1 / control_dt) as i64,
    )
}

impl<'a> Envs<'a> {
    pub fn new(robot: &'a Robot, count: usize, seed: u64, randomized: bool) -> Result<Self, String> {
        let spec = EnvsSpec {
            count,
            seed,
            randomized,
            threads: robot.job.threads,
        };

        Self::build(robot, spec)
    }

    pub fn build(robot: &'a Robot, spec: EnvsSpec) -> Result<Self, String> {
        let EnvsSpec {
            count,
            seed,
            randomized,
            threads,
        } = spec;
        let tuned = threads.is_none() && randomized;
        let threads = threads
            .unwrap_or_else(|| std::thread::available_parallelism().map_or(4, |c| c.get()))
            .min(count)
            .max(1);
        let mut batch = Physics::new(&robot.model, &robot.engine, &robot.layout, (count, threads))?;
        let mut rngs: Vec<Rng> = (0..count).map(|i| Rng::new(seed, i as u64)).collect();

        if randomized {
            randomize(&mut batch, &robot.model, &mut rngs)?;
        }

        for sim in 0..count {
            batch.row(sim).copy_from_slice(&robot.start_row);
        }

        let nact = robot.nact;
        let push_at = if randomized && robot.job.options.pushes {
            rngs.iter_mut().map(|rng| push_gap(rng, robot.control_dt)).collect()
        } else {
            vec![NEVER; count]
        };
        let mut envs = Self {
            robot,
            batch,
            count,
            rngs,
            steps_taken: vec![0; count],
            push_at,
            last_action: vec![0.0; count * nact],
            action: vec![0.0; count * nact],
            joint_pos: vec![0.0; nact],
            joint_vel: vec![0.0; nact],
            final_obs: None,
            tuner: tuned.then(|| ThreadTuner::new(threads)),
            delayed: vec![0.0; nact],
            conditions: Conditions::new(Setup {
                options: &robot.job.options,
                command: robot.job.command,
                count,
                nact,
                control_dt: robot.control_dt,
                randomized,
            }),
            rewarder: Rewarder::for_job(&robot.job)?,
        };

        for sim in 0..count {
            envs.reset(sim);
        }

        Ok(envs)
    }

    pub fn place_at_start_exactly(&mut self, sim: usize) {
        self.batch.row(sim).copy_from_slice(&self.robot.start_row);
        self.last_action[sim * self.robot.nact..(sim + 1) * self.robot.nact].fill(0.0);
    }

    pub fn reset(&mut self, sim: usize) {
        let robot = self.robot;
        let layout = robot.layout;
        let rng = &mut self.rngs[sim];
        let row = self.batch.row(sim);

        row.copy_from_slice(&robot.start_row);

        let qpos = &mut row[layout.qpos..];
        let noise = robot.job.options.reset_noise;

        for (j, &adr) in robot.joint_qpos.iter().enumerate() {
            let moved = qpos[adr] + rng.uniform(-noise, noise);

            qpos[adr] = moved.max(robot.ctrl_low[j]).min(robot.ctrl_high[j]);
        }

        let half_yaw = rng.uniform(-std::f64::consts::PI, std::f64::consts::PI) / 2.0;
        let quat_at = robot.root_qpos + 3;
        let start = [qpos[quat_at], qpos[quat_at + 1], qpos[quat_at + 2], qpos[quat_at + 3]];
        let turned = quat_multiply([half_yaw.cos(), 0.0, 0.0, half_yaw.sin()], start);

        qpos[quat_at..quat_at + 4].copy_from_slice(&turned);
        self.steps_taken[sim] = 0;
        self.last_action[sim * robot.nact..(sim + 1) * robot.nact].fill(0.0);
        self.conditions.reset(sim, &mut self.rngs[sim]);
    }

    pub fn root_xy(&mut self, sim: usize) -> [f64; 2] {
        let layout = self.robot.layout;
        let adr = self.robot.root_qpos;
        let row = self.batch.row(sim);

        [row[layout.qpos + adr], row[layout.qpos + adr + 1]]
    }

    pub fn forward_speed(&mut self, sim: usize) -> f64 {
        let robot = self.robot;
        let layout = robot.layout;
        let row = self.batch.row(sim);
        let qpos = &row[layout.qpos..];
        let qvel = &row[layout.qvel..];
        let d = robot.root_dof;
        let v = rotate_into_frame(
            &qpos[robot.root_qpos + 3..robot.root_qpos + 7],
            [qvel[d], qvel[d + 1], qvel[d + 2]],
        );

        -v[1]
    }

    pub fn observe(&mut self, out: &mut [f32]) {
        let width = self.robot.nobs();

        for sim in 0..self.count {
            self.observe_one(sim, &mut out[sim * width..(sim + 1) * width]);
        }
    }

    fn observe_one(&mut self, sim: usize, obs: &mut [f32]) {
        let robot = self.robot;
        let layout = robot.layout;
        let nact = robot.nact;
        let row = self.batch.row(sim);
        let qpos = &row[layout.qpos..];
        let qvel = &row[layout.qvel..];
        let d = robot.root_dof;
        let quat = &qpos[robot.root_qpos + 3..robot.root_qpos + 7];
        let g = self.conditions.gravity(sim, rotate_into_frame(quat, [0.0, 0.0, -1.0]));
        let command = self.conditions.commands[sim];
        let w = [qvel[d + 3], qvel[d + 4], qvel[d + 5]];
        let v = rotate_into_frame(quat, [qvel[d], qvel[d + 1], qvel[d + 2]]);
        let last = &self.last_action[sim * nact..(sim + 1) * nact];

        for k in 0..3 {
            obs[k] = g[k] as f32;
            obs[3 + k] = w[k] as f32;
            obs[6 + k] = v[k] as f32;
            obs[9 + k] = command[k] as f32;
        }

        for j in 0..nact {
            let bias = self.conditions.joint_bias(sim, j);

            obs[12 + j] = (qpos[robot.joint_qpos[j]] - robot.job.default_pose[j] + bias) as f32;
            obs[12 + nact + j] = qvel[robot.joint_dof[j]] as f32;
            obs[12 + 2 * nact + j] = last[j] as f32;
        }
    }

    pub fn keep_final_obs(&mut self) {
        self.final_obs = Some(vec![0.0; self.count * self.robot.nobs()]);
    }

    pub fn final_obs(&self) -> &[f32] {
        self.final_obs.as_deref().unwrap_or(&[])
    }

    fn store_final_obs(&mut self, sim: usize) {
        let width = self.robot.nobs();

        if let Some(mut store) = self.final_obs.take() {
            self.observe_one(sim, &mut store[sim * width..(sim + 1) * width]);
            self.final_obs = Some(store);
        }
    }

    fn write_controls(&mut self, actions: &[f32]) {
        let robot = self.robot;
        let nact = robot.nact;
        let ctrl_at = robot.layout.ctrl;
        let nu = robot.model.nu();

        for sim in 0..self.count {
            let taken = &actions[sim * nact..(sim + 1) * nact];
            let clipped = &mut self.action[sim * nact..(sim + 1) * nact];

            clipped
                .iter_mut()
                .zip(taken)
                .for_each(|(c, a)| *c = a.clamp(-1.0, 1.0) as f64);
            self.conditions
                .delayed(sim, &self.action[sim * nact..(sim + 1) * nact], &mut self.delayed);

            let row = self.batch.row(sim);
            let ctrl = &mut row[ctrl_at..ctrl_at + nu];

            ctrl.copy_from_slice(&robot.job.ctrl_default);

            for j in 0..nact {
                let target = robot.job.default_pose[j] + robot.job.action_scale * self.delayed[j];

                ctrl[robot.actuators[j]] = target.max(robot.ctrl_low[j]).min(robot.ctrl_high[j]);
            }
        }
    }

    fn apply_pushes(&mut self) {
        let robot = self.robot;
        let at = robot.layout.qvel + robot.root_dof;

        for sim in 0..self.count {
            if self.steps_taken[sim] < self.push_at[sim] {
                continue;
            }

            let rng = &mut self.rngs[sim];
            let angle = rng.uniform(0.0, 2.0 * std::f64::consts::PI);
            let speed = rng.uniform(PUSH_SPEED.0, PUSH_SPEED.1);
            let gap = push_gap(rng, robot.control_dt);
            let row = self.batch.row(sim);

            row[at] += angle.cos() * speed;
            row[at + 1] += angle.sin() * speed;
            self.push_at[sim] = self.steps_taken[sim] + gap;
        }
    }

    pub fn step(&mut self, actions: &[f32], result: StepResult, phases: &mut Phases) -> Result<(), String> {
        let timer = Instant::now();

        self.write_controls(actions);
        self.apply_pushes();

        let write_seconds = timer.elapsed().as_secs_f64();
        let physics_timer = Instant::now();
        let failed = self.batch.step(self.robot.decimation);
        let physics_seconds = physics_timer.elapsed().as_secs_f64();

        phases.physics += physics_seconds;

        if let Some(threads) = self.tuner.as_mut().and_then(|t| t.record(physics_seconds)) {
            self.batch.rethread(threads, &RANDOMIZED_FIELDS)?;
        }

        phases.reward += write_seconds;

        if failed > 0 {
            let reason = self.batch.first_error().unwrap_or_default();

            return Err(format!("MuJoCo failed on {failed} simulations: {reason}"));
        }

        let reward_timer = Instant::now();

        self.compute_rewards(result);
        phases.reward += reward_timer.elapsed().as_secs_f64();

        Ok(())
    }

    fn compute_rewards(&mut self, result: StepResult) {
        let robot = self.robot;
        let layout = robot.layout;
        let nact = robot.nact;

        for sim in 0..self.count {
            self.steps_taken[sim] += 1;

            let row = self.batch.row(sim);
            let qpos = &row[layout.qpos..];
            let qvel = &row[layout.qvel..];
            let d = robot.root_dof;
            let quat = &qpos[robot.root_qpos + 3..robot.root_qpos + 7];

            for j in 0..nact {
                self.joint_pos[j] = qpos[robot.joint_qpos[j]] - robot.job.default_pose[j];
                self.joint_vel[j] = qvel[robot.joint_dof[j]];
            }

            let state = RewardState {
                gravity: rotate_into_frame(quat, [0.0, 0.0, -1.0]),
                angvel: [qvel[d + 3], qvel[d + 4], qvel[d + 5]],
                linvel: rotate_into_frame(quat, [qvel[d], qvel[d + 1], qvel[d + 2]]),
                command: self.conditions.commands[sim],
                z: qpos[robot.root_qpos + 2],
                z0: robot.z0,
                control_dt: robot.control_dt,
                joint_pos: &self.joint_pos,
                joint_vel: &self.joint_vel,
                action: &self.action[sim * nact..(sim + 1) * nact],
                last_action: &self.last_action[sim * nact..(sim + 1) * nact],
                bodies: &[],
            };
            let fell = robot.job.options.fall_resets && handwritten::fell(&state);
            let timeout = self.steps_taken[sim] >= robot.episode_steps;

            result.reward[sim] = self.rewarder.reward(&state) as f32;
            result.fell[sim] = fell;
            result.timeout[sim] = timeout;
            self.last_action[sim * nact..(sim + 1) * nact].copy_from_slice(&self.action[sim * nact..(sim + 1) * nact]);

            if fell || timeout {
                self.store_final_obs(sim);
                self.reset(sim);
            } else {
                self.conditions.tick(sim, &mut self.rngs[sim], self.steps_taken[sim]);
            }
        }
    }

    pub fn clear_step_counts(&mut self) {
        self.steps_taken.fill(0);
    }
}
