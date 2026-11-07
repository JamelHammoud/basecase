use super::bus::{BusGone, ReadBus};
use super::encode::{self, Register};
use super::guard::{hold_at, next_goal, torque_fraction_within, CountBounds, SafeGoal, StepRule};
use crate::calibration::{JointCalibration, COUNTS_PER_TURN};
use crate::caps::{step_per_tick, Caps, MAX_LEAD_RAD, SOFT_START_TORQUE};
use crate::telemetry::Telemetry;
use servo_wire::Family;
use std::f32::consts::TAU;

const DYNAMIXEL_WATCHDOG_UNITS: u8 = 5;
const RELEASE_ATTEMPTS: usize = 3;

pub struct ArmGrant {
    _issued_by_ladder: (),
}

impl ArmGrant {
    pub(crate) fn issue() -> Self {
        Self { _issued_by_ladder: () }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum WriteError {
    Sealed,
    BusGone,
    NotFinite { joint: usize },
    WrongLength { expected: usize, got: usize },
    NoTelemetry { id: u8 },
    OutOfRange { id: u8 },
}

impl From<BusGone> for WriteError {
    fn from(_: BusGone) -> Self {
        WriteError::BusGone
    }
}

pub struct SafetyLayer {
    bus: ReadBus,
    joints: Vec<JointCalibration>,
    bounds: Vec<CountBounds>,
    goals: Vec<Option<SafeGoal>>,
    caps: Caps,
    torque_fraction: f32,
    sealed: bool,
}

impl SafetyLayer {
    pub fn new(bus: ReadBus, joints: Vec<JointCalibration>, caps: Caps, _grant: ArmGrant) -> Self {
        let bounds = joints.iter().map(JointCalibration::bounds).collect();
        let goals = vec![None; joints.len()];

        Self {
            bus,
            joints,
            bounds,
            goals,
            caps,
            torque_fraction: 0.0,
            sealed: false,
        }
    }

    pub fn bus_mut(&mut self) -> &mut ReadBus {
        &mut self.bus
    }

    pub fn family(&self) -> Family {
        self.bus.family()
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

    pub fn torque_fraction(&self) -> f32 {
        self.torque_fraction
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

    fn step_rule(&self) -> StepRule {
        let to_counts = COUNTS_PER_TURN / TAU;

        StepRule {
            step: (step_per_tick(&self.caps) * to_counts).floor() as i32,
            lead: (MAX_LEAD_RAD * to_counts).floor() as i32,
        }
    }

    fn write(&mut self, entries: &[(u8, Register)]) -> Result<(), WriteError> {
        if self.sealed {
            return Err(WriteError::Sealed);
        }

        let Some(bytes) = encode::sync_write(self.family(), entries) else {
            return Ok(());
        };

        self.bus.send(&bytes).map_err(WriteError::from)
    }

    fn for_all(&self, register: Register) -> Vec<(u8, Register)> {
        self.ids().into_iter().map(|id| (id, register)).collect()
    }

    fn present(&self, samples: &[Option<Telemetry>], index: usize) -> Result<i32, WriteError> {
        let id = self.joints[index].id;

        samples
            .get(index)
            .and_then(|sample| sample.as_ref())
            .filter(|telemetry| telemetry.id == id)
            .map(|telemetry| telemetry.position)
            .ok_or(WriteError::NoTelemetry { id })
    }

    pub fn prepare(&mut self, samples: &[Option<Telemetry>]) -> Result<(), WriteError> {
        let mut holds = Vec::with_capacity(self.joints.len());

        for index in 0..self.joints.len() {
            let present = self.present(samples, index)?;
            let goal = hold_at(present, self.bounds[index]).ok_or(WriteError::OutOfRange {
                id: self.joints[index].id,
            })?;

            holds.push(goal);
        }

        let soft = torque_fraction_within(SOFT_START_TORQUE, self.caps.torque_fraction);
        let goal_entries: Vec<(u8, Register)> = self
            .ids()
            .into_iter()
            .zip(&holds)
            .map(|(id, goal)| (id, Register::Goal(*goal)))
            .collect();

        self.write(&self.for_all(Register::TorqueLimit(soft)))?;
        self.write(&goal_entries)?;
        self.write(&self.for_all(Register::Speed(self.caps.speed_rad_s)))?;
        self.write(&self.for_all(Register::BusWatchdog(DYNAMIXEL_WATCHDOG_UNITS)))?;
        self.goals = holds.into_iter().map(Some).collect();
        self.torque_fraction = soft;

        Ok(())
    }

    pub fn enable(&mut self) -> Result<(), WriteError> {
        if self.goals.iter().any(Option::is_none) {
            return Err(WriteError::NoTelemetry {
                id: self.joints.first().map_or(0, |joint| joint.id),
            });
        }

        self.write(&self.for_all(Register::Torque(true)))
    }

    pub fn set_torque_fraction(&mut self, requested: f32) -> Result<(), WriteError> {
        let granted = torque_fraction_within(requested, self.caps.torque_fraction);

        self.write(&self.for_all(Register::TorqueLimit(granted)))?;
        self.torque_fraction = granted;

        Ok(())
    }

    pub fn plan(
        &self,
        requested: &[f32],
        samples: &[Option<Telemetry>],
        from: &[Option<i32>],
    ) -> Result<Vec<i32>, WriteError> {
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
        let mut planned = Vec::with_capacity(self.joints.len());

        for (index, joint) in self.joints.iter().enumerate() {
            let present = self.present(samples, index)?;
            let previous = from
                .get(index)
                .copied()
                .flatten()
                .and_then(|counts| hold_at(counts, self.bounds[index]))
                .ok_or(WriteError::NoTelemetry { id: joint.id })?;
            let target = joint
                .counts_from_rad(requested[index])
                .ok_or(WriteError::NotFinite { joint: index })?;

            planned.push(next_goal(target, previous, present, self.bounds[index], rule).counts());
        }

        Ok(planned)
    }

    pub fn command(&mut self, requested: &[f32], samples: &[Option<Telemetry>]) -> Result<(), WriteError> {
        if self.sealed {
            return Err(WriteError::Sealed);
        }

        let current = self.goals();
        let planned = self.plan(requested, samples, &current)?;
        let mut goals = Vec::with_capacity(planned.len());

        for (index, counts) in planned.into_iter().enumerate() {
            let goal = hold_at(counts, self.bounds[index]).ok_or(WriteError::OutOfRange {
                id: self.joints[index].id,
            })?;

            goals.push(goal);
        }

        let entries: Vec<(u8, Register)> = self
            .ids()
            .into_iter()
            .zip(&goals)
            .map(|(id, goal)| (id, Register::Goal(*goal)))
            .collect();

        self.write(&entries)?;
        self.goals = goals.into_iter().map(Some).collect();

        Ok(())
    }

    pub fn hold(&mut self, ids: &[u8], samples: &[Option<Telemetry>]) -> Result<(), WriteError> {
        let mut entries = Vec::new();

        for index in 0..self.joints.len() {
            let id = self.joints[index].id;
            let powered = samples
                .get(index)
                .and_then(|sample| sample.as_ref())
                .is_some_and(|telemetry| telemetry.torque_on);
            let present = self.present(samples, index).ok().filter(|_| powered);
            let goal = present.and_then(|counts| hold_at(counts, self.bounds[index]));

            if let (true, Some(goal)) = (ids.contains(&id), goal) {
                entries.push((id, Register::Goal(goal)));
                self.goals[index] = Some(goal);
            }
        }

        if entries.is_empty() {
            return Ok(());
        }

        self.write(&entries)
    }

    pub fn torque_off(&mut self, ids: &[u8]) -> Result<(), WriteError> {
        let entries: Vec<(u8, Register)> = ids.iter().map(|id| (*id, Register::Torque(false))).collect();

        if entries.is_empty() {
            return Ok(());
        }

        self.write(&entries)
    }

    pub fn into_bus(self) -> ReadBus {
        self.bus
    }

    pub fn release(mut self) -> ReadBus {
        let entries = self.for_all(Register::Torque(false));

        if let Some(bytes) = encode::sync_write(self.family(), &entries) {
            for _ in 0..RELEASE_ATTEMPTS {
                if self.bus.send(&bytes).is_err() {
                    break;
                }
            }
        }

        self.bus
    }
}
