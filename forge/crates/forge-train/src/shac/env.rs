use super::world::{observe, run, Actions, Frame};
use crate::envs::{NEVER, PUSH_GAP_SECONDS};
use crate::physics::Physics;
use crate::randomize::{randomize, RANDOMIZED_FIELDS};
use crate::rng::Rng;
use crate::robot::{quat_multiply, Robot};
use forge_ir::task::Task;
use forge_sim::grad::{step_with_jacobian, Jacobian, Smooth, Spec, Wrt};
use forge_sim::lanes::LANES;
use forge_sim::rowmap::RowMap;
use forge_sim::world_params::WorldParams;
use forge_sim::{Plan, State, Workspace};
use rayon::prelude::*;

pub struct Env<'a> {
    pub robot: &'a Robot,
    pub task: Task,
    pub count: usize,
    pub plan: Plan,
    physics: Physics,
    map: RowMap,
    params: WorldParams,
    rngs: Vec<Rng>,
    steps: Vec<i64>,
    push_at: Vec<i64>,
    pub last: Vec<f64>,
    wrt: Vec<Wrt>,
}

pub struct Outcome {
    pub reward: f64,
    pub fell: bool,
    pub timeout: bool,
}

fn push_gap(rng: &mut Rng, dt: f64) -> i64 {
    rng.range((PUSH_GAP_SECONDS.0 / dt) as i64, (PUSH_GAP_SECONDS.1 / dt) as i64)
}

fn mirror(physics: &mut Physics, params: &mut WorldParams) -> Result<(), String> {
    for field in RANDOMIZED_FIELDS {
        let (values, _) = physics.expand(field)?;
        let copy = values.to_vec();

        params.expand(field)?.0.copy_from_slice(&copy);
    }

    params.refresh();
    Ok(())
}

impl<'a> Env<'a> {
    pub fn new(robot: &'a Robot, task: Task, (count, seed): (usize, u64)) -> Result<Self, String> {
        let kernel = forge_ir::lower(&robot.model).map_err(|r| r.to_string())?;
        let plan = Plan::new(kernel);

        forge_sim::grad::supported(&plan)?;

        let threads = std::thread::available_parallelism().map_or(4, |c| c.get());
        let mut physics = Physics::new(&robot.model, &robot.engine, &robot.layout, (count, threads))?;
        let mut rngs: Vec<Rng> = (0..count).map(|i| Rng::new(seed, i as u64)).collect();
        let mut params = WorldParams::new(&robot.model, count)?;

        randomize(&mut physics, robot.nu, &mut rngs)?;
        mirror(&mut physics, &mut params)?;

        let k = &plan.kernel;
        let wrt = (0..k.nq)
            .map(Wrt::Qpos)
            .chain((0..k.nv).map(Wrt::Qvel))
            .chain(task.joints.iter().map(|j| Wrt::Ctrl(j.actuator)))
            .collect();
        let push_at = match task.pushes {
            Some(_) => rngs.iter_mut().map(|r| push_gap(r, robot.control_dt)).collect(),
            None => vec![NEVER; count],
        };
        let mut env = Self {
            map: RowMap::new(&robot.model)?,
            last: vec![0.0; count * task.nact()],
            steps: vec![0; count],
            robot,
            task,
            count,
            plan,
            physics,
            params,
            rngs,
            push_at,
            wrt,
        };

        for sim in 0..count {
            env.reset(sim);
        }

        Ok(env)
    }

    pub fn reset(&mut self, sim: usize) {
        let robot = self.robot;
        let layout = robot.layout;
        let rng = &mut self.rngs[sim];
        let row = self.physics.row(sim);

        row.copy_from_slice(&robot.start_row);

        let qpos = &mut row[layout.qpos..];
        let noise = self.task.reset_noise;

        for (j, joint) in self.task.joints.iter().enumerate() {
            let moved = qpos[joint.qpos] + rng.uniform(-noise, noise);

            qpos[joint.qpos] = moved.max(robot.ctrl_low[j]).min(robot.ctrl_high[j]);
        }

        let half_yaw = rng.uniform(-std::f64::consts::PI, std::f64::consts::PI) / 2.0;
        let at = robot.root_qpos + 3;
        let start = [qpos[at], qpos[at + 1], qpos[at + 2], qpos[at + 3]];

        qpos[at..at + 4].copy_from_slice(&quat_multiply([half_yaw.cos(), 0.0, 0.0, half_yaw.sin()], start));
        self.steps[sim] = 0;
        self.last[sim * self.task.nact()..(sim + 1) * self.task.nact()].fill(0.0);
    }

    pub fn state(&mut self, sim: usize) -> Vec<f64> {
        let o = self.robot.layout;
        let (nq, nv) = (self.plan.kernel.nq, self.plan.kernel.nv);
        let row = self.physics.row(sim);

        row[o.qpos..o.qpos + nq]
            .iter()
            .chain(&row[o.qvel..o.qvel + nv])
            .copied()
            .collect()
    }

    pub fn observe(&mut self, sim: usize, out: &mut [f32]) {
        let x = self.state(sim);
        let nq = self.plan.kernel.nq;
        let nact = self.task.nact();
        let frame = Frame {
            qpos: &x[..nq],
            qvel: &x[nq..],
        };

        for (o, v) in out
            .iter_mut()
            .zip(observe(&self.task, &frame, &self.last[sim * nact..(sim + 1) * nact]))
        {
            *o = v as f32;
        }
    }

    pub fn write_controls(&mut self, sim: usize, clipped: &[f64]) {
        let task = &self.task;
        let at = self.robot.layout.ctrl;
        let row = self.physics.row(sim);
        let ctrl = &mut row[at..at + self.robot.nu];

        ctrl.copy_from_slice(&task.ctrl_default);

        for (j, joint) in task.joints.iter().enumerate() {
            let target = joint.default_pose + task.action_scale * clipped[j];

            ctrl[joint.actuator] = target.clamp(joint.ctrl_range[0], joint.ctrl_range[1]);
        }
    }

    pub fn push(&mut self, sim: usize) {
        let Some(pushes) = self.task.pushes else { return };

        if self.steps[sim] < self.push_at[sim] {
            return;
        }

        let rng = &mut self.rngs[sim];
        let angle = rng.uniform(0.0, std::f64::consts::TAU);
        let speed = rng.uniform(pushes.speed[0], pushes.speed[1]);
        let gap = rng.range(pushes.gap_steps[0], pushes.gap_steps[1]);
        let at = self.robot.layout.qvel + self.robot.root_dof;
        let row = self.physics.row(sim);

        row[at] += angle.cos() * speed;
        row[at + 1] += angle.sin() * speed;
        self.push_at[sim] = self.steps[sim] + gap;
    }

    pub fn rows(&mut self) -> Vec<Vec<f64>> {
        (0..self.count).map(|s| self.physics.row(s).to_vec()).collect()
    }

    pub fn finish(&mut self, sim: usize, clipped: &[f64]) -> Outcome {
        let nact = self.task.nact();
        let nq = self.plan.kernel.nq;
        let x = self.state(sim);
        let frame = Frame {
            qpos: &x[..nq],
            qvel: &x[nq..],
        };
        let last = &self.last[sim * nact..(sim + 1) * nact];
        let actions = Actions { action: clipped, last };
        let reward = run(&self.task.reward, &self.task, (&frame, &actions));
        let fell = self.task.fall_resets && run(&self.task.fell, &self.task, (&frame, &actions)) != 0.0;

        self.steps[sim] += 1;

        let timeout = self.steps[sim] >= self.task.episode_steps;

        self.last[sim * nact..(sim + 1) * nact].copy_from_slice(clipped);

        Outcome { reward, fell, timeout }
    }

    pub fn advance(&mut self, rows: &[Vec<f64>], smoothing: Smooth) -> Result<Vec<Jacobian>, String> {
        let decimation = self.robot.decimation;
        let gradients = Gradients {
            plan: &self.plan,
            map: &self.map,
            params: &self.params,
            wrt: &self.wrt,
        };
        let physics = &mut self.physics;
        let (jacobians, failed) = std::thread::scope(|scope| {
            let worker = scope.spawn(|| gradients.jacobians(rows, (decimation, smoothing)));
            let failed = physics.step(decimation);

            (worker.join(), failed)
        });

        if failed > 0 {
            let reason = physics.first_error().unwrap_or_default();

            return Err(format!("The physics failed on {failed} robots: {reason}"));
        }

        jacobians.map_err(|_| "a gradient thread panicked".to_owned())?
    }
}

struct Gradients<'g> {
    plan: &'g Plan,
    map: &'g RowMap,
    params: &'g WorldParams,
    wrt: &'g [Wrt],
}

impl Gradients<'_> {
    fn jacobians(&self, rows: &[Vec<f64>], (substeps, smoothing): (usize, Smooth)) -> Result<Vec<Jacobian>, String> {
        let blocks: Vec<Result<Vec<Jacobian>, String>> = rows
            .par_chunks(LANES)
            .enumerate()
            .map(|(b, chunk)| {
                let mut state = State::new(self.plan);
                let mut w = Workspace::new(self.plan);

                for (lane, row) in chunk.iter().enumerate() {
                    self.map.load(&mut state, lane, row);
                    state.tables.set_lane(lane, &self.params.view(b * LANES + lane));
                }

                let spec = Spec {
                    wrt: self.wrt,
                    substeps,
                    smoothing,
                    lanes: chunk.len(),
                };

                step_with_jacobian(self.plan, &mut state, &mut w, &spec)
            })
            .collect();

        blocks.into_iter().try_fold(Vec::new(), |mut all, b| {
            all.extend(b?);
            Ok(all)
        })
    }
}
