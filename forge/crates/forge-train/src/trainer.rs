use crate::envs::Envs;
use crate::evaluate::{evaluate_clean, evaluate_seeds, Trained as EvalRun};
use crate::events::{emit, status};
use crate::export::{write_check, write_onnx, write_policy, Trained as ExportRun};
use crate::job::{self, Job};
use crate::kernels::Math;
use crate::platform::{install_stop_handlers, raise_thread_priority, stop_requested};
use crate::ppo::Ppo;
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

fn save_policy(folder: &Path, ppo: &Ppo) -> Result<(), String> {
    let run = ExportRun {
        robot: ppo.envs.robot,
        learner: &ppo.learner,
        norm: &ppo.norm,
    };

    write_policy(&folder.join("policy.json"), &run, ppo.steps)
}

fn gate_reached(ppo: &mut Ppo, job: &Job, iteration: usize) -> Result<bool, String> {
    let due = job
        .gate_every
        .is_some_and(|every| every > 0 && iteration.is_multiple_of(every));

    if !due {
        return Ok(false);
    }

    let seeds = job.eval_seeds.unwrap_or(32);
    let mut run = EvalRun {
        robot: ppo.envs.robot,
        learner: &mut ppo.learner,
        norm: &ppo.norm,
        math: &ppo.math,
    };
    let result = evaluate_seeds(&mut run, seeds)?;
    let mut event = json!({ "type": "gate", "iteration": iteration, "steps": ppo.steps });

    if let (Value::Object(target), Value::Object(fields)) = (&mut event, result.to_json()) {
        target.extend(fields);
    }

    emit(&event);

    Ok(result.reached())
}

fn train_loop(ppo: &mut Ppo, folder: &Path, budget: f64) -> Result<(), String> {
    let job = ppo.envs.robot.job.clone();
    let control_dt = ppo.envs.robot.control_dt;
    let mut last_tick = Instant::now();
    let mut last_save = last_tick;
    let mut elapsed = 0.0f64;
    let mut iteration = 0usize;

    while !should_stop(folder) && elapsed < budget && job.max_iterations.is_none_or(|limit| iteration < limit) {
        ppo.iterate()?;
        iteration += 1;

        let now = Instant::now();

        elapsed += now.duration_since(last_tick).as_secs_f64().min(MAX_ITERATION_GAP_S);
        last_tick = now;
        ppo.trim_recent();
        emit(&json!({
            "type": "progress",
            "iteration": iteration,
            "steps": ppo.steps,
            "elapsedS": elapsed,
            "budgetS": budget,
            "reward": ppo.last_reward_mean / (control_dt * REWARD_RATE_HZ),
            "episodeS": ppo.mean_episode_seconds(),
            "fps": ppo.steps as f64 / elapsed.max(1e-6),
            "phases": ppo.phases.to_json(),
        }));

        if last_save.elapsed().as_secs_f64() > SAVE_EVERY_S {
            save_policy(folder, ppo)?;
            last_save = Instant::now();
        }

        if gate_reached(ppo, &job, iteration)? {
            break;
        }
    }

    Ok(())
}

fn finish(ppo: &mut Ppo, folder: &Path, stopped: bool) -> Result<(), String> {
    status("Checking the policy");
    save_policy(folder, ppo)?;

    let robot = ppo.envs.robot;
    let export = ExportRun {
        robot,
        learner: &ppo.learner,
        norm: &ppo.norm,
    };

    if let Err(reason) = write_onnx(&folder.join("policy.onnx"), &export) {
        status(&format!("Skipped ONNX export: {reason}"));
    }

    let mut eval_run = EvalRun {
        robot,
        learner: &mut ppo.learner,
        norm: &ppo.norm,
        math: &ppo.math,
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
        "steps": ppo.steps,
        "stopped": stopped,
        "eval": clean,
        "gate": gate,
    }));

    Ok(())
}

pub fn train(folder: &Path) -> Result<(), String> {
    raise_thread_priority();
    install_stop_handlers();

    let job = job::load(folder)?;
    let budget = job.minutes * 60.0;
    let seed = job.seed;
    let envs_count = job.envs;

    status("Building environments");

    let model = Model::load(&folder.join("model.xml"))?;
    let robot = Robot::load(model, job)?;
    let envs = Envs::new(&robot, envs_count, seed + ENV_SEED_OFFSET, true)?;
    let threads = std::thread::available_parallelism().map_or(4, |c| c.get());
    let mut ppo = Ppo::new(envs, seed, Math::native(threads));

    if !robot.holds_pose {
        status("Can't hold the pose without help. Training from a fall.");
    }

    status(&format!("Training on {envs_count} robots"));
    train_loop(&mut ppo, folder, budget)?;

    let stopped = should_stop(folder);

    finish(&mut ppo, folder, stopped)
}
