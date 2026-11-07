use crate::job::Job;
use forge_mujoco::{Batch, Data, Model, StateLayout};

const SETTLE_SECONDS: f64 = 1.0;
const STANDING_TILT_DEGREES: f64 = 20.0;

pub struct Robot {
    pub model: Model,
    pub job: Job,
    pub layout: StateLayout,
    pub control_dt: f64,
    pub decimation: usize,
    pub episode_steps: i64,
    pub root_qpos: usize,
    pub root_dof: usize,
    pub joint_qpos: Vec<usize>,
    pub joint_dof: Vec<usize>,
    pub actuators: Vec<usize>,
    pub ctrl_low: Vec<f64>,
    pub ctrl_high: Vec<f64>,
    pub nact: usize,
    pub start_row: Vec<f64>,
    pub holds_pose: bool,
    pub z0: f64,
}

pub fn rotate_into_frame(q: &[f64], v: [f64; 3]) -> [f64; 3] {
    let (w, x, y, z) = (q[0], q[1], q[2], q[3]);
    let scale_v = 2.0 * w * w - 1.0;
    let cross = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]];
    let along = 2.0 * (x * v[0] + y * v[1] + z * v[2]);

    [
        v[0] * scale_v - cross[0] * w * 2.0 + x * along,
        v[1] * scale_v - cross[1] * w * 2.0 + y * along,
        v[2] * scale_v - cross[2] * w * 2.0 + z * along,
    ]
}

pub fn quat_multiply(a: [f64; 4], b: [f64; 4]) -> [f64; 4] {
    [
        a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
        a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
        a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
        a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
    ]
}

fn joint_of(model: &Model, name: &str) -> Result<usize, String> {
    model
        .joint_id(name)
        .ok_or_else(|| format!("The model has no joint named {name}"))
}

fn apply_start_pose(model: &Model, job: &Job, data: &mut Data, root_qpos: usize) -> Result<(), String> {
    for (name, angle) in &job.initial_joints {
        data.qpos()[model.joint_qpos_adr(joint_of(model, name)?)] = *angle;
    }

    for axis in 0..3 {
        data.qpos()[root_qpos + axis] += job.root_offset[axis];
    }

    Ok(())
}

struct Settled {
    row: Vec<f64>,
    holds_pose: bool,
    z0: f64,
}

fn settle(model: &Model, job: &Job, root_qpos: usize, layout: StateLayout) -> Result<Settled, String> {
    let mut data = Data::new(model);

    apply_start_pose(model, job, &mut data, root_qpos)?;
    data.ctrl().copy_from_slice(&job.ctrl_default);
    data.forward(model);
    data.hold_delayed_controls(model, &job.ctrl_default);

    let z_start = data.qpos()[root_qpos + 2];
    let steps = (SETTLE_SECONDS / model.timestep()) as usize;

    (0..steps).for_each(|_| data.step(model));

    let up = -rotate_into_frame(&data.qpos()[root_qpos + 3..root_qpos + 7], [0.0, 0.0, -1.0])[2];
    let holds_pose = up >= STANDING_TILT_DEGREES.to_radians().cos();

    if !holds_pose {
        data.reset(model);
        apply_start_pose(model, job, &mut data, root_qpos)?;
        data.forward(model);
    }

    data.qvel().fill(0.0);
    data.set_time(0.0);
    data.hold_delayed_controls(model, &job.ctrl_default);

    let z0 = if holds_pose {
        data.qpos()[root_qpos + 2]
    } else {
        z_start
    };
    let mut row = vec![0.0; layout.nstate];

    data.get_state(model, &mut row, forge_mujoco::integration_state());

    let warmstart_width = model.nv();

    row[layout.warmstart..layout.warmstart + warmstart_width].fill(0.0);

    Ok(Settled { row, holds_pose, z0 })
}

fn actuator_limits(model: &Model, actuators: &[usize]) -> (Vec<f64>, Vec<f64>) {
    actuators
        .iter()
        .map(|&a| {
            if model.ctrl_limited(a) {
                model.ctrl_range(a)
            } else {
                (f64::NEG_INFINITY, f64::INFINITY)
            }
        })
        .unzip()
}

impl Robot {
    pub fn nobs(&self) -> usize {
        12 + 3 * self.nact
    }

    pub fn load(model: Model, job: Job) -> Result<Self, String> {
        let timestep = model.timestep();
        let decimation = ((job.control_dt / timestep).round_ties_even() as usize).max(1);
        let control_dt = decimation as f64 * timestep;
        let episode_seconds = if job.task == crate::job::Task::Stand {
            10.0
        } else {
            15.0
        };
        let root = joint_of(&model, &job.root)?;
        let root_qpos = model.joint_qpos_adr(root);
        let root_dof = model.joint_dof_adr(root);
        let ids: Result<Vec<usize>, String> = job.joints.iter().map(|j| joint_of(&model, &j.name)).collect();
        let ids = ids?;
        let actuators: Result<Vec<usize>, String> = job
            .joints
            .iter()
            .map(|j| {
                model
                    .actuator_id(&j.name)
                    .ok_or_else(|| format!("The model has no actuator named {}", j.name))
            })
            .collect();
        let actuators = actuators?;
        let (ctrl_low, ctrl_high) = actuator_limits(&model, &actuators);
        let layout = Batch::new(&model, 1, 1)?.layout();
        let settled = settle(&model, &job, root_qpos, layout)?;

        Ok(Self {
            layout,
            control_dt,
            decimation,
            episode_steps: (episode_seconds / control_dt) as i64,
            root_qpos,
            root_dof,
            joint_qpos: ids.iter().map(|&j| model.joint_qpos_adr(j)).collect(),
            joint_dof: ids.iter().map(|&j| model.joint_dof_adr(j)).collect(),
            nact: ids.len(),
            actuators,
            ctrl_low,
            ctrl_high,
            start_row: settled.row,
            holds_pose: settled.holds_pose,
            z0: settled.z0,
            model,
            job,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{quat_multiply, rotate_into_frame};

    #[test]
    fn rotation_into_a_yawed_frame() {
        let half = std::f64::consts::FRAC_PI_4;
        let q = [half.cos(), 0.0, 0.0, half.sin()];
        let v = rotate_into_frame(&q, [1.0, 0.0, 0.0]);

        assert!((v[0]).abs() < 1e-12 && (v[1] + 1.0).abs() < 1e-12 && v[2].abs() < 1e-12);
    }

    #[test]
    fn identity_quaternion_keeps_vectors_and_products() {
        let id = [1.0, 0.0, 0.0, 0.0];

        assert_eq!(rotate_into_frame(&id, [0.3, -0.2, 0.9]), [0.3, -0.2, 0.9]);
        assert_eq!(quat_multiply(id, [0.5, 0.5, 0.5, 0.5]), [0.5, 0.5, 0.5, 0.5]);
    }
}
