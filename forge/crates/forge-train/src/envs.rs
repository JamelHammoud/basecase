use crate::events::Phases;
use crate::job::Task;
use crate::rng::Rng;
use crate::robot::{quat_multiply, rotate_into_frame, Robot};
use forge_mujoco::{Batch, Model};
use forge_reward::{handwritten, RewardState};
use std::time::Instant;

const FRICTION_RANGE: (f64, f64) = (0.6, 1.3);
const MASS_RANGE: (f64, f64) = (0.85, 1.15);
const SERVO_RANGE: (f64, f64) = (0.85, 1.15);
const RESET_JOINT_NOISE: f64 = 0.05;
const PUSH_SPEED: (f64, f64) = (0.2, 0.6);
const PUSH_GAP_SECONDS: (f64, f64) = (2.0, 5.0);
pub const NEVER: i64 = i64::MAX / 2;

pub struct Envs<'a> {
    pub robot: &'a Robot,
    batch: Batch,
    pub count: usize,
    rngs: Vec<Rng>,
    pub steps_taken: Vec<i64>,
    push_at: Vec<i64>,
    last_action: Vec<f64>,
    action: Vec<f64>,
    joint_pos: Vec<f64>,
    joint_vel: Vec<f64>,
}

pub struct StepResult<'a> {
    pub reward: &'a mut [f32],
    pub fell: &'a mut [bool],
    pub timeout: &'a mut [bool],
}

fn randomize(batch: &mut Batch, model: &Model, rngs: &mut [Rng]) -> Result<(), String> {
    let (friction, width) = batch.expand("geom_friction")?;

    for (row, rng) in friction.chunks_exact_mut(width).zip(rngs.iter_mut()) {
        let scale = rng.uniform(FRICTION_RANGE.0, FRICTION_RANGE.1);

        row.iter_mut().step_by(3).for_each(|f| *f *= scale);
    }

    let (mass, width) = batch.expand("body_mass")?;

    for (row, rng) in mass.chunks_exact_mut(width).zip(rngs.iter_mut()) {
        row[1..]
            .iter_mut()
            .for_each(|m| *m *= rng.uniform(MASS_RANGE.0, MASS_RANGE.1));
    }

    let servo: Vec<f64> = rngs
        .iter_mut()
        .flat_map(|rng| {
            (0..model.nu())
                .map(|_| rng.uniform(SERVO_RANGE.0, SERVO_RANGE.1))
                .collect::<Vec<f64>>()
        })
        .collect();
    let per_sim = model.nu();
    let (gain, width) = batch.expand("actuator_gainprm")?;
    let gain_width = Model::gain_width();

    for (row, stiffness) in gain.chunks_exact_mut(width).zip(servo.chunks_exact(per_sim.max(1))) {
        row.chunks_exact_mut(gain_width)
            .zip(stiffness)
            .for_each(|(params, k)| params[0] *= k);
    }

    let (bias, width) = batch.expand("actuator_biasprm")?;
    let bias_width = Model::bias_width();

    for (row, stiffness) in bias.chunks_exact_mut(width).zip(servo.chunks_exact(per_sim.max(1))) {
        for (params, k) in row.chunks_exact_mut(bias_width).zip(stiffness) {
            params[1] *= k;
            params[2] *= k;
        }
    }

    Ok(())
}

fn push_gap(rng: &mut Rng, control_dt: f64) -> i64 {
    rng.range(
        (PUSH_GAP_SECONDS.0 / control_dt) as i64,
        (PUSH_GAP_SECONDS.1 / control_dt) as i64,
    )
}

impl<'a> Envs<'a> {
    pub fn new(robot: &'a Robot, count: usize, seed: u64, randomized: bool) -> Result<Self, String> {
        let threads = robot
            .job
            .threads
            .unwrap_or_else(|| std::thread::available_parallelism().map_or(4, |c| c.get()))
            .min(count)
            .max(1);
        let mut batch = Batch::new(&robot.model, count, threads)?;
        let mut rngs: Vec<Rng> = (0..count).map(|i| Rng::new(seed, i as u64)).collect();

        if randomized {
            randomize(&mut batch, &robot.model, &mut rngs)?;
        }

        for sim in 0..count {
            batch.row(sim).copy_from_slice(&robot.start_row);
        }

        let nact = robot.nact;
        let push_at = if randomized {
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

        for (j, &adr) in robot.joint_qpos.iter().enumerate() {
            let moved = qpos[adr] + rng.uniform(-RESET_JOINT_NOISE, RESET_JOINT_NOISE);

            qpos[adr] = moved.max(robot.ctrl_low[j]).min(robot.ctrl_high[j]);
        }

        let half_yaw = rng.uniform(-std::f64::consts::PI, std::f64::consts::PI) / 2.0;
        let quat_at = robot.root_qpos + 3;
        let start = [qpos[quat_at], qpos[quat_at + 1], qpos[quat_at + 2], qpos[quat_at + 3]];
        let turned = quat_multiply([half_yaw.cos(), 0.0, 0.0, half_yaw.sin()], start);

        qpos[quat_at..quat_at + 4].copy_from_slice(&turned);
        self.steps_taken[sim] = 0;
        self.last_action[sim * robot.nact..(sim + 1) * robot.nact].fill(0.0);
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
        let robot = self.robot;
        let layout = robot.layout;
        let nact = robot.nact;
        let width = 12 + 3 * nact;

        for sim in 0..self.count {
            let row = self.batch.row(sim);
            let obs = &mut out[sim * width..(sim + 1) * width];
            let qpos = &row[layout.qpos..];
            let qvel = &row[layout.qvel..];
            let d = robot.root_dof;
            let quat = &qpos[robot.root_qpos + 3..robot.root_qpos + 7];
            let g = rotate_into_frame(quat, [0.0, 0.0, -1.0]);
            let w = [qvel[d + 3], qvel[d + 4], qvel[d + 5]];
            let v = rotate_into_frame(quat, [qvel[d], qvel[d + 1], qvel[d + 2]]);
            let last = &self.last_action[sim * nact..(sim + 1) * nact];

            for k in 0..3 {
                obs[k] = g[k] as f32;
                obs[3 + k] = w[k] as f32;
                obs[6 + k] = v[k] as f32;
                obs[9 + k] = robot.job.command[k] as f32;
            }

            for j in 0..nact {
                obs[12 + j] = (qpos[robot.joint_qpos[j]] - robot.job.default_pose[j]) as f32;
                obs[12 + nact + j] = qvel[robot.joint_dof[j]] as f32;
                obs[12 + 2 * nact + j] = last[j] as f32;
            }
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

            let row = self.batch.row(sim);
            let ctrl = &mut row[ctrl_at..ctrl_at + nu];

            ctrl.copy_from_slice(&robot.job.ctrl_default);

            for j in 0..nact {
                let target = robot.job.default_pose[j] + robot.job.action_scale * self.action[sim * nact + j];

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

        phases.physics += physics_timer.elapsed().as_secs_f64();
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
                command: robot.job.command,
                z: qpos[robot.root_qpos + 2],
                z0: robot.z0,
                control_dt: robot.control_dt,
                joint_pos: &self.joint_pos,
                joint_vel: &self.joint_vel,
                action: &self.action[sim * nact..(sim + 1) * nact],
                last_action: &self.last_action[sim * nact..(sim + 1) * nact],
                bodies: &[],
            };
            let raw = match robot.job.task {
                Task::Stand => handwritten::stand(&state),
                Task::Walk => handwritten::walk(&state),
            };
            let fell = handwritten::fell(&state);
            let timeout = self.steps_taken[sim] >= robot.episode_steps;

            result.reward[sim] = handwritten::scaled(&state, raw) as f32;
            result.fell[sim] = fell;
            result.timeout[sim] = timeout;
            self.last_action[sim * nact..(sim + 1) * nact].copy_from_slice(&self.action[sim * nact..(sim + 1) * nact]);

            if fell || timeout {
                self.reset(sim);
            }
        }
    }

    pub fn clear_step_counts(&mut self) {
        self.steps_taken.fill(0);
    }
}
