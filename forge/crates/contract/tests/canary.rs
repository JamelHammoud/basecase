#[allow(dead_code)]
mod common;

use common::{false_pass_check, honest};
use contract::Outcome;

const CANARY_NAME: &str = "canary_planted_false_pass_fails";

fn planted_evaluator(contract: &str, trace: &str) -> Result<Outcome, String> {
    let outcome = honest(contract, trace)?;

    Ok(Outcome {
        passed: true,
        margin: outcome.margin.abs().max(1.0),
        ..outcome
    })
}

fn asked_for_by_name() -> bool {
    std::env::args().skip(1).any(|arg| arg == CANARY_NAME)
}

#[test]
fn canary_planted_false_pass_fails() {
    let caught = false_pass_check(planted_evaluator).is_err();

    if asked_for_by_name() {
        assert!(
            !caught,
            "The false-pass check caught the planted evaluator, so the canary fires"
        );
    } else {
        assert!(
            caught,
            "The false-pass check let the planted evaluator through"
        );
    }
}
