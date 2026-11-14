pub mod demos;
pub mod fit;
#[cfg(test)]
mod tests;

use crate::deployed::Deployed;
use crate::evaluate::{exact_action, CheckSample};
use crate::events::{emit, status};
use crate::export::{write_check, write_onnx, write_policy, Trained};
use crate::job::Job;
use crate::mask::actor_mask;
use crate::normalizer::Normalizer;
use crate::platform::should_stop;
use demos::{joint_state_columns, last_action_columns, Demos};
use fit::{Epoch, Fitted, Settings, MAX_EPOCHS};
use serde_json::json;
use std::path::Path;

const CHECK_SAMPLES: usize = 16;

pub fn input_mask(job: &Job) -> Vec<usize> {
    let nact = job.joints.len();

    last_action_columns(nact)
        .chain(actor_mask(&job.options).iter().copied())
        .collect()
}

pub fn settings<'a>(job: &Job, mask: &'a [usize]) -> Settings<'a> {
    Settings {
        seed: job.seed,
        max_epochs: job.max_iterations.unwrap_or(MAX_EPOCHS),
        budget_s: job.minutes * 60.0,
        mask,
        state_noise: job.state_noise,
        noisy: joint_state_columns(job.joints.len()),
    }
}

fn progress(job: &Job, epoch: &Epoch) {
    emit(&json!({
        "type": "progress",
        "iteration": epoch.epoch,
        "steps": epoch.rows_seen,
        "elapsedS": epoch.elapsed_s,
        "budgetS": job.minutes * 60.0,
        "reward": -epoch.held_loss,
        "episodeS": 0.0,
        "fps": epoch.rows_seen as f64 / epoch.elapsed_s.max(1e-6),
    }));
}

pub fn check_samples(demos: &Demos, policy: &Deployed, norm: &Normalizer) -> Vec<CheckSample> {
    let rows = &demos.held;
    let stride = (rows.count / CHECK_SAMPLES).max(1);

    (0..rows.count)
        .step_by(stride)
        .take(CHECK_SAMPLES)
        .map(|r| {
            let obs = rows.obs[r * demos.nobs..(r + 1) * demos.nobs].to_vec();
            let action = exact_action(policy, norm, &obs);

            CheckSample { obs, action }
        })
        .collect()
}

fn save(folder: &Path, run: &Trained, fitted: &Fitted, samples: &[CheckSample]) -> Result<(), String> {
    write_policy(&folder.join("policy.json"), run, fitted.rows_seen)?;

    if let Err(reason) = write_onnx(&folder.join("policy.onnx"), run) {
        status(&format!("Skipped ONNX export: {reason}"));
    }

    write_check(&folder.join("policy-check.json"), samples)
}

pub fn train(folder: &Path, job: &Job, mujoco: &str) -> Result<(), String> {
    let name = job.demos.as_deref().ok_or("job.json names no demos file")?;
    let demos = demos::load(&folder.join(name), job.joints.len())?;
    let mask = input_mask(job);
    let fitted = fit::fit(&demos, &settings(job, &mask), &mut |epoch| {
        progress(job, epoch);

        !should_stop(folder)
    });
    let exported = fitted.policy.as_exported();
    let run = Trained {
        job,
        mujoco,
        policy: &exported,
        norm: &fitted.norm,
    };

    save(folder, &run, &fitted, &check_samples(&demos, &exported, &fitted.norm))?;
    emit(&json!({
        "type": "done",
        "policy": folder.join("policy.json").to_string_lossy(),
        "steps": fitted.rows_seen,
        "stopped": fitted.stopped || should_stop(folder),
        "eval": null,
        "gate": null,
        "bc": {
            "epochs": fitted.epochs,
            "bestEpoch": fitted.best_epoch,
            "trainLoss": fitted.train_loss,
            "heldOutLoss": fitted.held_loss,
            "rows": demos.rows(),
            "trainRows": demos.train.count,
            "heldOutRows": demos.held.count,
        },
    }));

    Ok(())
}
