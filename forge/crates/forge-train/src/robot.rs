use crate::job::{Job, Task};
use crate::physics::Engine;
use forge_sim::Offsets;

#[cfg(feature = "native")]
pub type ModelRef = forge_mujoco::Model;
#[cfg(not(feature = "native"))]
pub type ModelRef = crate::host::HostModel;

pub struct Robot {
    pub model: ModelRef,
    pub job: Job,
    pub layout: Offsets,
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
    pub nu: usize,
    pub start_row: Vec<f64>,
    pub holds_pose: bool,
    pub z0: f64,
    pub engine: Engine,
    pub mujoco: String,
}

pub struct Joints {
    pub root_qpos: usize,
    pub root_dof: usize,
    pub joint_qpos: Vec<usize>,
    pub joint_dof: Vec<usize>,
    pub actuators: Vec<usize>,
    pub ctrl_low: Vec<f64>,
    pub ctrl_high: Vec<f64>,
}

pub struct Settled {
    pub row: Vec<f64>,
    pub holds_pose: bool,
    pub z0: f64,
}

pub struct Assembly {
    pub timestep: f64,
    pub nu: usize,
    pub layout: Offsets,
    pub joints: Joints,
    pub settled: Settled,
    pub engine: Engine,
    pub mujoco: String,
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

impl Robot {
    pub fn nobs(&self) -> usize {
        12 + 3 * self.nact
    }

    pub fn assemble(model: ModelRef, job: Job, parts: Assembly) -> Self {
        let decimation = ((job.control_dt / parts.timestep).round_ties_even() as usize).max(1);
        let control_dt = decimation as f64 * parts.timestep;
        let default_episode = if job.task == Task::Stand { 10.0 } else { 15.0 };
        let episode_seconds = job.options.episode_s.unwrap_or(default_episode);
        let j = parts.joints;

        Self {
            layout: parts.layout,
            control_dt,
            decimation,
            episode_steps: (episode_seconds / control_dt) as i64,
            root_qpos: j.root_qpos,
            root_dof: j.root_dof,
            nact: j.joint_qpos.len(),
            nu: parts.nu,
            joint_qpos: j.joint_qpos,
            joint_dof: j.joint_dof,
            actuators: j.actuators,
            ctrl_low: j.ctrl_low,
            ctrl_high: j.ctrl_high,
            start_row: parts.settled.row,
            holds_pose: parts.settled.holds_pose,
            z0: job.options.stand_height.unwrap_or(parts.settled.z0),
            engine: parts.engine,
            mujoco: parts.mujoco,
            model,
            job,
        }
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
