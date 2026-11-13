use crate::ladder::Mode;
use servo_wire::Family;

pub const TICK_US: u64 = 20_000;
pub const READ_BUDGET_US: u64 = 18_000;
pub const WATCHDOG_US: u64 = 100_000;
pub const SOFT_START_TORQUE: f32 = 0.05;
pub const SOFT_START_TICKS: u32 = 50;
pub const FALL_TORQUE: f32 = 0.10;
pub const DISABLE_RETRIES: u32 = 5;
pub const MAX_LEAD_RAD: f32 = 0.25;
pub const BASE_FORWARD_STEP_M_S: f32 = 0.01;
pub const BASE_TURN_STEP_RAD_S: f32 = 0.04;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Caps {
    pub torque_fraction: f32,
    pub speed_rad_s: f32,
    pub step_rad: f32,
    pub stop_temp_c: f32,
    pub run_limit_s: Option<f32>,
    pub base_forward_m_s: f32,
    pub base_turn_rad_s: f32,
}

pub const FIRST_RUN: Caps = Caps {
    torque_fraction: 0.30,
    speed_rad_s: 0.5,
    step_rad: 0.02,
    stop_temp_c: 50.0,
    run_limit_s: Some(30.0),
    base_forward_m_s: 0.2,
    base_turn_rad_s: 1.0,
};

pub const POLICY: Caps = Caps {
    torque_fraction: 0.60,
    speed_rad_s: 2.0,
    step_rad: 0.05,
    stop_temp_c: 50.0,
    run_limit_s: Some(300.0),
    base_forward_m_s: 0.5,
    base_turn_rad_s: 2.0,
};

pub const LONGER_RUNS: Caps = Caps {
    run_limit_s: None,
    ..POLICY
};

pub fn caps_for(mode: Mode) -> Caps {
    match mode {
        Mode::Policy => POLICY,
        Mode::LongerRuns => LONGER_RUNS,
        _ => FIRST_RUN,
    }
}

pub fn step_per_tick(caps: &Caps) -> f32 {
    let tick_s = TICK_US as f32 * 1e-6;

    caps.step_rad.min(caps.speed_rad_s * tick_s)
}

pub fn voltage_window(family: Family) -> (f32, f32) {
    match family {
        Family::Feetech => (6.0, 8.4),
        Family::Dynamixel => (3.7, 6.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_run_caps_are_the_hard_coded_ones() {
        assert_eq!(FIRST_RUN.torque_fraction, 0.30);
        assert_eq!(FIRST_RUN.speed_rad_s, 0.5);
        assert_eq!(FIRST_RUN.step_rad, 0.02);
        assert_eq!(FIRST_RUN.stop_temp_c, 50.0);
        assert_eq!(WATCHDOG_US, 100_000);
        assert_eq!((FIRST_RUN.base_forward_m_s, FIRST_RUN.base_turn_rad_s), (0.2, 1.0));
        assert_eq!((POLICY.base_forward_m_s, POLICY.base_turn_rad_s), (0.5, 2.0));
        assert_eq!(LONGER_RUNS.base_forward_m_s, POLICY.base_forward_m_s);
    }

    #[test]
    fn every_mode_below_policy_uses_first_run_caps() {
        for mode in [Mode::Look, Mode::SetUp, Mode::Test, Mode::Rehearse, Mode::FirstRun] {
            assert_eq!(caps_for(mode), FIRST_RUN);
        }
    }

    #[test]
    fn speed_cap_limits_the_per_tick_step() {
        assert!((step_per_tick(&FIRST_RUN) - 0.01).abs() < 1e-6);
    }

    #[test]
    fn later_caps_never_drop_the_temperature_stop() {
        for caps in [FIRST_RUN, POLICY, LONGER_RUNS] {
            assert!(caps.stop_temp_c <= 50.0);
            assert!(caps.torque_fraction <= 0.6);
        }
    }
}
