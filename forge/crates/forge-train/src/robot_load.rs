use crate::job::Job;
use crate::physics::Engine;
use crate::robot::{rotate_into_frame, Assembly, Joints, Robot, Settled};
use forge_mujoco::{Data, Model};
use forge_sim::rowmap::RowMap;
use forge_sim::Offsets;

const SETTLE_SECONDS: f64 = 1.0;
pub const STANDING_TILT_DEGREES: f64 = 20.0;

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

fn settle(model: &Model, job: &Job, root_qpos: usize, layout: Offsets) -> Result<Settled, String> {
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
    row[layout.warm..layout.warm + model.nv()].fill(0.0);

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

fn joints(model: &Model, job: &Job) -> Result<Joints, String> {
    let root = joint_of(model, &job.root)?;
    let ids = job
        .joints
        .iter()
        .map(|j| joint_of(model, &j.name))
        .collect::<Result<Vec<usize>, String>>()?;
    let actuators = job
        .joints
        .iter()
        .map(|j| {
            model
                .actuator_id(&j.name)
                .ok_or_else(|| format!("The model has no actuator named {}", j.name))
        })
        .collect::<Result<Vec<usize>, String>>()?;
    let (ctrl_low, ctrl_high) = actuator_limits(model, &actuators);

    Ok(Joints {
        root_qpos: model.joint_qpos_adr(root),
        root_dof: model.joint_dof_adr(root),
        joint_qpos: ids.iter().map(|&j| model.joint_qpos_adr(j)).collect(),
        joint_dof: ids.iter().map(|&j| model.joint_dof_adr(j)).collect(),
        actuators,
        ctrl_low,
        ctrl_high,
    })
}

impl Robot {
    pub fn load(model: Model, job: Job) -> Result<Self, String> {
        let joints = joints(&model, &job)?;
        let layout = RowMap::new(&model)?.offsets();
        let settled = settle(&model, &job, joints.root_qpos, layout)?;
        let parts = Assembly {
            timestep: model.timestep(),
            nu: model.nu(),
            layout,
            joints,
            settled,
            engine: Engine::choose(&model, job.backend),
            mujoco: forge_mujoco::version(),
        };

        Ok(Robot::assemble(model, job, parts))
    }
}
