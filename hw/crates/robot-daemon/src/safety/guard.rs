#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CountBounds {
    pub min: i32,
    pub max: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StepRule {
    pub step: i32,
    pub lead: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SafeGoal(i32);

impl SafeGoal {
    pub fn counts(self) -> i32 {
        self.0
    }
}

impl CountBounds {
    pub fn contains(self, counts: i32) -> bool {
        self.min <= counts && counts <= self.max
    }

    pub fn is_well_formed(self) -> bool {
        self.min <= self.max
    }
}

impl StepRule {
    pub fn is_well_formed(self) -> bool {
        self.step >= 0 && self.lead >= self.step
    }
}

pub fn hold_at(present: i32, bounds: CountBounds) -> Option<SafeGoal> {
    (bounds.is_well_formed() && bounds.contains(present)).then_some(SafeGoal(present))
}

pub fn next_goal(requested: i32, previous: SafeGoal, present: i32, bounds: CountBounds, rule: StepRule) -> SafeGoal {
    if !bounds.is_well_formed() || !rule.is_well_formed() || !bounds.contains(previous.0) {
        return previous;
    }

    let target = requested.clamp(bounds.min, bounds.max);
    let delta = (i64::from(target) - i64::from(previous.0)).clamp(-i64::from(rule.step), i64::from(rule.step));
    let next = (i64::from(previous.0) + delta).clamp(i64::from(bounds.min), i64::from(bounds.max));
    let lead_now = (next - i64::from(present)).abs();
    let lead_before = (i64::from(previous.0) - i64::from(present)).abs();

    if lead_now > i64::from(rule.lead) && lead_now > lead_before {
        return previous;
    }

    SafeGoal(i32::try_from(next).unwrap_or(previous.0))
}

pub fn next_speed(previous: f32, requested: f32, cap: f32, step: f32) -> f32 {
    let usable = [previous, requested, cap, step].iter().all(|value| value.is_finite()) && cap >= 0.0 && step >= 0.0;

    if !usable || previous.abs() > cap {
        return 0.0;
    }

    let target = requested.clamp(-cap, cap);

    (previous + (target - previous).clamp(-step, step)).clamp(-cap, cap)
}

pub fn torque_fraction_within(requested: f32, cap: f32) -> f32 {
    if !requested.is_finite() || !cap.is_finite() {
        return 0.0;
    }

    requested.clamp(0.0, cap.clamp(0.0, 1.0))
}

#[cfg(kani)]
mod proofs {
    use super::*;

    #[kani::proof]
    fn next_goal_stays_in_bounds_and_moves_at_most_one_step() {
        let bounds = CountBounds {
            min: kani::any(),
            max: kani::any(),
        };
        let rule = StepRule {
            step: kani::any(),
            lead: kani::any(),
        };
        let previous: i32 = kani::any();
        let requested: i32 = kani::any();
        let present: i32 = kani::any();

        kani::assume(bounds.is_well_formed() && rule.is_well_formed() && bounds.contains(previous));

        let next = next_goal(requested, SafeGoal(previous), present, bounds, rule).counts();

        assert!(bounds.contains(next));
        assert!((i64::from(next) - i64::from(previous)).abs() <= i64::from(rule.step));
    }

    #[kani::proof]
    fn malformed_rules_never_move_the_goal() {
        let bounds = CountBounds {
            min: kani::any(),
            max: kani::any(),
        };
        let rule = StepRule {
            step: kani::any(),
            lead: kani::any(),
        };
        let previous: i32 = kani::any();

        kani::assume(!bounds.is_well_formed() || !rule.is_well_formed() || !bounds.contains(previous));

        let next = next_goal(kani::any(), SafeGoal(previous), kani::any(), bounds, rule).counts();

        assert_eq!(next, previous);
    }

    #[kani::proof]
    fn torque_fraction_never_exceeds_its_cap() {
        let requested: f32 = kani::any();
        let cap: f32 = kani::any();
        let granted = torque_fraction_within(requested, cap);

        assert!(granted >= 0.0 && granted <= 1.0);
        assert!(!cap.is_finite() || granted <= cap.max(0.0));
    }

    #[kani::proof]
    fn hold_only_inside_bounds() {
        let bounds = CountBounds {
            min: kani::any(),
            max: kani::any(),
        };
        let present: i32 = kani::any();

        if let Some(goal) = hold_at(present, bounds) {
            assert!(bounds.contains(goal.counts()));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    const BOUNDS: CountBounds = CountBounds { min: 1000, max: 3000 };
    const RULE: StepRule = StepRule { step: 6, lead: 160 };

    #[test]
    fn moves_toward_the_request_one_step_at_a_time() {
        let start = hold_at(2000, BOUNDS).unwrap();

        assert_eq!(next_goal(2100, start, 2000, BOUNDS, RULE).counts(), 2006);
        assert_eq!(next_goal(1990, start, 2000, BOUNDS, RULE).counts(), 1994);
        assert_eq!(next_goal(2003, start, 2000, BOUNDS, RULE).counts(), 2003);
    }

    #[test]
    fn requests_past_a_limit_stop_at_the_limit() {
        let start = hold_at(2998, BOUNDS).unwrap();

        assert_eq!(next_goal(i32::MAX, start, 2998, BOUNDS, RULE).counts(), 3000);
    }

    #[test]
    fn does_not_run_away_from_a_lagging_joint() {
        let ahead = hold_at(2200, BOUNDS).unwrap();

        assert_eq!(next_goal(2500, ahead, 2000, BOUNDS, RULE).counts(), 2200);
        assert_eq!(next_goal(1500, ahead, 2000, BOUNDS, RULE).counts(), 2194);
    }

    #[test]
    fn may_lead_by_exactly_the_lead_but_no_further() {
        let at_edge = hold_at(2154, BOUNDS).unwrap();

        assert_eq!(next_goal(2500, at_edge, 2000, BOUNDS, RULE).counts(), 2160);
        assert_eq!(
            next_goal(2500, hold_at(2160, BOUNDS).unwrap(), 2000, BOUNDS, RULE).counts(),
            2160
        );
    }

    #[test]
    fn malformed_bounds_or_rules_never_move_a_goal() {
        let start = hold_at(2000, BOUNDS).unwrap();
        let inverted = CountBounds { min: 3000, max: 1000 };
        let negative_step = StepRule { step: -6, lead: 160 };
        let lead_below_step = StepRule { step: 6, lead: 5 };
        let outside = CountBounds { min: 2100, max: 3000 };

        assert_eq!(next_goal(2100, start, 2000, inverted, RULE), start);
        assert_eq!(next_goal(2100, start, 2000, BOUNDS, negative_step), start);
        assert_eq!(next_goal(2100, start, 2000, BOUNDS, lead_below_step), start);
        assert_eq!(next_goal(2500, start, 2000, outside, RULE), start);
        assert_eq!(hold_at(2000, inverted), None);
        assert!(RULE.is_well_formed() && !negative_step.is_well_formed() && !lead_below_step.is_well_formed());
        assert!(StepRule { step: 0, lead: 0 }.is_well_formed());
        assert!(!StepRule { step: -1, lead: -2 }.is_well_formed());
    }

    #[test]
    fn cannot_hold_outside_bounds() {
        assert_eq!(hold_at(999, BOUNDS), None);
        assert_eq!(hold_at(3001, BOUNDS), None);
    }

    #[test]
    fn speeds_ramp_toward_the_request_inside_the_cap() {
        assert_eq!(next_speed(0.0, 1.0, 0.2, 0.01), 0.01);
        assert_eq!(next_speed(0.195, 1.0, 0.2, 0.01), 0.2);
        assert_eq!(next_speed(0.0, -0.005, 0.2, 0.01), -0.005);
        assert_eq!(next_speed(0.1, f32::NAN, 0.2, 0.01), 0.0);
        assert_eq!(next_speed(0.5, 0.5, 0.2, 0.01), 0.0);
        assert_eq!(next_speed(0.1, 0.1, -1.0, 0.01), 0.0);
    }

    #[test]
    fn torque_requests_are_capped() {
        assert_eq!(torque_fraction_within(0.9, 0.3), 0.3);
        assert_eq!(torque_fraction_within(-1.0, 0.3), 0.0);
        assert_eq!(torque_fraction_within(f32::NAN, 0.3), 0.0);
        assert_eq!(torque_fraction_within(0.2, f32::INFINITY), 0.0);
    }

    proptest! {
        #[test]
        fn speeds_never_pass_the_cap_or_the_ramp(
            cap in 0.0f32..3.0,
            step in 0.0f32..0.1,
            requests in proptest::collection::vec(any::<f32>(), 1..100),
        ) {
            let mut speed = 0.0f32;

            for requested in requests {
                let next = next_speed(speed, requested, cap, step);

                prop_assert!(next.abs() <= cap);
                prop_assert!(next == 0.0 || (next - speed).abs() <= step * 1.0001);
                speed = next;
            }
        }

        #[test]
        fn never_leaves_bounds_or_exceeds_a_step(
            min in -5000i32..5000,
            span in 0i32..5000,
            step in 0i32..50,
            extra_lead in 0i32..500,
            start_offset in 0i32..5000,
            requests in proptest::collection::vec((any::<i32>(), any::<i32>()), 1..100),
        ) {
            let bounds = CountBounds { min, max: min + span };
            let rule = StepRule { step, lead: step + extra_lead };
            let mut goal = hold_at(min + start_offset % (span + 1), bounds).unwrap();

            for (requested, present) in requests {
                let next = next_goal(requested, goal, present, bounds, rule);

                prop_assert!(bounds.contains(next.counts()));
                prop_assert!((i64::from(next.counts()) - i64::from(goal.counts())).abs() <= i64::from(step));
                goal = next;
            }
        }
    }
}
