#[allow(dead_code)]
mod common;

use common::{contract_of, trace_of, ABOVE_ONE};
use contract::model::{MAX_DEPTH, MAX_NODES};
use contract::{check_json, evaluate_json, Contract};

const WHOLE: &str = r#""whole""#;
const LAST_ZERO: &str = r#"{"last":0}"#;

fn eventually(window: &str) -> String {
    format!(r#"{{"eventually":{{"window":{window},"state":{ABOVE_ONE}}}}}"#)
}

fn always(window: &str) -> String {
    format!(r#"{{"always":{{"window":{window},"state":{ABOVE_ONE}}}}}"#)
}

fn hold(within: &str) -> String {
    format!(r#"{{"hold_for":{{"seconds":0.1,"state":{ABOVE_ONE},"within":{within}}}}}"#)
}

fn refused(success: &str) -> bool {
    evaluate_json(&contract_of(success), &trace_of(&["2", "2", "2", "2"])).is_err()
}

fn nested(levels: usize) -> String {
    let mut text = always(WHOLE);

    for _ in 0..levels {
        text = format!(r#"{{"all":[{text}]}}"#);
    }

    text
}

#[test]
fn unknown_signals_are_refused() {
    let state = r#"{"atom":{"expr":{"signal":"y"},"cmp":">","value":0,"scale":1}}"#;
    let success = format!(r#"{{"eventually":{{"window":"whole","state":{state}}}}}"#);
    let failure = format!(
        r#"{{"version":1,"success":{},"failures":[{{"label":"l","formula":{success}}}]}}"#,
        always(WHOLE)
    );

    assert!(evaluate_json(&contract_of(&success), &trace_of(&["1", "1"])).is_err());
    assert!(evaluate_json(&failure, &trace_of(&["2", "2"])).is_err());
}

#[test]
fn final_state_only_success_is_refused_in_every_disguise() {
    let plain = [always(LAST_ZERO), eventually(LAST_ZERO), hold(LAST_ZERO)];
    let wrapped = [
        format!(r#"{{"all":[{}]}}"#, always(LAST_ZERO)),
        format!(r#"{{"any":[{},{}]}}"#, always(LAST_ZERO), always(WHOLE)),
        format!(
            r#"{{"sequence":[{},{}]}}"#,
            eventually(LAST_ZERO),
            always(LAST_ZERO)
        ),
    ];

    for success in plain.iter().chain(wrapped.iter()) {
        assert!(refused(success), "{success}");
    }
}

#[test]
fn a_window_that_only_covers_the_last_sample_is_refused() {
    let tiny = r#"{"last":0.001}"#;
    let tail = r#"{"from":0.3,"to":9}"#;

    for success in [
        always(tiny),
        eventually(tiny),
        hold(tiny),
        always(tail),
        eventually(tail),
    ] {
        assert!(refused(&success), "{success}");
    }
}

#[test]
fn a_real_success_with_a_final_check_alongside_it_is_allowed() {
    let both = format!(r#"{{"all":[{},{}]}}"#, always(LAST_ZERO), always(WHOLE));

    assert!(!refused(&both));
}

#[test]
fn a_failure_may_look_only_at_the_end() {
    let contract = format!(
        r#"{{"version":1,"success":{},"failures":[{{"label":"ended high","formula":{}}}]}}"#,
        always(WHOLE),
        always(LAST_ZERO)
    );
    let outcome = evaluate_json(&contract, &trace_of(&["2", "2"])).expect("accepted");

    assert_eq!(outcome.failed.len(), 1);
}

#[test]
fn depth_is_capped_exactly() {
    let leaf_levels = 3;

    assert!(Contract::from_json(&contract_of(&nested(MAX_DEPTH - leaf_levels))).is_ok());
    assert!(Contract::from_json(&contract_of(&nested(MAX_DEPTH - leaf_levels + 1))).is_err());
    assert!(Contract::from_json(&contract_of(&nested(5000))).is_err());
}

#[test]
fn nesting_in_a_state_or_expression_counts_too() {
    let mut state = String::from(ABOVE_ONE);

    for _ in 0..70 {
        state = format!(r#"{{"not":{state}}}"#);
    }

    let deep_state = format!(r#"{{"always":{{"window":"whole","state":{state}}}}}"#);

    assert!(Contract::from_json(&contract_of(&deep_state)).is_err());

    let mut expr = String::from(r#"{"signal":"x"}"#);

    for _ in 0..70 {
        expr = format!(r#"{{"abs":{expr}}}"#);
    }

    let atom = format!(r#"{{"atom":{{"expr":{expr},"cmp":">","value":0,"scale":1}}}}"#);
    let deep_expr = format!(r#"{{"always":{{"window":"whole","state":{atom}}}}}"#);

    assert!(Contract::from_json(&contract_of(&deep_expr)).is_err());
}

#[test]
fn node_count_is_capped_exactly() {
    let branch = always(WHOLE);
    let cost_per_branch = 3;
    let fits = (MAX_NODES - 1) / cost_per_branch;
    let list = |count: usize| vec![branch.clone(); count].join(",");
    let room = format!(r#"{{"all":[{}]}}"#, list(fits));
    let over = format!(r#"{{"all":[{}]}}"#, list(fits + 1));

    assert!(Contract::from_json(&contract_of(&room)).is_ok());
    assert!(Contract::from_json(&contract_of(&over)).is_err());
}

#[test]
fn non_finite_and_nonsense_atoms_are_refused() {
    let bad = [
        r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":1e999,"scale":1}}"#,
        r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":null,"scale":1}}"#,
        r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":1,"scale":0}}"#,
        r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":1,"scale":-1}}"#,
        r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":1,"scale":1e999}}"#,
        r#"{"atom":{"expr":{"signal":"x"},"cmp":"==","value":1,"scale":1}}"#,
        r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":1,"scale":1,"extra":1}}"#,
        r#"{"atom":{"expr":{"signal":"x"},"cmp":">","value":1}}"#,
    ];

    for atom in bad {
        assert!(
            refused(&format!(
                r#"{{"always":{{"window":"whole","state":{atom}}}}}"#
            )),
            "{atom}"
        );
    }
}

#[test]
fn non_finite_and_nonsense_windows_are_refused() {
    let bad = [
        r#"{"last":-1}"#,
        r#"{"last":1e999}"#,
        r#"{"from":2,"to":1}"#,
        r#"{"from":1,"to":1}"#,
        r#"{"from":-1,"to":1}"#,
        r#""part""#,
    ];

    for window in bad {
        assert!(refused(&always(window)), "{window}");
    }

    assert!(refused(&format!(
        r#"{{"hold_for":{{"seconds":0,"state":{ABOVE_ONE},"within":"whole"}}}}"#
    )));
    assert!(refused(&format!(
        r#"{{"hold_for":{{"seconds":1e999,"state":{ABOVE_ONE},"within":"whole"}}}}"#
    )));
}

#[test]
fn shape_errors_are_refused() {
    let both = format!(r#"{{"all":[{0}],"any":[{0}]}}"#, always(WHOLE));

    for success in [
        r#"{"all":[]}"#,
        r#"{"any":[]}"#,
        r#"{"sequence":[]}"#,
        r#"{"never":1}"#,
        both.as_str(),
    ] {
        assert!(refused(success), "{success}");
    }

    let future = format!(
        r#"{{"version":2,"success":{},"failures":[]}}"#,
        always(WHOLE)
    );

    assert!(Contract::from_json(&future).is_err());
    assert!(Contract::from_json("{").is_err());
    assert!(Contract::from_json(&"[".repeat(100_000)).is_err());
}

#[test]
fn trace_errors_are_refused() {
    let contract = contract_of(&always(WHOLE));
    let bad = [
        r#"{"dt":0,"signals":{"x":[1,1]}}"#,
        r#"{"dt":-1,"signals":{"x":[1,1]}}"#,
        r#"{"dt":null,"signals":{"x":[1,1]}}"#,
        r#"{"dt":1e999,"signals":{"x":[1,1]}}"#,
        r#"{"dt":0.1,"signals":{"x":[1]}}"#,
        r#"{"dt":0.1,"signals":{"x":[]}}"#,
        r#"{"dt":0.1,"signals":{}}"#,
        r#"{"dt":0.1,"signals":{"x":[1,1],"y":[1]}}"#,
        r#"{"dt":0.1,"signals":{"x":[1,"a"]}}"#,
    ];

    for trace in bad {
        assert!(evaluate_json(&contract, trace).is_err(), "{trace}");
    }
}

#[test]
fn check_lists_the_signals_a_contract_reads() {
    let state =
        r#"{"atom":{"expr":{"dist":[["a","b","c"],["d","e","x"]]},"cmp":">","value":0,"scale":1}}"#;
    let success = format!(r#"{{"always":{{"window":"whole","state":{{"not":{state}}}}}}}"#);

    assert_eq!(
        check_json(&contract_of(&success)).expect("accepted"),
        ["a", "b", "c", "d", "e", "x"]
    );
}
