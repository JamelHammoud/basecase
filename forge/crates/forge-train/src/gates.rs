use crate::algorithm::Algorithm;
use crate::deployed::Deployed;
use crate::evaluate::{evaluate_seeds, GateResult, Trained};
use crate::events::emit;
use crate::kernels::Math;
use crate::normalizer::Normalizer;
use crate::robot::Robot;
use crate::warm::Snapshot;
use serde_json::{json, Value};
use std::thread::{Scope, ScopedJoinHandle};

const GATE_THREADS: usize = 6;
const DEFAULT_SEEDS: usize = 32;

pub struct Checked {
    pub policy: Deployed,
    pub norm: Normalizer,
    pub snapshot: Snapshot,
    pub steps: u64,
}

pub struct Passed {
    pub checked: Checked,
    pub gate: Value,
}

pub struct Pending<'scope> {
    iteration: usize,
    steps: u64,
    norm: Normalizer,
    snapshot: Snapshot,
    handle: ScopedJoinHandle<'scope, Result<(GateResult, Deployed), String>>,
}

pub fn due(robot: &Robot, iteration: usize) -> bool {
    robot
        .job
        .gate_every
        .is_some_and(|every| every > 0 && iteration.is_multiple_of(every))
}

pub fn start<'scope, 'env>(
    scope: &'scope Scope<'scope, 'env>,
    robot: &'env Robot,
    algo: &dyn Algorithm,
    at: (usize, u64),
) -> Pending<'scope> {
    let mut policy = algo.deployed().as_exported();
    let norm = algo.norm().clone();
    let gate_norm = norm.clone();
    let seeds = robot.job.eval_seeds.unwrap_or(DEFAULT_SEEDS);
    let cap = if algo.leaves_the_cpu_free() {
        std::thread::available_parallelism().map_or(GATE_THREADS, |c| c.get())
    } else {
        GATE_THREADS
    };
    let handle = scope.spawn(move || {
        let math = Math::native(1);
        let mut run = Trained {
            robot,
            policy: &mut policy,
            norm: &gate_norm,
            math: &math,
            threads: Some(robot.job.threads.unwrap_or(cap).min(cap)),
        };
        let result = evaluate_seeds(&mut run, seeds)?;

        Ok((result, policy))
    });

    Pending {
        iteration: at.0,
        steps: at.1,
        norm,
        snapshot: algo.snapshot(),
        handle,
    }
}

pub fn finish(pending: Pending) -> Result<Option<Passed>, String> {
    let (result, policy) = pending
        .handle
        .join()
        .map_err(|_| "The gate check panicked".to_owned())??;
    let mut event = json!({ "type": "gate", "iteration": pending.iteration, "steps": pending.steps });

    if let (Value::Object(target), Value::Object(fields)) = (&mut event, result.to_json()) {
        target.extend(fields);
    }

    emit(&event);

    Ok(result.reached().then(|| Passed {
        checked: Checked {
            policy,
            norm: pending.norm,
            snapshot: pending.snapshot,
            steps: pending.steps,
        },
        gate: result.to_json(),
    }))
}

pub fn is_finished(pending: &Option<Pending>) -> bool {
    pending.as_ref().is_some_and(|p| p.handle.is_finished())
}
