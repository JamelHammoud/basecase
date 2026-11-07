use crate::calibration::JointCalibration;
use crate::fault::Fault;
use crate::telemetry::{Sample, Telemetry};
use std::collections::VecDeque;

pub const COMM_TICKS: u32 = 3;
pub const LATE_TICKS: u32 = 3;
pub const VOLTAGE_TICKS: u32 = 3;
pub const STALL_TICKS: u32 = 15;
pub const STALL_ERROR_COUNTS: i32 = 40;
pub const STALL_MOTION_COUNTS: i32 = 3;
pub const DIRECTION_WINDOW: usize = 6;
pub const DIRECTION_AWAY_COUNTS: i32 = 12;

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub stop_temp_c: f32,
    pub volts_min: f32,
    pub volts_max: f32,
}

pub struct Expectation<'a> {
    pub torque_on: bool,
    pub goals: &'a [Option<i32>],
    pub late_bytes: usize,
}

#[derive(Default, Clone)]
struct JointWatch {
    bad_ticks: u32,
    voltage_ticks: u32,
    stall_ticks: u32,
    history: VecDeque<(i32, i32)>,
}

pub struct Monitor {
    joints: Vec<JointCalibration>,
    watches: Vec<JointWatch>,
    late_ticks: u32,
    limits: Limits,
}

impl Monitor {
    pub fn new(joints: Vec<JointCalibration>, limits: Limits) -> Self {
        let watches = vec![JointWatch::default(); joints.len()];

        Self {
            joints,
            watches,
            late_ticks: 0,
            limits,
        }
    }

    pub fn set_limits(&mut self, limits: Limits) {
        self.limits = limits;
    }

    pub fn reset_motion(&mut self) {
        for watch in &mut self.watches {
            watch.stall_ticks = 0;
            watch.history.clear();
        }
    }

    pub fn observe(&mut self, samples: &[Sample], expect: &Expectation) -> Option<Fault> {
        let comm = self.check_comm(samples, expect.late_bytes);
        let mut found = comm;

        for (index, sample) in samples.iter().enumerate().take(self.joints.len()) {
            let Some(telemetry) = sample.telemetry() else {
                continue;
            };
            let goal = expect.goals.get(index).copied().flatten();
            let fault = self.check_joint(index, &telemetry, goal, expect.torque_on);

            found = found.or(fault);
        }

        found
    }

    fn check_comm(&mut self, samples: &[Sample], late_bytes: usize) -> Option<Fault> {
        self.late_ticks = if late_bytes > 0 { self.late_ticks + 1 } else { 0 };

        let mut found = None;
        let mut all_missing = !samples.is_empty();

        for (index, sample) in samples.iter().enumerate().take(self.joints.len()) {
            let watch = &mut self.watches[index];
            let good = matches!(sample, Sample::Good(_));

            watch.bad_ticks = if good { 0 } else { watch.bad_ticks + 1 };
            all_missing &= matches!(sample, Sample::Missing) && watch.bad_ticks >= COMM_TICKS;

            if watch.bad_ticks >= COMM_TICKS && found.is_none() {
                found = Some(comm_fault(self.joints[index].id, sample, self.late_ticks > 0));
            }
        }

        if self.late_ticks >= LATE_TICKS || (all_missing && self.late_ticks > 0) {
            return Some(Fault::RepliesLate);
        }

        if all_missing {
            return Some(Fault::BusSilent);
        }

        found
    }

    fn check_joint(
        &mut self,
        index: usize,
        telemetry: &Telemetry,
        goal: Option<i32>,
        torque_on: bool,
    ) -> Option<Fault> {
        let id = telemetry.id;
        let limits = self.limits;
        let watch = &mut self.watches[index];
        let volts_bad = telemetry.volts < limits.volts_min || telemetry.volts > limits.volts_max;

        watch.voltage_ticks = if volts_bad { watch.voltage_ticks + 1 } else { 0 };

        if telemetry.temp_c >= limits.stop_temp_c {
            return Some(Fault::Overheat {
                id,
                temp_c: telemetry.temp_c,
            });
        }

        if watch.voltage_ticks >= VOLTAGE_TICKS {
            return Some(Fault::Voltage {
                id,
                volts: telemetry.volts,
            });
        }

        if torque_on {
            return self.check_running(index, telemetry, goal);
        }

        None
    }

    fn check_running(&mut self, index: usize, telemetry: &Telemetry, goal: Option<i32>) -> Option<Fault> {
        let id = telemetry.id;

        if telemetry.watchdog_tripped {
            return Some(Fault::BusWatchdogTripped { id });
        }

        if telemetry.overload || telemetry.overcurrent || telemetry.hardware_error != 0 {
            return Some(Fault::ServoProtection { id });
        }

        if !telemetry.torque_on {
            return Some(Fault::UnexpectedTorqueOff { id });
        }

        let goal = goal?;
        let joint = self.joints[index].name.clone();
        let watch = &mut self.watches[index];

        watch.history.push_back((goal, telemetry.position));

        if watch.history.len() > DIRECTION_WINDOW {
            watch.history.pop_front();
        }

        if moved_away(&watch.history) {
            return Some(Fault::WrongDirection { id, joint });
        }

        let stalled = stalled(&watch.history);

        watch.stall_ticks = if stalled { watch.stall_ticks + 1 } else { 0 };

        (watch.stall_ticks >= STALL_TICKS).then_some(Fault::Stall { id, joint })
    }
}

fn comm_fault(id: u8, sample: &Sample, late: bool) -> Fault {
    match sample {
        Sample::WrongId(answered) => Fault::WrongId {
            asked: id,
            answered: *answered,
        },
        Sample::Corrupt => Fault::Garbled { id },
        _ if late => Fault::RepliesLate,
        _ => Fault::NoReply { id },
    }
}

fn moved_away(history: &VecDeque<(i32, i32)>) -> bool {
    let (Some(first), Some(last)) = (history.front(), history.back()) else {
        return false;
    };

    if history.len() < DIRECTION_WINDOW {
        return false;
    }

    let error_then = first.0 - first.1;
    let error_now = last.0 - last.1;
    let travel = last.1 - first.1;
    let opposes = travel.signum() == -error_then.signum() && error_then != 0;

    opposes && travel.abs() >= DIRECTION_AWAY_COUNTS && error_now.abs() > error_then.abs()
}

fn stalled(history: &VecDeque<(i32, i32)>) -> bool {
    let (Some(first), Some(last)) = (history.front(), history.back()) else {
        return false;
    };
    let error = (last.0 - last.1).abs();
    let travel = (last.1 - first.1).abs();

    error >= STALL_ERROR_COUNTS && travel <= STALL_MOTION_COUNTS
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calibration::fixtures::three_joint_arm;

    const LIMITS: Limits = Limits {
        stop_temp_c: 50.0,
        volts_min: 6.0,
        volts_max: 8.4,
    };

    fn telemetry(id: u8, position: i32) -> Telemetry {
        Telemetry {
            id,
            torque_on: true,
            goal: position,
            position,
            velocity_rad_s: 0.0,
            load_fraction: 0.0,
            volts: 7.4,
            temp_c: 30.0,
            overload: false,
            overcurrent: false,
            hardware_error: 0,
            watchdog_tripped: false,
        }
    }

    fn monitor() -> Monitor {
        Monitor::new(three_joint_arm().joints, LIMITS)
    }

    fn good(positions: [i32; 3]) -> Vec<Sample> {
        (1..=3)
            .zip(positions)
            .map(|(id, p)| Sample::Good(telemetry(id, p)))
            .collect()
    }

    #[test]
    fn a_single_missed_reply_is_tolerated() {
        let mut monitor = monitor();
        let goals = [Some(2048); 3];
        let expect = Expectation {
            torque_on: true,
            goals: &goals,
            late_bytes: 0,
        };
        let mut samples = good([2048; 3]);

        samples[1] = Sample::Missing;
        assert_eq!(monitor.observe(&samples, &expect), None);
        assert_eq!(monitor.observe(&good([2048; 3]), &expect), None);
    }

    #[test]
    fn three_missed_replies_name_the_servo() {
        let mut monitor = monitor();
        let goals = [Some(2048); 3];
        let expect = Expectation {
            torque_on: true,
            goals: &goals,
            late_bytes: 0,
        };
        let mut samples = good([2048; 3]);

        samples[1] = Sample::Missing;

        let faults: Vec<_> = (0..3).map(|_| monitor.observe(&samples, &expect)).collect();

        assert_eq!(faults[2], Some(Fault::NoReply { id: 2 }));
    }

    #[test]
    fn hot_servo_stops_at_fifty_degrees() {
        let mut monitor = monitor();
        let goals = [None; 3];
        let expect = Expectation {
            torque_on: false,
            goals: &goals,
            late_bytes: 0,
        };
        let mut hot = telemetry(3, 2048);

        hot.temp_c = 50.0;

        let samples = vec![
            Sample::Good(telemetry(1, 2048)),
            Sample::Good(telemetry(2, 2048)),
            Sample::Good(hot),
        ];

        assert_eq!(
            monitor.observe(&samples, &expect),
            Some(Fault::Overheat { id: 3, temp_c: 50.0 })
        );
    }

    #[test]
    fn a_joint_that_never_moves_toward_its_goal_is_a_stall() {
        let mut monitor = monitor();
        let goals = [Some(2148), Some(2048), Some(2048)];
        let expect = Expectation {
            torque_on: true,
            goals: &goals,
            late_bytes: 0,
        };
        let mut fault = None;

        for _ in 0..STALL_TICKS + DIRECTION_WINDOW as u32 {
            fault = fault.or(monitor.observe(&good([2048; 3]), &expect));
        }

        assert!(matches!(fault, Some(Fault::Stall { id: 1, .. })));
    }

    #[test]
    fn a_joint_running_away_from_its_goal_is_wrong_direction() {
        let mut monitor = monitor();
        let goals = [Some(2100), Some(2048), Some(2048)];
        let expect = Expectation {
            torque_on: true,
            goals: &goals,
            late_bytes: 0,
        };
        let mut fault = None;

        for step in 0..DIRECTION_WINDOW as i32 + 1 {
            fault = fault.or(monitor.observe(&good([2048 - 5 * step, 2048, 2048]), &expect));
        }

        assert!(matches!(fault, Some(Fault::WrongDirection { id: 1, .. })));
    }

    #[test]
    fn torque_dropping_while_running_is_a_restart() {
        let mut monitor = monitor();
        let goals = [Some(2048); 3];
        let expect = Expectation {
            torque_on: true,
            goals: &goals,
            late_bytes: 0,
        };
        let mut samples = good([2048; 3]);
        let mut reset = telemetry(2, 2048);

        reset.torque_on = false;
        samples[1] = Sample::Good(reset);
        assert_eq!(
            monitor.observe(&samples, &expect),
            Some(Fault::UnexpectedTorqueOff { id: 2 })
        );
    }

    #[test]
    fn late_bytes_for_three_ticks_are_reported_as_late() {
        let mut monitor = monitor();
        let goals = [Some(2048); 3];
        let expect = Expectation {
            torque_on: true,
            goals: &goals,
            late_bytes: 12,
        };
        let faults: Vec<_> = (0..3).map(|_| monitor.observe(&good([2048; 3]), &expect)).collect();

        assert_eq!(faults[2], Some(Fault::RepliesLate));
    }
}
