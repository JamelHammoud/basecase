use contract::{evaluate_json, Outcome};

pub type Evaluator = fn(&str, &str) -> Result<Outcome, String>;

pub const ABOVE_ONE: &str = r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":1,"scale":1}}"#;

pub fn trace_of(values: &[&str]) -> String {
    format!(r#"{{"dt":0.1,"signals":{{"x":[{}]}}}}"#, values.join(","))
}

pub fn contract_of(success: &str) -> String {
    format!(r#"{{"version":1,"success":{success},"failures":[]}}"#)
}

fn false_cases() -> Vec<(String, String)> {
    let always = format!(r#"{{"always":{{"window":"whole","state":{ABOVE_ONE}}}}}"#);
    let eventually = format!(r#"{{"eventually":{{"window":"whole","state":{ABOVE_ONE}}}}}"#);
    let hold = format!(r#"{{"hold_for":{{"seconds":0.3,"state":{ABOVE_ONE},"within":"whole"}}}}"#);
    let release = format!(r#"{{"eventually":{{"window":"whole","state":{{"not":{ABOVE_ONE}}}}}}}"#);
    let sequence = format!(r#"{{"sequence":[{eventually},{release}]}}"#);
    let negated = format!(r#"{{"always":{{"window":"whole","state":{{"not":{ABOVE_ONE}}}}}}}"#);

    vec![
        (contract_of(&always), trace_of(&["2", "2", "0", "2"])),
        (contract_of(&eventually), trace_of(&["0", "0.5", "1"])),
        (contract_of(&hold), trace_of(&["2", "2", "0", "2", "2"])),
        (contract_of(&sequence), trace_of(&["0", "0", "2"])),
        (contract_of(&always), trace_of(&["2", "null"])),
        (contract_of(&negated), trace_of(&["0", "null"])),
    ]
}

pub fn false_pass_check(evaluator: Evaluator) -> Result<(), String> {
    for (contract, trace) in false_cases() {
        let outcome = evaluator(&contract, &trace)?;

        if outcome.passed || outcome.margin > 0.0 {
            return Err(format!("False pass on {contract} over {trace}"));
        }
    }

    Ok(())
}

pub fn honest(contract: &str, trace: &str) -> Result<Outcome, String> {
    evaluate_json(contract, trace)
}
