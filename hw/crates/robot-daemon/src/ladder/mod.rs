pub mod table;

use crate::safety::ArmGrant;
use sha2::{Digest, Sha256};
pub use table::{Change, Event, Fact, Mode, Outcome, Refusal, State, MODES};

pub type Hash = [u8; 32];

pub fn digest(bytes: &[u8]) -> Hash {
    Sha256::digest(bytes).into()
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Artefacts {
    pub calibration: Option<Hash>,
    pub policy: Option<Hash>,
    pub firmware: Option<Hash>,
}

pub struct Ladder {
    state: State,
    seen: Artefacts,
}

impl Ladder {
    pub fn new() -> Self {
        Self {
            state: State::default(),
            seen: Artefacts::default(),
        }
    }

    pub fn mode(&self) -> Mode {
        self.state.mode
    }

    pub fn state(&self) -> State {
        self.state
    }

    pub fn fault_latched(&self) -> bool {
        self.state.fault_latched
    }

    pub fn apply(&mut self, event: Event) -> Outcome {
        let (next, outcome) = table::transition(self.state, event);

        self.state = next;

        outcome
    }

    pub fn observe(&mut self, current: Artefacts) -> Vec<Change> {
        let changes = [
            (self.seen.calibration != current.calibration, Change::Calibration),
            (self.seen.policy != current.policy, Change::Policy),
            (self.seen.firmware != current.firmware, Change::Firmware),
        ];
        let mut happened = Vec::new();

        for (differs, change) in changes {
            if differs {
                self.apply(Event::Changed(change));
                happened.push(change);
            }
        }

        self.seen = current;
        self.apply(Event::Learned(Fact::CalibrationPresent, current.calibration.is_some()));
        self.apply(Event::Learned(Fact::PolicyPresent, current.policy.is_some()));
        self.apply(Event::Learned(Fact::FirmwareKnown, current.firmware.is_some()));

        happened
    }

    pub fn enter(&mut self, target: Mode, current: Artefacts) -> Result<Option<ArmGrant>, Refusal> {
        self.observe(current);

        match self.apply(Event::Enter(target)) {
            Outcome::Done if target == Mode::Look => Ok(None),
            Outcome::Done => Ok(Some(ArmGrant::issue())),
            Outcome::Refused(refusal) => Err(refusal),
        }
    }
}

impl Default for Ladder {
    fn default() -> Self {
        Self::new()
    }
}

pub fn refusal_message(refusal: &Refusal) -> String {
    match refusal {
        Refusal::FaultLatched => "A fault is still active. Go back to Look and clear it first.".into(),
        Refusal::SkipsARung => "Climb the ladder one step at a time.".into(),
        Refusal::Missing(fact) => missing_message(*fact).into(),
        Refusal::NotInThatMode => "That step isn't running.".into(),
        Refusal::LookOnly => "Faults can only be cleared from Look.".into(),
    }
}

fn missing_message(fact: Fact) -> &'static str {
    match fact {
        Fact::BusChecked => "Check the servos first: every servo must answer with the right model.",
        Fact::CalibrationPresent => "Calibrate the robot first.",
        Fact::FirmwareKnown => "Read the servos' firmware first.",
        Fact::PolicyPresent => "Load a policy first.",
        Fact::Tested => "Test every joint with the current calibration first.",
        Fact::Rehearsed => "Rehearse the current policy first.",
        Fact::FirstRunDone => "Finish a first run with the current policy first.",
        Fact::PolicyRunDone => "Finish a policy run with the current policy first.",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn artefacts() -> Artefacts {
        Artefacts {
            calibration: Some(digest(b"cal")),
            policy: Some(digest(b"policy")),
            firmware: Some(digest(b"fw")),
        }
    }

    fn climb_to(ladder: &mut Ladder, target: Mode) {
        ladder.apply(Event::Learned(Fact::BusChecked, true));

        for mode in &MODES[1..=table::rung(target)] {
            ladder.enter(*mode, artefacts()).unwrap();
            ladder.apply(Event::Completed(*mode));
        }
    }

    #[test]
    fn climbs_one_rung_at_a_time_with_evidence() {
        let mut ladder = Ladder::new();

        ladder.apply(Event::Learned(Fact::BusChecked, true));
        assert_eq!(ladder.enter(Mode::Test, artefacts()).err(), Some(Refusal::SkipsARung));
        climb_to(&mut ladder, Mode::LongerRuns);
        assert_eq!(ladder.mode(), Mode::LongerRuns);
    }

    #[test]
    fn a_new_policy_returns_to_first_run() {
        let mut ladder = Ladder::new();

        climb_to(&mut ladder, Mode::Policy);

        let mut changed = artefacts();

        changed.policy = Some(digest(b"policy v2"));
        ladder.observe(changed);
        assert_eq!(ladder.mode(), Mode::FirstRun);
        assert!(!ladder.state().has(Fact::FirstRunDone));
    }

    #[test]
    fn faults_block_climbing_until_cleared_in_look() {
        let mut ladder = Ladder::new();

        climb_to(&mut ladder, Mode::Test);
        ladder.apply(Event::Fault);
        assert_eq!(
            ladder.enter(Mode::Rehearse, artefacts()).err(),
            Some(Refusal::FaultLatched)
        );
        assert_eq!(ladder.apply(Event::ClearFault), Outcome::Refused(Refusal::LookOnly));
        ladder.enter(Mode::Look, artefacts()).unwrap();
        assert_eq!(ladder.apply(Event::ClearFault), Outcome::Done);
    }

    #[test]
    fn entering_look_never_issues_a_write_grant() {
        let mut ladder = Ladder::new();

        assert!(ladder.enter(Mode::Look, artefacts()).unwrap().is_none());
    }
}
