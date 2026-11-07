pub mod eval;
pub mod json;
pub mod model;
pub mod series;
pub mod trace;

#[cfg(target_arch = "wasm32")]
mod wasm;

pub use eval::{evaluate, Outcome};
pub use model::Contract;
pub use trace::Trace;

pub fn evaluate_json(contract: &str, trace: &str) -> Result<Outcome, String> {
    let contract = Contract::from_json(contract)?;
    let trace = Trace::from_json(trace)?;

    evaluate(&contract, &trace)
}

pub fn check_json(contract: &str) -> Result<Vec<String>, String> {
    Ok(Contract::from_json(contract)?.signals())
}

pub fn evaluate_reply(contract: &str, trace: &str) -> String {
    match evaluate_json(contract, trace) {
        Ok(outcome) => outcome.to_json(),
        Err(message) => error_reply(&message),
    }
}

pub fn check_reply(contract: &str) -> String {
    match check_json(contract) {
        Ok(signals) => signals_reply(&signals),
        Err(message) => error_reply(&message),
    }
}

fn error_reply(message: &str) -> String {
    let mut out = String::from("{\"error\":");

    json::write_string(&mut out, message);
    out.push('}');
    out
}

fn signals_reply(signals: &[String]) -> String {
    let mut out = String::from("{\"signals\":[");

    for (i, name) in signals.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }

        json::write_string(&mut out, name);
    }

    out.push_str("]}");
    out
}
