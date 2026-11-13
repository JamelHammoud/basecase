use super::g1_bus::{G1Bus, Reading};
use super::guard::{hold_at, next_goal, CountBounds, SafeGoal, StepRule};
use super::layer::{ArmGrant, WriteError};
use crate::calibration::{JointCalibration, COUNTS_PER_TURN};
use crate::caps::{step_per_tick, Caps, MAX_LEAD_RAD};
use servo_wire::unitree::g1::{is_writable, motor_of, WEIGHT_SLOT};
use servo_wire::unitree::{LowCmd, MotorCmd};
use std::f32::consts::TAU;

pub const ARM_KP: f32 = 60.0;
pub const ARM_KD: f32 = 1.5;
pub const WEIGHT_RISE_PER_TICK: f32 = 0.02;
pub const WEIGHT_FALL_PER_TICK: f32 = 0.25;
const RELEASE_ATTEMPTS: usize = 3;

pub struct ArmSdkLayer {
    bus: G1Bus,
    joints: Vec<JointCalibration>,
    motors: Vec<usize>,
    bounds: Vec<CountBounds>,
    goals: Vec<Option<SafeGoal>>,
    caps: Caps,
    weight: f32,
    sealed: bool,
}

impl ArmSdkLayer {
    pub fn new(bus: G1Bus, joints: Vec<JointCalibration>, caps: Caps, _grant: ArmGrant) -> Self {
        let joints: Vec<JointCalibration> = joints
            .into_iter()
            .filter(|joint| motor_of(joint.id).is_some_and(is_writable))
            .collect();
        let motors = joints.iter().filter_map(|joint| motor_of(joint.id)).collect();
        let bounds = joints.iter().map(JointCalibration::bounds).collect();
        let goals = vec![None; joints.len()];

        Self {
            bus,
            joints,
            motors,
            bounds,
            goals,
            caps,
            weight: 0.0,
            sealed: false,
        }
    }

    pub fn bus_mut(&mut self) -> &mut G1Bus {
        &mut self.bus
    }

    pub fn bus(&self) -> &G1Bus {
        &self.bus
    }

    pub fn joints(&self) -> &[JointCalibration] {
        &self.joints
    }

    pub fn ids(&self) -> Vec<u8> {
        self.joints.iter().map(|joint| joint.id).collect()
    }

    pub fn caps(&self) -> Caps {
        self.caps
    }

    pub fn weight(&self) -> f32 {
        self.weight
    }

    pub fn goals(&self) -> Vec<Option<i32>> {
        self.goals.iter().map(|goal| goal.map(SafeGoal::counts)).collect()
    }

    pub fn is_sealed(&self) -> bool {
        self.sealed
    }

    pub fn seal(&mut self) {
        self.sealed = true;
    }

    pub fn present(&self, reading: Option<&Reading>) -> Vec<Option<i32>> {
        self.joints
            .iter()
            .zip(&self.motors)
            .map(|(joint, motor)| {
                reading
                    .and_then(|reading| reading.motors.get(*motor))
                    .and_then(|state| joint.counts_from_rad(state.q))
            })
            .collect()
    }

    fn step_rule(&self) -> StepRule {
        let to_counts = COUNTS_PER_TURN / TAU;

        StepRule {
            step: (step_per_tick(&self.caps) * to_counts).floor() as i32,
            lead: (MAX_LEAD_RAD * to_counts).floor() as i32,
        }
    }

    fn command_bytes(&self, weight: f32, mode_machine: u8) -> Vec<u8> {
        let mut command = LowCmd {
            mode_machine,
            ..LowCmd::default()
        };

        for ((joint, motor), goal) in self.joints.iter().zip(&self.motors).zip(&self.goals) {
            if let (true, Some(goal)) = (is_writable(*motor), goal) {
                command.motor_cmd[*motor] = MotorCmd {
                    mode: 1,
                    q: joint.rad_from_counts(goal.counts()),
                    kp: ARM_KP,
                    kd: ARM_KD,
                    ..MotorCmd::default()
                };
            }
        }

        command.motor_cmd[WEIGHT_SLOT].q = weight.clamp(0.0, 1.0);
        command.with_crc().encode()
    }

    fn publish(&mut self, weight: f32) -> Result<(), WriteError> {
        if self.sealed {
            return Err(WriteError::Sealed);
        }

        if self.goals.iter().any(Option::is_none) {
            return Err(WriteError::NoTelemetry {
                id: self.joints.first().map_or(0, |joint| joint.id),
            });
        }

        let mode_machine = self.bus.latest().map_or(0, |reading| reading.mode_machine);
        let bytes = self.command_bytes(weight, mode_machine);

        self.bus.publish_arm_sdk(&bytes)?;
        self.weight = weight.clamp(0.0, 1.0);

        Ok(())
    }

    fn present_of(&self, present: &[Option<i32>], index: usize) -> Result<i32, WriteError> {
        present.get(index).copied().flatten().ok_or(WriteError::NoTelemetry {
            id: self.joints[index].id,
        })
    }

    pub fn prepare(&mut self, present: &[Option<i32>]) -> Result<(), WriteError> {
        let mut holds = Vec::with_capacity(self.joints.len());

        for index in 0..self.joints.len() {
            let counts = self.present_of(present, index)?;
            let goal = hold_at(counts, self.bounds[index]).ok_or(WriteError::OutOfRange {
                id: self.joints[index].id,
            })?;

            holds.push(Some(goal));
        }

        self.goals = holds;
        self.publish(0.0)
    }

    pub fn ramp_weight(&mut self, toward: f32) -> Result<(), WriteError> {
        let toward = toward.clamp(0.0, 1.0);
        let next = if toward > self.weight {
            (self.weight + WEIGHT_RISE_PER_TICK).min(toward)
        } else {
            (self.weight - WEIGHT_FALL_PER_TICK).max(toward)
        };

        self.publish(next)
    }

    pub fn command(&mut self, requested: &[f32], present: &[Option<i32>]) -> Result<(), WriteError> {
        if self.sealed {
            return Err(WriteError::Sealed);
        }

        if requested.len() != self.joints.len() {
            return Err(WriteError::WrongLength {
                expected: self.joints.len(),
                got: requested.len(),
            });
        }

        if let Some(joint) = requested.iter().position(|value| !value.is_finite()) {
            return Err(WriteError::NotFinite { joint });
        }

        let rule = self.step_rule();
        let mut goals = Vec::with_capacity(self.joints.len());

        for (index, joint) in self.joints.iter().enumerate() {
            let measured = self.present_of(present, index)?;
            let previous = self.goals[index].ok_or(WriteError::NoTelemetry { id: joint.id })?;
            let target = joint
                .counts_from_rad(requested[index])
                .ok_or(WriteError::NotFinite { joint: index })?;

            goals.push(Some(next_goal(target, previous, measured, self.bounds[index], rule)));
        }

        self.goals = goals;
        self.publish(self.weight)
    }

    pub fn release(mut self) -> G1Bus {
        if !self.sealed && self.goals.iter().all(Option::is_some) {
            let mode_machine = self.bus.latest().map_or(0, |reading| reading.mode_machine);
            let bytes = self.command_bytes(0.0, mode_machine);

            for _ in 0..RELEASE_ATTEMPTS {
                if self.bus.publish_arm_sdk(&bytes).is_err() {
                    break;
                }
            }
        }

        self.bus
    }
}
