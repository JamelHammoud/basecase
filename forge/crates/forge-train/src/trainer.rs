use crate::algorithm::{self, Algorithm};
use crate::envs::Envs;
use crate::evaluate::{evaluate_clean, evaluate_seeds, Trained as EvalRun};
use crate::events::{emit, status};
use crate::export::{write_check, write_onnx, write_policy, Trained as ExportRun};
use crate::gates;
use crate::gpu_loop::{self, GpuPpo, Start};
use crate::job::{self, Algo, Backend, Job};
use crate::kernels::Math;
use crate::physics::Engine;
use crate::platform::{install_stop_handlers, raise_thread_priority, stop_requested};
use crate::robot::Robot;
use crate::shac::{Hyper, Shac};
use crate::warm::{self, write_resume};
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

    write_resume(&folder.join("resume.json"), &algo.snapshot(), algo.norm(), steps)?;
    write_policy(&folder.join("policy.json"), &run, steps)
}

fn warm_start(robot: &Robot, algo: &mut dyn Algorithm, folder: &Path) -> Result<(), String> {
    let Some(path) = &robot.job.warm_start else {
        return Ok(());
    };
    let source = warm::load(&folder.join(path))?;

    status("Continuing from a trained policy");

    for note in algo.warm_start(&source)? {
        status(&note);
    }

    Ok(())
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

fn train_on_gpu(folder: &Path, robot: &Robot, mut algo: GpuPpo) -> Result<(), String> {
    let job = Job {
        backend: Backend::Mujoco,
        ..robot.job.clone()
    };
    let replay = Robot::load(Model::load(&folder.join("model.xml"))?, job)?;

    status(&format!(
        "Training on the GPU: physics, policy and learner on {}. Every check replays in C MuJoCo",
        algo.device
    ));
    warm_start(&replay, &mut algo, folder)?;

    if !replay.holds_pose {
        status("Can't hold the pose without help. Training from a fall.");
    }

    status(&format!("Training on {} robots", replay.job.envs));

    let steps = train_loop(&replay, &mut algo, folder)?;

    finish(&replay, &algo, folder, steps)
}

fn train_shac(folder: &Path, robot: &Robot) -> Result<(), String> {
    let job = Job {
        backend: Backend::Mujoco,
        ..robot.job.clone()
    };
    let replay = Robot::load(Model::load(&folder.join("model.xml"))?, job)?;
    let mut algo = Shac::new(robot, Hyper::tuned(), Math::native(learner_threads()))?;

    status(
        "Training with SHAC: first-order gradients through Forge's smoothed physics. Every check replays in C MuJoCo",
    );
    warm_start(&replay, &mut algo, folder)?;
    status(&format!("Training on {} robots", replay.job.envs));

    let steps = train_loop(&replay, &mut algo, folder)?;

    finish(&replay, &algo, folder, steps)
}

fn try_gpu_loop(robot: &Robot) -> Option<GpuPpo> {
    if robot.job.backend != Backend::Metal || !matches!(robot.engine, Engine::Metal { .. }) {
        return None;
    }

    let start = Start {
        robot,
        envs: robot.job.envs,
        env_seed: robot.job.seed + ENV_SEED_OFFSET,
        seed: robot.job.seed,
        math: Math::native(learner_threads()),
    };

    gpu_loop::start(start)
        .inspect_err(|why| status(&format!("{why}. Learning on the CPU")))
        .ok()
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

    if let Some(note) = robot.engine.status() {
        status(&note);
    }

    if kind == Algo::Shac {
        return train_shac(folder, &robot);
    }

    if let Some(algo) = try_gpu_loop(&robot) {
        return train_on_gpu(folder, &robot, algo);
    }

    let envs = Envs::new(&robot, envs_count, seed + ENV_SEED_OFFSET, true)?;
    let mut algo = algorithm::build(kind, envs, seed, Math::native(learner_threads()))?;

    warm_start(&robot, algo.as_mut(), folder)?;

    if !robot.holds_pose {
        status("Can't hold the pose without help. Training from a fall.");
    }

    status(&format!("Training on {envs_count} robots"));

    let steps = train_loop(&robot, algo.as_mut(), folder)?;

    finish(&robot, algo.as_ref(), folder, steps)
}
