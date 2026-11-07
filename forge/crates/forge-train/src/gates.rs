use crate::algorithm::Algorithm;
use crate::evaluate::{evaluate_seeds, GateResult, Trained};
use crate::events::emit;
use crate::kernels::Math;
use crate::robot::Robot;
use serde_json::{json, Value};
use std::thread::{Scope, ScopedJoinHandle};

const GATE_THREADS: usize = 6;
const DEFAULT_SEEDS: usize = 32;

pub struct Pending<'scope> {
    iteration: usize,
    steps: u64,
    handle: ScopedJoinHandle<'scope, Result<GateResult, String>>,
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
    let mut policy = algo.deployed();
    let norm = algo.norm().clone();
    let seeds = robot.job.eval_seeds.unwrap_or(DEFAULT_SEEDS);
    let handle = scope.spawn(move || {
        let math = Math::native(1);
        let mut run = Trained {
            robot,
            policy: &mut policy,
            norm: &norm,
            math: &math,
            threads: Some(robot.job.threads.unwrap_or(GATE_THREADS).min(GATE_THREADS)),
        };

        evaluate_seeds(&mut run, seeds)
    });

    Pending {
        iteration: at.0,
        steps: at.1,
        handle,
    }
}

pub fn finish(pending: Pending) -> Result<bool, String> {
    let result = pending
        .handle
        .join()
        .map_err(|_| "The gate check panicked".to_owned())??;
    let mut event = json!({ "type": "gate", "iteration": pending.iteration, "steps": pending.steps });

    if let (Value::Object(target), Value::Object(fields)) = (&mut event, result.to_json()) {
        target.extend(fields);
    }

    emit(&event);

    Ok(result.reached())
}

pub fn is_finished(pending: &Option<Pending>) -> bool {
    pending.as_ref().is_some_and(|p| p.handle.is_finished())
}
