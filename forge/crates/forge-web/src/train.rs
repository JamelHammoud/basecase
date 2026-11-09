use crate::{backend, fields, host};
use forge_train::algorithm::{self, Algorithm};
use forge_train::envs::Envs;
use forge_train::export::{policy_json, Trained};
use forge_train::host::HostModel;
use forge_train::kernels::Math;
use forge_train::robot::{Robot, Settled};
use forge_train::warm;
use serde_json::{json, Value};
use std::cell::Cell;

const REWARD_RATE_HZ: f64 = 10.0;
const ENV_SEED_OFFSET: u64 = 1;

thread_local! {
    static STOP: Cell<bool> = const { Cell::new(false) };
}

pub struct Start {
    pub job: Value,
    pub row: Vec<f64>,
    pub holds_pose: bool,
    pub z0: f64,
    pub warm: Option<String>,
    pub version: String,
}

pub fn stop() {
    STOP.set(true);
}

fn status(message: &str) {
    host::send(&json!({ "type": "status", "message": message }).to_string());
}

fn robot(start: &Start) -> Result<Robot, String> {
    let fields = fields::take();
    let kernel = forge_ir::lower(&fields).map_err(|r| r.to_string())?;
    let model = HostModel {
        fields,
        kernel,
        launch: backend::launch,
        version: start.version.clone(),
    };
    let mut job = forge_train::job::parse(&start.job)?;
    let settled = Settled {
        row: start.row.clone(),
        holds_pose: start.holds_pose,
        z0: start.z0,
    };

    job.warm_start = None;
    job.threads = Some(1);

    Robot::from_host(model, job, settled)
}

fn progress(robot: &Robot, algo: &mut dyn Algorithm, iteration: usize, elapsed: f64) -> u64 {
    let report = algo.report();

    host::send(
        &json!({
            "type": "progress",
            "iteration": iteration,
            "steps": report.steps,
            "elapsedS": elapsed,
            "budgetS": robot.job.minutes * 60.0,
            "reward": report.reward_mean / (robot.control_dt * REWARD_RATE_HZ),
            "episodeS": report.episode_seconds,
            "fps": report.steps as f64 / elapsed.max(1e-6),
        })
        .to_string(),
    );

    report.steps
}

fn train_loop(robot: &Robot, algo: &mut dyn Algorithm) -> Result<u64, String> {
    let job = &robot.job;
    let budget = job.minutes * 60.0;
    let started = host::now();
    let (mut iteration, mut steps) = (0usize, 0u64);

    STOP.set(false);

    while !STOP.get() && host::now() - started < budget && job.max_iterations.is_none_or(|limit| iteration < limit) {
        algo.iterate()?;
        iteration += 1;
        steps = progress(robot, algo, iteration, host::now() - started);
    }

    Ok(steps)
}

fn outcome(robot: &Robot, algo: &dyn Algorithm, steps: u64) -> Result<Value, String> {
    let policy = algo.deployed();
    let run = Trained {
        robot,
        policy: &policy,
        norm: algo.norm(),
    };
    let resume = warm::resume_text(&algo.snapshot(), algo.norm(), steps)?;

    Ok(json!({
        "policy": policy_json(&run, steps, String::new()),
        "resume": resume,
        "steps": steps,
        "stopped": STOP.get(),
    }))
}

fn report_panics() {
    std::panic::set_hook(Box::new(|info| {
        host::send(&json!({ "type": "status", "message": format!("Forge stopped: {info}") }).to_string());
    }));
}

pub fn train(start: Start) -> Result<Value, String> {
    report_panics();
    status("Building environments");

    let robot = robot(&start)?;

    if let Some(note) = robot.engine.status() {
        status(&note);
    }

    let count = robot.job.envs;
    let envs = Envs::new(&robot, count, robot.job.seed + ENV_SEED_OFFSET, true)?;
    let mut algo = algorithm::build(robot.job.algo, envs, robot.job.seed, Math::portable(1));

    if let Some(text) = &start.warm {
        status("Continuing from a trained policy");

        for note in algo.warm_start(&warm::from_text(text)?)? {
            status(&note);
        }
    }

    if !robot.holds_pose {
        status("Can't hold the pose without help. Training from a fall.");
    }

    status(&format!("Training on {count} robots"));

    let steps = train_loop(&robot, algo.as_mut())?;

    outcome(&robot, algo.as_ref(), steps)
}
