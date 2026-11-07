use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    #[default]
    Look,
    SetUp,
    Test,
    Rehearse,
    FirstRun,
    Policy,
    LongerRuns,
}

pub const MODES: [Mode; 7] = [
    Mode::Look,
    Mode::SetUp,
    Mode::Test,
    Mode::Rehearse,
    Mode::FirstRun,
    Mode::Policy,
    Mode::LongerRuns,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Fact {
    BusChecked,
    CalibrationPresent,
    FirmwareKnown,
    PolicyPresent,
    Tested,
    Rehearsed,
    FirstRunDone,
    PolicyRunDone,
}

pub const FACTS: [Fact; 8] = [
    Fact::BusChecked,
    Fact::CalibrationPresent,
    Fact::FirmwareKnown,
    Fact::PolicyPresent,
    Fact::Tested,
    Fact::Rehearsed,
    Fact::FirstRunDone,
    Fact::PolicyRunDone,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Change {
    Calibration,
    Policy,
    Firmware,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Event {
    Enter(Mode),
    Learned(Fact, bool),
    Changed(Change),
    Completed(Mode),
    Fault,
    ClearFault,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct State {
    pub mode: Mode,
    pub facts: u16,
    pub fault_latched: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Done,
    Refused(Refusal),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Refusal {
    FaultLatched,
    SkipsARung,
    Missing(Fact),
    NotInThatMode,
    LookOnly,
    EarnedOnly,
}

pub fn bit(fact: Fact) -> u16 {
    1 << FACTS.iter().position(|candidate| *candidate == fact).unwrap_or(15)
}

pub fn requires(mode: Mode) -> &'static [Fact] {
    match mode {
        Mode::Look => &[],
        Mode::SetUp => &[Fact::BusChecked],
        Mode::Test => &[Fact::BusChecked, Fact::CalibrationPresent, Fact::FirmwareKnown],
        Mode::Rehearse => &[
            Fact::BusChecked,
            Fact::CalibrationPresent,
            Fact::FirmwareKnown,
            Fact::Tested,
            Fact::PolicyPresent,
        ],
        Mode::FirstRun => &[
            Fact::BusChecked,
            Fact::CalibrationPresent,
            Fact::FirmwareKnown,
            Fact::Tested,
            Fact::PolicyPresent,
            Fact::Rehearsed,
        ],
        Mode::Policy => &[
            Fact::BusChecked,
            Fact::CalibrationPresent,
            Fact::FirmwareKnown,
            Fact::Tested,
            Fact::PolicyPresent,
            Fact::Rehearsed,
            Fact::FirstRunDone,
        ],
        Mode::LongerRuns => &[
            Fact::BusChecked,
            Fact::CalibrationPresent,
            Fact::FirmwareKnown,
            Fact::Tested,
            Fact::PolicyPresent,
            Fact::Rehearsed,
            Fact::FirstRunDone,
            Fact::PolicyRunDone,
        ],
    }
}

pub fn clears(change: Change) -> &'static [Fact] {
    match change {
        Change::Calibration | Change::Firmware => {
            &[Fact::Tested, Fact::Rehearsed, Fact::FirstRunDone, Fact::PolicyRunDone]
        }
        Change::Policy => &[Fact::Rehearsed, Fact::FirstRunDone, Fact::PolicyRunDone],
    }
}

pub fn is_observed(fact: Fact) -> bool {
    matches!(
        fact,
        Fact::BusChecked | Fact::CalibrationPresent | Fact::FirmwareKnown | Fact::PolicyPresent
    )
}

pub fn earns(mode: Mode) -> Option<Fact> {
    match mode {
        Mode::Test => Some(Fact::Tested),
        Mode::Rehearse => Some(Fact::Rehearsed),
        Mode::FirstRun => Some(Fact::FirstRunDone),
        Mode::Policy => Some(Fact::PolicyRunDone),
        _ => None,
    }
}

pub fn rung(mode: Mode) -> usize {
    MODES.iter().position(|candidate| *candidate == mode).unwrap_or(0)
}

impl State {
    pub fn has(&self, fact: Fact) -> bool {
        self.facts & bit(fact) != 0
    }

    fn with(mut self, fact: Fact, value: bool) -> Self {
        if value {
            self.facts |= bit(fact);
        } else {
            self.facts &= !bit(fact);
        }

        self
    }
}

pub fn transition(state: State, event: Event) -> (State, Outcome) {
    match event {
        Event::Enter(target) => enter(state, target),
        Event::Learned(fact, value) if is_observed(fact) => (state.with(fact, value), Outcome::Done),
        Event::Learned(..) => (state, Outcome::Refused(Refusal::EarnedOnly)),
        Event::Changed(change) => changed(state, change),
        Event::Completed(mode) => completed(state, mode),
        Event::Fault => (
            State {
                fault_latched: true,
                ..state
            },
            Outcome::Done,
        ),
        Event::ClearFault if state.mode == Mode::Look => (
            State {
                fault_latched: false,
                ..state
            },
            Outcome::Done,
        ),
        Event::ClearFault => (state, Outcome::Refused(Refusal::LookOnly)),
    }
}

fn enter(state: State, target: Mode) -> (State, Outcome) {
    if target == Mode::Look {
        return (
            State {
                mode: Mode::Look,
                ..state
            },
            Outcome::Done,
        );
    }

    if state.fault_latched {
        return (state, Outcome::Refused(Refusal::FaultLatched));
    }

    if rung(target) > rung(state.mode) + 1 || rung(target) < rung(state.mode) {
        return (state, Outcome::Refused(Refusal::SkipsARung));
    }

    if let Some(missing) = requires(target).iter().find(|fact| !state.has(**fact)) {
        return (state, Outcome::Refused(Refusal::Missing(*missing)));
    }

    (State { mode: target, ..state }, Outcome::Done)
}

fn changed(state: State, change: Change) -> (State, Outcome) {
    let cleared = clears(change).iter().fold(state, |next, fact| next.with(*fact, false));
    let mode = if rung(state.mode) > rung(Mode::FirstRun) {
        Mode::FirstRun
    } else {
        state.mode
    };

    (State { mode, ..cleared }, Outcome::Done)
}

fn completed(state: State, mode: Mode) -> (State, Outcome) {
    if state.mode != mode || state.fault_latched {
        return (state, Outcome::Refused(Refusal::NotInThatMode));
    }

    match earns(mode) {
        Some(fact) => (state.with(fact, true), Outcome::Done),
        None => (state, Outcome::Done),
    }
}
