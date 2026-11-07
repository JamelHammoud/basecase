use robot_daemon::ladder::table::{
    clears, earns, is_observed, requires, rung, transition, Change, Event, Fact, Mode, Outcome, State, FACTS, MODES,
};
use std::collections::{BTreeSet, HashSet, VecDeque};

const SPEC: &str = include_str!("../../../spec/ladder.tla");
const CHANGES: [Change; 3] = [Change::Calibration, Change::Policy, Change::Firmware];

fn mode_name(mode: Mode) -> String {
    serde_json::to_string(&mode).unwrap().trim_matches('"').to_string()
}

fn fact_name(fact: Fact) -> &'static str {
    match fact {
        Fact::BusChecked => "bus_checked",
        Fact::CalibrationPresent => "calibration_present",
        Fact::FirmwareKnown => "firmware_known",
        Fact::PolicyPresent => "policy_present",
        Fact::Tested => "tested",
        Fact::Rehearsed => "rehearsed",
        Fact::FirstRunDone => "first_run_done",
        Fact::PolicyRunDone => "policy_run_done",
    }
}

fn change_name(change: Change) -> &'static str {
    match change {
        Change::Calibration => "calibration",
        Change::Policy => "policy",
        Change::Firmware => "firmware",
    }
}

fn names(facts: &[Fact]) -> BTreeSet<String> {
    facts.iter().map(|fact| fact_name(*fact).to_string()).collect()
}

fn spec_table(operator: &str, variable: &str, key: &str) -> BTreeSet<String> {
    let start = SPEC
        .find(&format!("{operator}({variable}) =="))
        .unwrap_or_else(|| panic!("{operator} missing from the spec"));
    let block = &SPEC[start..];
    let block = &block[..block.find("\n\n").unwrap_or(block.len())];
    let needle = format!("{variable} = \"{key}\" ->");
    let Some(line) = block.lines().find(|line| line.contains(&needle)) else {
        return BTreeSet::new();
    };
    let set = &line[line.find('{').unwrap() + 1..line.rfind('}').unwrap()];

    set.split(',')
        .map(|name| name.trim().trim_matches('"').to_string())
        .filter(|name| !name.is_empty())
        .collect()
}

fn spec_set(name: &str) -> BTreeSet<String> {
    let line = SPEC
        .lines()
        .find(|line| line.starts_with(&format!("{name} ==")))
        .unwrap_or_else(|| panic!("{name} missing from the spec"));
    let set = &line[line.find('{').unwrap() + 1..line.rfind('}').unwrap()];

    set.split(',')
        .map(|name| name.trim().trim_matches('"').to_string())
        .collect()
}

#[test]
fn only_observed_facts_can_be_learned_as_in_the_spec() {
    let observed: Vec<Fact> = FACTS.into_iter().filter(|fact| is_observed(*fact)).collect();
    let earned: Vec<Fact> = FACTS.into_iter().filter(|fact| !is_observed(*fact)).collect();

    assert_eq!(names(&observed), spec_set("Observed"));
    assert_eq!(names(&earned), spec_set("Earned"));

    for fact in earned {
        let (after, outcome) = transition(State::default(), Event::Learned(fact, true));

        assert!(matches!(outcome, Outcome::Refused(_)));
        assert_eq!(after, State::default());
    }
}

#[test]
fn the_rust_table_matches_the_tla_spec() {
    for mode in MODES {
        assert_eq!(
            names(requires(mode)),
            spec_table("Requires", "m", &mode_name(mode)),
            "{mode:?}"
        );
        assert_eq!(
            names(&earns(mode).into_iter().collect::<Vec<_>>()),
            spec_table("Earns", "m", &mode_name(mode)),
            "{mode:?}"
        );
    }

    for change in CHANGES {
        assert_eq!(names(clears(change)), spec_table("Clears", "c", change_name(change)));
    }
}

fn all_events() -> Vec<Event> {
    let mut events = vec![Event::Fault, Event::ClearFault];

    for mode in MODES {
        events.push(Event::Enter(mode));
        events.push(Event::Completed(mode));
    }

    for fact in FACTS {
        events.push(Event::Learned(fact, true));
        events.push(Event::Learned(fact, false));
    }

    events.extend(CHANGES.map(Event::Changed));

    events
}

fn check_state(state: &State) {
    if rung(state.mode) > rung(Mode::FirstRun) {
        assert!(
            state.has(Fact::FirstRunDone),
            "above first run without first-run evidence: {state:?}"
        );
    }

    if state.mode == Mode::LongerRuns {
        assert!(state.has(Fact::PolicyRunDone), "{state:?}");
    }
}

fn check_step(before: &State, event: Event, after: &State, outcome: &Outcome) {
    if rung(after.mode) > rung(before.mode) {
        assert_eq!(
            rung(after.mode),
            rung(before.mode) + 1,
            "skipped a rung: {before:?} {event:?}"
        );
        assert!(
            !before.fault_latched,
            "climbed while a fault was latched: {before:?} {event:?}"
        );
        assert!(
            requires(after.mode).iter().all(|fact| before.has(*fact)),
            "climbed without evidence: {before:?} {event:?}"
        );
    }

    if before.fault_latched && !after.fault_latched {
        assert_eq!(before.mode, Mode::Look, "cleared a fault outside Look: {before:?}");
    }

    if let Event::Changed(_) = event {
        assert!(
            rung(after.mode) <= rung(Mode::FirstRun),
            "a change must drop to first run: {after:?}"
        );
    }

    if matches!(outcome, Outcome::Refused(_)) {
        assert_eq!(before, after, "a refused event changed state: {event:?}");
    }

    let (to_look, look_outcome) = transition(*before, Event::Enter(Mode::Look));

    assert_eq!(to_look.mode, Mode::Look);
    assert_eq!(look_outcome, Outcome::Done);
}

#[test]
fn every_reachable_state_keeps_the_ladder_invariants() {
    let start = State::default();
    let mut seen = HashSet::from([start]);
    let mut queue = VecDeque::from([start]);
    let events = all_events();
    let mut transitions = 0usize;

    while let Some(state) = queue.pop_front() {
        check_state(&state);

        for event in &events {
            let (next, outcome) = transition(state, *event);

            check_step(&state, *event, &next, &outcome);
            transitions += 1;

            if seen.insert(next) {
                queue.push_back(next);
            }
        }
    }

    let possible = MODES.len() * (1 << FACTS.len()) * 2;

    println!(
        "explored {} of {possible} states, {transitions} transitions",
        seen.len()
    );
    assert!(seen.len() > 1000, "the search should reach most of the state space");
    assert!(seen.iter().any(|state| state.mode == Mode::LongerRuns));
}

#[test]
fn a_trace_of_the_daemon_replays_in_the_model() {
    let trace = [
        Event::Learned(Fact::BusChecked, true),
        Event::Enter(Mode::SetUp),
        Event::Learned(Fact::CalibrationPresent, true),
        Event::Learned(Fact::FirmwareKnown, true),
        Event::Learned(Fact::PolicyPresent, true),
        Event::Enter(Mode::Test),
        Event::Completed(Mode::Test),
        Event::Enter(Mode::Rehearse),
        Event::Completed(Mode::Rehearse),
        Event::Enter(Mode::FirstRun),
        Event::Completed(Mode::FirstRun),
        Event::Enter(Mode::Policy),
        Event::Changed(Change::Policy),
        Event::Fault,
        Event::Enter(Mode::Rehearse),
        Event::Enter(Mode::Look),
        Event::ClearFault,
    ];
    let mut state = State::default();
    let mut modes = Vec::new();

    for event in trace {
        let (next, _) = transition(state, event);

        check_step(&state, event, &next, &Outcome::Done);
        state = next;
        modes.push(state.mode);
    }

    assert_eq!(modes[11], Mode::Policy);
    assert_eq!(modes[12], Mode::FirstRun);
    assert_eq!(modes[14], Mode::FirstRun, "a latched fault refuses every climb");
    assert_eq!(state.mode, Mode::Look);
    assert!(!state.fault_latched);
}
