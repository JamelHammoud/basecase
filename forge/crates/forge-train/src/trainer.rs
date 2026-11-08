use crate::algorithm::{self, Algorithm};
use crate::blind::LINEAR_VELOCITY;
use crate::envs::Envs;
use crate::evaluate::{evaluate_clean, evaluate_seeds, Trained as EvalRun};
use crate::events::{emit, status};
use crate::export::{write_check, write_onnx, write_policy, Trained as ExportRun};
use crate::gates;
use crate::job::{self, Job};
use crate::kernels::Math;
use crate::platform::{install_stop_handlers, raise_thread_priority, stop_requested};
use crate::robot::Robot;
use forge_mujoco::Model;
use serde_json::{json, Value};
use std::path::Path;
use std::time::Instant;

const MAX_ITERATION_GAP_S: f64 = 30.0;
const SAVE_EVERY_S: f64 = 60.0;
const REWARD_RATE_HZ: f64 = 10.0;
const ENV_SEED_OFFSET: u64 = 1;

fn should_stop(folder: &Path) -> bool {
    stop_requested() || folder.join("stop").exists()
}

fn save_policy(folder: &Path, robot: &Robot, algo: &dyn Algorithm, steps: u64) -> Result<(), String> {
    let policy = algo.deployed();
    let run = ExportRun {
        robot,
        policy: &policy,
        norm: algo.norm(),
    };

    write_policy(&folder.join("policy.json"), &run, steps)
}

struct Clock {
    last_tick: Instant,
    elapsed: f64,
}

impl Clock {
    fn tick(&mut self) -> f64 {
        let now = Instant::now();

        self.elapsed += now
            .duration_since(self.last_tick)
            .as_secs_f64()
            .min(MAX_ITERATION_GAP_S);
        self.last_tick = now;

        self.elapsed
    }
}

fn emit_progress(robot: &Robot, algo: &mut dyn Algorithm, iteration: usize, clock: &mut Clock) -> u64 {
    let elapsed = clock.tick();
    let report = algo.report();
    let budget = robot.job.minutes * 60.0;

    emit(&json!({
        "type": "progress",
        "iteration": iteration,
        "steps": report.steps,
        "elapsedS": elapsed,
        "budgetS": budget,
        "reward": report.reward_mean / (robot.control_dt * REWARD_RATE_HZ),
        "episodeS": report.episode_seconds,
        "fps": report.steps as f64 / elapsed.max(1e-6),
        "phases": report.phases.to_json(),
    }));

    report.steps
}

fn blind(robot: &Robot, algo: &mut dyn Algorithm) {
    if !robot.job.options.actor_linvel {
        algo.blind_inputs(&LINEAR_VELOCITY);
    }
}

fn train_loop(robot: &Robot, algo: &mut dyn Algorithm, folder: &Path) -> Result<u64, String> {
    let job = &robot.job;
    let budget = job.minutes * 60.0;
    let mut clock = Clock {
        last_tick: Instant::now(),
        elapsed: 0.0,
    };
    let mut last_save = Instant::now();
    let mut iteration = 0usize;
    let mut steps = 0u64;

    std::thread::scope(|scope| {
        let mut pending: Option<gates::Pending> = None;

        while !should_stop(folder) && clock.elapsed < budget && job.max_iterations.is_none_or(|limit| iteration < limit)
        {
            algo.iterate()?;
            blind(robot, algo);
            iteration += 1;
            steps = emit_progress(robot, algo, iteration, &mut clock);

            if last_save.elapsed().as_secs_f64() > SAVE_EVERY_S {
                save_policy(folder, robot, algo, steps)?;
                last_save = Instant::now();
            }

            let due = gates::due(robot, iteration);

            if (due || gates::is_finished(&pending)) && pending.take().map(gates::finish).transpose()? == Some(true) {
                return Ok(steps);
            }

            if due {
                pending = Some(gates::start(scope, robot, algo, (iteration, steps)));
            }
        }

        if let Some(last) = pending {
            gates::finish(last)?;
        }

        Ok(steps)
    })
}

fn finish(robot: &Robot, algo: &dyn Algorithm, folder: &Path, steps: u64) -> Result<(), String> {
    status("Checking the policy");
    save_policy(folder, robot, algo, steps)?;

    let mut policy = algo.deployed();
    let export = ExportRun {
        robot,
        policy: &policy,
        norm: algo.norm(),
    };

    if let Err(reason) = write_onnx(&folder.join("policy.onnx"), &export) {
        status(&format!("Skipped ONNX export: {reason}"));
    }

    let mut eval_run = EvalRun {
        robot,
        policy: &mut policy,
        norm: algo.norm(),
        math: algo.math(),
        threads: None,
    };
    let (clean, samples) = evaluate_clean(&mut eval_run)?;
    let gate = match robot.job.eval_seeds {
        Some(seeds) => evaluate_seeds(&mut eval_run, seeds)?.to_json(),
        None => Value::Null,
    };

    write_check(&folder.join("policy-check.json"), &samples)?;
    emit(&json!({
        "type": "done",
        "policy": folder.join("policy.json").to_string_lossy(),
        "steps": steps,
        "stopped": should_stop(folder),
        "eval": clean,
        "gate": gate,
    }));

    Ok(())
}

fn learner_threads() -> usize {
    std::thread::available_parallelism().map_or(4, |c| c.get()).div_ceil(2)
}

pub fn train(folder: &Path) -> Result<(), String> {
    raise_thread_priority();
    install_stop_handlers();

    let job: Job = job::load(folder)?;
    let seed = job.seed;
    let envs_count = job.envs;
    let kind = job.algo;

    status("Building environments");

    let model = Model::load(&folder.join("model.xml"))?;
    let robot = Robot::load(model, job)?;
    let envs = Envs::new(&robot, envs_count, seed + ENV_SEED_OFFSET, true)?;
    let mut algo = algorithm::build(kind, envs, seed, Math::native(learner_threads()));

    blind(&robot, algo.as_mut());

    if !robot.holds_pose {
        status("Can't hold the pose without help. Training from a fall.");
    }

    status(&format!("Training on {envs_count} robots"));

    let steps = train_loop(&robot, algo.as_mut(), folder)?;

    finish(&robot, algo.as_ref(), folder, steps)
}
