use crate::deployed::Squash;
use crate::envs::{PUSH_GAP_SECONDS, PUSH_SPEED};
use crate::job::{Algo, Task as JobTask};
use crate::robot::Robot;
use forge_ir::task::{Actuated, Code, CommandDraws, Conditions, Pushes, Task, OBSERVATIONS};
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
        (job.algo != Algo::Ppo, "it learns with PPO only"),
        (
            options.delay_steps[0] > options.delay_steps[1],
            "its servo delays run backwards",
        ),
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

fn conditions(robot: &Robot) -> Conditions {
    let options = &robot.job.options;
    let dt = robot.control_dt;

    Conditions {
        commands: options.commands.as_ref().map(|c| CommandDraws {
            ranges: c.ranges,
            resample_steps: c.resample_s.map(|s| s / dt),
            still_share: c.still_share,
        }),
        delay_steps: options.delay_steps,
        encoder_bias: options.encoder_bias,
        imu_bias: options.imu_bias,
    }
}

pub fn lower(robot: &Robot) -> Result<Task, String> {
    let refused = unsupported(robot);

    if !refused.is_empty() {
        return Err(format!("Forge's GPU loop can't train this job: {}", refused.join(", ")));
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
        squash: job.squash == Squash::Tanh,
        pushes: pushes(robot),
        conditions: conditions(robot),
        observations: OBSERVATIONS.to_vec(),
        reward: lowered(&reward_source(robot), nact)
            .map_err(|e| format!("Forge's GPU loop can't train this job: {e}"))?,
        fell: lowered(&programs::fell(), nact)?,
    })
}
