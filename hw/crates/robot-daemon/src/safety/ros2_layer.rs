use super::guard::{hold_at, next_goal, next_speed, CountBounds, SafeGoal, StepRule};
use super::layer::{ArmGrant, WriteError};
use super::ros2_bus::{Ros2Bus, Ros2Reading};
use crate::calibration::{JointCalibration, COUNTS_PER_TURN};
use crate::caps::{step_per_tick, Caps, BASE_FORWARD_STEP_M_S, BASE_TURN_STEP_RAD_S, MAX_LEAD_RAD, TICK_US};
use servo_wire::ros2::{ControllerKind, Duration, Float64MultiArray, JointTrajectory, JointTrajectoryPoint, Twist};
use std::f32::consts::TAU;

pub const BASE_INTENTS: usize = 2;

pub struct Ros2Plan {
    pub kind: ControllerKind,
    pub names: Vec<String>,
    pub joints: Vec<JointCalibration>,
    pub caps: Caps,
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct BaseTwist {
    pub forward: f32,
    pub turn: f32,
}

pub struct Ros2Layer {
    bus: Ros2Bus,
    plan: Ros2Plan,
    bounds: Vec<CountBounds>,
    goals: Vec<Option<SafeGoal>>,
    twist: Option<BaseTwist>,
    sealed: bool,
}

impl Ros2Layer {
    pub fn new(bus: Ros2Bus, plan: Ros2Plan, _grant: ArmGrant) -> Self {
        let bounds = plan.joints.iter().map(JointCalibration::bounds).collect();
        let goals = vec![None; plan.joints.len()];

        Self {
            bus,
            plan,
            bounds,
            goals,
            twist: None,
            sealed: false,
        }
    }

    pub fn bus(&self) -> &Ros2Bus {
        &self.bus
    }

    pub fn bus_mut(&mut self) -> &mut Ros2Bus {
        &mut self.bus
    }

    pub fn kind(&self) -> ControllerKind {
        self.plan.kind
    }

    pub fn joints(&self) -> &[JointCalibration] {
        &self.plan.joints
    }

    pub fn caps(&self) -> Caps {
        self.plan.caps
    }

    pub fn goals(&self) -> Vec<Option<i32>> {
        self.goals.iter().map(|goal| goal.map(SafeGoal::counts)).collect()
    }

    pub fn twist(&self) -> Option<BaseTwist> {
        self.twist
    }

    pub fn is_sealed(&self) -> bool {
        self.sealed
    }

    pub fn seal(&mut self) {
        self.sealed = true;
    }

    fn is_base(&self) -> bool {
        self.plan.kind == ControllerKind::DiffDrive
    }

    pub fn present(&self, reading: Option<&Ros2Reading>) -> Vec<Option<i32>> {
        let radians = reading.map_or_else(
            || vec![None; self.plan.names.len()],
            |reading| reading.positions_of(&self.plan.names),
        );

        self.plan
            .joints
            .iter()
            .zip(radians)
            .map(|(joint, rad)| rad.and_then(|rad| joint.counts_from_rad(rad as f32)))
            .collect()
    }

    fn step_rule(&self) -> StepRule {
        let to_counts = COUNTS_PER_TURN / TAU;

        StepRule {
            step: (step_per_tick(&self.plan.caps) * to_counts).floor() as i32,
            lead: (MAX_LEAD_RAD * to_counts).floor() as i32,
        }
    }

    fn first_id(&self) -> u8 {
        self.plan.joints.first().map_or(0, |joint| joint.id)
    }

    fn goal_radians(&self) -> Result<Vec<f64>, WriteError> {
        self.plan
            .joints
            .iter()
            .zip(&self.goals)
            .map(|(joint, goal)| {
                goal.map(|goal| f64::from(joint.rad_from_counts(goal.counts())))
                    .ok_or(WriteError::NoTelemetry { id: joint.id })
            })
            .collect()
    }

    fn message(&self) -> Result<Vec<u8>, WriteError> {
        match self.plan.kind {
            ControllerKind::DiffDrive => {
                let twist = self.twist.ok_or(WriteError::NoTelemetry { id: self.first_id() })?;

                Ok(Twist::planar(f64::from(twist.forward), f64::from(twist.turn)).encode())
            }
            ControllerKind::ForwardPosition => Ok(Float64MultiArray::new(self.goal_radians()?).encode()),
            ControllerKind::JointTrajectory => {
                let point = JointTrajectoryPoint::at(self.goal_radians()?, Duration::from_micros(TICK_US));
                let trajectory = JointTrajectory {
                    joint_names: self.plan.names.clone(),
                    points: vec![point],
                    ..JointTrajectory::default()
                };

                Ok(trajectory.encode())
            }
        }
    }

    fn publish(&mut self) -> Result<(), WriteError> {
        if self.sealed {
            return Err(WriteError::Sealed);
        }

        let payload = self.message()?;

        self.bus.publish(self.plan.kind.command_topic(), &payload)?;

        Ok(())
    }

    fn present_of(&self, present: &[Option<i32>], index: usize) -> Result<i32, WriteError> {
        present.get(index).copied().flatten().ok_or(WriteError::NoTelemetry {
            id: self.plan.joints[index].id,
        })
    }

    pub fn prepare(&mut self, present: &[Option<i32>]) -> Result<(), WriteError> {
        if self.sealed {
            return Err(WriteError::Sealed);
        }

        if self.is_base() {
            self.twist = Some(BaseTwist::default());

            return self.publish();
        }

        let mut holds = Vec::with_capacity(self.plan.joints.len());

        for index in 0..self.plan.joints.len() {
            let counts = self.present_of(present, index)?;
            let goal = hold_at(counts, self.bounds[index]).ok_or(WriteError::OutOfRange {
                id: self.plan.joints[index].id,
            })?;

            holds.push(Some(goal));
        }

        self.goals = holds;
        self.publish()
    }

    fn checked_request(&self, requested: &[f32], expected: usize) -> Result<(), WriteError> {
        if self.sealed {
            return Err(WriteError::Sealed);
        }

        if requested.len() != expected {
            return Err(WriteError::WrongLength {
                expected,
                got: requested.len(),
            });
        }

        match requested.iter().position(|value| !value.is_finite()) {
            Some(joint) => Err(WriteError::NotFinite { joint }),
            None => Ok(()),
        }
    }

    pub fn command(&mut self, requested: &[f32], present: &[Option<i32>]) -> Result<(), WriteError> {
        if self.is_base() {
            return self.drive(requested);
        }

        self.checked_request(requested, self.plan.joints.len())?;

        let rule = self.step_rule();
        let mut goals = Vec::with_capacity(self.plan.joints.len());

        for (index, joint) in self.plan.joints.iter().enumerate() {
            let measured = self.present_of(present, index)?;
            let previous = self.goals[index].ok_or(WriteError::NoTelemetry { id: joint.id })?;
            let target = joint
                .counts_from_rad(requested[index])
                .ok_or(WriteError::NotFinite { joint: index })?;

            goals.push(Some(next_goal(target, previous, measured, self.bounds[index], rule)));
        }

        self.goals = goals;
        self.publish()
    }

    fn drive(&mut self, requested: &[f32]) -> Result<(), WriteError> {
        self.checked_request(requested, BASE_INTENTS)?;

        let previous = self.twist.ok_or(WriteError::NoTelemetry { id: self.first_id() })?;
        let caps = self.plan.caps;

        self.twist = Some(BaseTwist {
            forward: next_speed(
                previous.forward,
                requested[0],
                caps.base_forward_m_s,
                BASE_FORWARD_STEP_M_S,
            ),
            turn: next_speed(previous.turn, requested[1], caps.base_turn_rad_s, BASE_TURN_STEP_RAD_S),
        });
        self.publish()
    }

    fn hold_goals(&self, present: &[Option<i32>]) -> Vec<Option<SafeGoal>> {
        self.goals
            .iter()
            .zip(&self.bounds)
            .enumerate()
            .map(|(index, (previous, bounds))| {
                present
                    .get(index)
                    .copied()
                    .flatten()
                    .and_then(|counts| hold_at(counts, *bounds))
                    .or(*previous)
            })
            .collect()
    }

    pub fn hold(&mut self, present: &[Option<i32>]) -> Result<(), WriteError> {
        if self.sealed {
            return Err(WriteError::Sealed);
        }

        if self.is_base() {
            self.twist = Some(BaseTwist::default());
        } else {
            self.goals = self.hold_goals(present);
        }

        let published = self.publish();

        self.seal();
        published
    }

    pub fn release(self) -> Ros2Bus {
        self.bus
    }
}
