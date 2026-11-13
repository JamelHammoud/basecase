#[allow(dead_code)]
mod common;

use common::{contract_of, false_pass_check, honest, trace_of, ABOVE_ONE};
use contract::series::angle_between;
use contract::{evaluate_json, Contract, Outcome, Trace};

fn run(success: &str, values: &[&str]) -> Outcome {
    evaluate_json(&contract_of(success), &trace_of(values)).expect("accepted")
}

fn eventually(state: &str) -> String {
    format!(r#"{{"eventually":{{"window":"whole","state":{state}}}}}"#)
}

fn always(state: &str) -> String {
    format!(r#"{{"always":{{"window":"whole","state":{state}}}}}"#)
}

fn atom(expr: &str, value: f64) -> String {
    format!(r#"{{"atom":{{"expr":{expr},"cmp":">","value":{value},"scale":1}}}}"#)
}

fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-12
}

#[test]
fn the_honest_evaluator_passes_the_false_pass_check() {
    assert_eq!(false_pass_check(honest), Ok(()));
}

#[test]
fn margins_are_signed_and_scaled() {
    let above = r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":1,"scale":2}}"#;
    let below = r#"{"atom":{"expr":{"signal":"x"},"cmp":"<","value":1,"scale":2}}"#;

    assert!(close(run(&eventually(above), &["0", "3"]).margin, 1.0));
    assert!(close(run(&eventually(below), &["3", "4"]).margin, -1.0));
}

#[test]
fn eventually_takes_the_best_and_always_the_worst() {
    let best = run(&eventually(ABOVE_ONE), &["0", "2", "0"]);
    let worst = run(&always(ABOVE_ONE), &["2", "2", "0.5", "2"]);

    assert!(best.passed && close(best.margin, 1.0) && close(best.worst_at, 0.1));
    assert!(!worst.passed && close(worst.margin, -0.5) && close(worst.worst_at, 0.2));
}

#[test]
fn a_margin_of_exactly_zero_does_not_pass() {
    assert!(!run(&always(ABOVE_ONE), &["1", "1"]).passed);
}

#[test]
fn hold_for_needs_the_whole_dwell_and_takes_the_best_placement() {
    let hold = format!(r#"{{"hold_for":{{"seconds":0.3,"state":{ABOVE_ONE},"within":"whole"}}}}"#);

    assert!(!run(&hold, &["2", "2", "0", "2", "2"]).passed);

    let held = run(&hold, &["2", "5", "4", "0", "2"]);

    assert!(held.passed);
    assert!(close(held.margin, 1.0));
}

#[test]
fn hold_for_matches_a_brute_force_scan() {
    let values: Vec<f64> = (0..400)
        .map(|i| ((i * 37 % 101) as f64 / 50.0 - 1.0) * (i as f64 * 0.11).sin())
        .collect();
    let text: Vec<String> = values.iter().map(|v| format!("{v:e}")).collect();
    let refs: Vec<&str> = text.iter().map(String::as_str).collect();

    for width in [1usize, 2, 3, 7, 40, 400] {
        let seconds = width as f64 * 0.1;
        let hold = format!(r#"{{"hold_for":{{"seconds":{seconds},"state":{ABOVE_ONE},"within":"whole"}}}}"#);
        let expected = values
            .windows(width)
            .map(|dwell| dwell.iter().fold(f64::INFINITY, |lo, v| lo.min(v - 1.0)))
            .fold(f64::NEG_INFINITY, f64::max);

        assert!(close(run(&hold, &refs).margin, expected), "width {width}");
    }
}

#[test]
fn a_window_too_short_for_the_dwell_fails_closed() {
    let hold = format!(r#"{{"hold_for":{{"seconds":5,"state":{ABOVE_ONE},"within":"whole"}}}}"#);
    let outcome = run(&hold, &["2", "2"]);

    assert!(!outcome.passed);
    assert_eq!(outcome.margin, f64::NEG_INFINITY);
}

#[test]
fn an_empty_window_fails_closed_for_always_too() {
    let late = format!(r#"{{"always":{{"window":{{"from":50,"to":60}},"state":{ABOVE_ONE}}}}}"#);

    assert_eq!(run(&late, &["2", "2"]).margin, f64::NEG_INFINITY);
}

#[test]
fn windows_select_the_right_ticks() {
    let between = format!(r#"{{"always":{{"window":{{"from":0.1,"to":0.2}},"state":{ABOVE_ONE}}}}}"#);
    let last = format!(r#"{{"always":{{"window":{{"last":0.1}},"state":{ABOVE_ONE}}}}}"#);

    assert!(run(&between, &["0", "2", "2", "0"]).passed);
    assert!(!run(&between, &["0", "0", "2", "0"]).passed);
    assert!(run(&last, &["0", "0", "2", "2"]).passed);
    assert!(!run(&last, &["0", "0", "0", "2"]).passed);
}

#[test]
fn sequence_steps_start_where_the_previous_first_held() {
    let high = r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":5,"scale":1}}"#;
    let low = format!(r#"{{"not":{ABOVE_ONE}}}"#);
    let steps = format!(r#"{{"sequence":[{},{}]}}"#, eventually(high), eventually(&low));

    assert!(run(&steps, &["0", "6", "0"]).passed);
    assert!(!run(&steps, &["0", "0", "6"]).passed);
}

#[test]
fn sequence_waits_for_the_whole_dwell_of_a_hold() {
    let hold = format!(r#"{{"hold_for":{{"seconds":0.3,"state":{ABOVE_ONE},"within":"whole"}}}}"#);
    let low = format!(r#"{{"not":{ABOVE_ONE}}}"#);
    let steps = format!(r#"{{"sequence":[{hold},{}]}}"#, eventually(&low));

    assert!(run(&steps, &["2", "2", "2", "0"]).passed);
    assert!(!run(&steps, &["0", "2", "2", "2"]).passed);
}

#[test]
fn sequence_can_share_a_tick_between_steps() {
    let steps = format!(r#"{{"sequence":[{0},{0}]}}"#, eventually(ABOVE_ONE));

    assert!(run(&steps, &["0", "2", "0"]).passed);
}

#[test]
fn not_never_turns_a_nan_into_a_pass() {
    let double = format!(r#"{{"not":{{"not":{ABOVE_ONE}}}}}"#);
    let single = format!(r#"{{"not":{ABOVE_ONE}}}"#);
    let any = format!(r#"{{"not":{{"any":[{ABOVE_ONE},{ABOVE_ONE}]}}}}"#);

    for state in [double, single, any] {
        let outcome = run(&always(&state), &["null", "null"]);

        assert_eq!(outcome.margin, f64::NEG_INFINITY);
        assert!(!outcome.passed);
    }
}

#[test]
fn de_morgan_holds() {
    let a = r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":1,"scale":1}}"#;
    let b = r#"{"atom":{"expr":{"signal":"x"},"cmp":"<","value":3,"scale":2}}"#;
    let not_all = format!(r#"{{"not":{{"all":[{a},{b}]}}}}"#);
    let any_not = format!(r#"{{"any":[{{"not":{a}}},{{"not":{b}}}]}}"#);
    let values = ["0", "0.5", "1.5", "2", "4", "9"];

    assert!(close(
        run(&always(&not_all), &values).margin,
        run(&always(&any_not), &values).margin
    ));
}

#[test]
fn a_nan_in_a_failure_signal_fires_that_failure() {
    let contract = format!(
        r#"{{"version":1,"success":{},"failures":[{{"label":"bad","formula":{}}}]}}"#,
        eventually(ABOVE_ONE),
        eventually(r#"{"atom":{"expr":{"signal":"y"},"cmp":">","value":5,"scale":1}}"#)
    );
    let trace = r#"{"dt":0.1,"signals":{"x":[2,2],"y":[0,null]}}"#;
    let outcome = evaluate_json(&contract, trace).expect("accepted");

    assert!(!outcome.passed);
    assert_eq!(outcome.failed, vec![String::from("bad")]);
}

#[test]
fn failures_report_their_labels_and_block_a_pass() {
    let contract = format!(
        r#"{{"version":1,"success":{},"failures":[{{"label":"dropped \"it\"","formula":{}}},{{"label":"fine","formula":{}}}]}}"#,
        eventually(ABOVE_ONE),
        eventually(r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":5,"scale":1}}"#),
        eventually(r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":50,"scale":1}}"#),
    );
    let outcome = evaluate_json(&contract, &trace_of(&["2", "6"])).expect("accepted");

    assert!(!outcome.passed);
    assert_eq!(outcome.failed, vec![String::from("dropped \"it\"")]);
    assert!(outcome.to_json().contains(r#""failed":["dropped \"it\""]"#));
}

#[test]
fn abs_and_delta_compute() {
    let abs = atom(r#"{"abs":{"signal":"x"}}"#, 1.0);
    let delta = atom(r#"{"delta":{"signal":"x"}}"#, 1.0);

    assert!(close(run(&always(&abs), &["-3", "-3"]).margin, 2.0));
    assert!(close(run(&eventually(&delta), &["10", "13"]).margin, 2.0));
    assert!(!run(&eventually(&delta), &["10", "10.5"]).passed);
}

#[test]
fn dist_and_angle_compute() {
    let dist = atom(r#"{"dist":[["a","b","c"],["d","e","f"]]}"#, 0.0);
    let angle = atom(r#"{"angle":[["a","b","c"],["d","e","f"]]}"#, 0.0);
    let trace = r#"{"dt":0.1,"signals":{"a":[3,3],"b":[0,0],"c":[0,0],"d":[0,0],"e":[4,4],"f":[0,0]}}"#;
    let margin = |state: &str| {
        evaluate_json(&contract_of(&always(state)), trace)
            .expect("accepted")
            .margin
    };

    assert!(close(margin(&dist), 5.0));
    assert!(close(margin(&angle), std::f64::consts::FRAC_PI_2));
}

#[test]
fn the_angle_agrees_with_atan2() {
    for i in 0..2000 {
        let turn = i as f64 / 2000.0 * std::f64::consts::PI;
        let (sine, cosine) = (turn.sin().abs(), turn.cos());

        assert!(
            (angle_between(sine, cosine) - sine.atan2(cosine)).abs() < 1e-12,
            "{turn}"
        );
    }
}

#[test]
fn a_zero_vector_has_no_angle() {
    assert!(angle_between(0.0, 0.0).is_nan());
}

#[test]
fn cost_is_linear_in_trace_length() {
    let state = r#"{"atom":{"expr":{"abs":{"delta":{"signal":"x"}}},"cmp":"<","value":10,"scale":1}}"#;
    let hold = format!(r#"{{"hold_for":{{"seconds":1000,"state":{state},"within":"whole"}}}}"#);
    let contract = Contract::from_json(&contract_of(&hold)).expect("accepted");
    let ticks = 2_000_000;
    let signals = [(String::from("x"), vec![0.0; ticks])].into_iter().collect();
    let trace = Trace::new(0.01, signals).expect("accepted");
    let started = std::time::Instant::now();
    let outcome = contract::evaluate(&contract, &trace).expect("accepted");

    assert!(outcome.passed);
    assert!(started.elapsed().as_secs_f64() < 5.0);
}
