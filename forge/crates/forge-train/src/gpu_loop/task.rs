use crate::envs::{PUSH_GAP_SECONDS, PUSH_SPEED};
use crate::job::{Algo, Task as JobTask};
use crate::robot::Robot;
use forge_ir::task::{Actuated, Code, Pushes, Task, OBSERVATIONS};
use forge_reward::{compile, programs, Schema};

fn lowered(source: &str, joints: usize) -> Result<Code, String> {
    let schema = Schema { joints, bodies: 0 };
    let program = compile(source, schema).map_err(|e| format!("The reward doesn't compile: {e}"))?;

    program.lower()
}

fn reward_source(robot: &Robot) -> String {
    match (&robot.job.options.reward, robot.job.task) {
        (Some(source), _) => source.clone(),
        (None, JobTask::Stand) => programs::stand(),
        (None, JobTask::Walk) => programs::walk(),
    }
}

fn unsupported(robot: &Robot) -> Vec<&'static str> {
    let job = &robot.job;
    let options = &job.options;

    [
        (options.commands.is_some(), "it doesn't draw commands"),
        (options.delay_steps != [0, 0], "it doesn't model servo delays"),
        (options.encoder_bias > 0.0, "it doesn't model encoder bias"),
        (options.imu_bias > 0.0, "it doesn't model IMU bias"),
    ]
    .into_iter()
    .filter(|(refused, _)| *refused)
    .map(|(_, why)| why)
    .collect()
}

fn pushes(robot: &Robot) -> Option<Pushes> {
    let dt = robot.control_dt;

    robot.job.options.pushes.then_some(Pushes {
        speed: [PUSH_SPEED.0, PUSH_SPEED.1],
        gap_steps: [(PUSH_GAP_SECONDS.0 / dt) as i64, (PUSH_GAP_SECONDS.1 / dt) as i64],
    })
}

pub fn lower(robot: &Robot) -> Result<Task, String> {
    if robot.job.algo != Algo::Ppo {
        return Err("Forge's GPU loop can't train this job: it learns with PPO only".to_owned());
    }

    describe(robot).map_err(|why| format!("Forge's GPU loop can't train this job: {why}"))
}

pub fn describe(robot: &Robot) -> Result<Task, String> {
    let refused = unsupported(robot);

    if !refused.is_empty() {
        return Err(refused.join(", "));
    }

    let job = &robot.job;
    let nact = robot.nact;
    let joints = (0..nact)
        .map(|j| Actuated {
            qpos: robot.joint_qpos[j],
            dof: robot.joint_dof[j],
            actuator: robot.actuators[j],
            default_pose: job.default_pose[j],
            ctrl_range: [robot.ctrl_low[j], robot.ctrl_high[j]],
        })
        .collect();

    Ok(Task {
        joints,
        ctrl_default: job.ctrl_default.clone(),
        root_qpos: robot.root_qpos,
        root_dof: robot.root_dof,
        action_scale: job.action_scale,
        command: job.command,
        z0: robot.z0,
        control_dt: robot.control_dt,
        decimation: robot.decimation,
        episode_steps: robot.episode_steps,
        reset_noise: job.options.reset_noise,
        fall_resets: job.options.fall_resets,
        squash: false,
        pushes: pushes(robot),
        observations: OBSERVATIONS.to_vec(),
        reward: lowered(&reward_source(robot), nact)?,
        fell: lowered(&programs::fell(), nact)?,
    })
}
