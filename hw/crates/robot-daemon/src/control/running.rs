use super::{read_samples, Daemon, DaemonEvent, Holder, Run};
use crate::caps::{SOFT_START_TICKS, SOFT_START_TORQUE, TICK_US};
use crate::fault::Fault;
use crate::intent::{MAX_JOINTS, MAX_OBSERVATIONS};
use crate::ladder::{Event, Mode};
use crate::monitor::Expectation;
use crate::safety::WriteError;
use crate::stop::plan_for;
use crate::telemetry::{Sample, Telemetry};
use crate::watchdog::Freshness;

const TEST_TICKS: u32 = 250;
const TEST_TRAVEL_COUNTS: i32 = 20;
const REHEARSE_TICKS: u32 = 500;

pub(super) struct Fresh {
    pub values: Vec<f32>,
}

impl Daemon {
    pub(super) fn armed_tick(&mut self) {
        let Holder::Armed(layer) = &mut self.holder else {
            return;
        };
        let ids = layer.ids();
        let readings = match read_samples(layer.bus_mut(), &ids, self.read_tag) {
            Ok(readings) => readings,
            Err(fault) => return self.fault(fault),
        };
        let late = readings.late;
        let goals = layer.goals();
        let torque_expected = matches!(self.run, Run::Running | Run::SoftStart { tick: 1.. });

        self.samples = readings.samples;

        if self.is_active() {
            let expect = Expectation {
                torque_on: torque_expected,
                goals: &goals,
                late_bytes: late,
            };
            let found = self
                .monitor
                .as_mut()
                .and_then(|monitor| monitor.observe(&self.samples, &expect));

            if let Some(fault) = found {
                return self.fault(fault);
            }
        }

        self.step_run();
    }

    fn is_active(&self) -> bool {
        matches!(self.run, Run::SoftStart { .. } | Run::Running | Run::Rehearsing)
    }

    pub(super) fn telemetry(&self) -> Vec<Option<Telemetry>> {
        self.samples.iter().map(Sample::telemetry).collect()
    }

    pub(super) fn fault(&mut self, fault: Fault) {
        self.report_fault(&fault);
        self.ladder.apply(Event::Fault);

        let plan = plan_for(&fault, self.class());

        self.begin_stop(Some(fault), plan);
    }

    fn step_run(&mut self) {
        match self.run.clone() {
            Run::SoftStart { tick } => self.soft_start(tick),
            Run::Running => self.running(),
            Run::Rehearsing => self.rehearsing(),
            Run::Stopping { plan, retries_left } => self.stopping(plan, retries_left),
            Run::Idle | Run::Stopped => {}
        }
    }

    fn with_layer<T>(&mut self, action: impl FnOnce(&mut crate::safety::SafetyLayer) -> T) -> Option<T> {
        match &mut self.holder {
            Holder::Armed(layer) => Some(action(layer)),
            _ => None,
        }
    }

    fn soft_start(&mut self, tick: u32) {
        let telemetry = self.telemetry();
        let result = if tick == 0 {
            self.with_layer(|layer| layer.prepare(&telemetry).and_then(|()| layer.enable()))
        } else {
            let cap = self.with_layer(|layer| layer.caps().torque_fraction).unwrap_or(0.0);
            let fraction = SOFT_START_TORQUE + (cap - SOFT_START_TORQUE) * tick as f32 / SOFT_START_TICKS as f32;

            self.with_layer(|layer| layer.set_torque_fraction(fraction))
        };

        match result {
            Some(Ok(())) if tick >= SOFT_START_TICKS => self.start_running(),
            Some(Ok(())) => self.run = Run::SoftStart { tick: tick + 1 },
            Some(Err(WriteError::NoTelemetry { .. })) if tick == 0 => {}
            Some(Err(error)) => self.write_failed(error),
            None => {}
        }
    }

    fn start_running(&mut self) {
        let now = self.now_us();
        let version = self.active_slot_version();
        let beats = self.inputs.heartbeat.count();

        self.intent_watchdog.arm(version, now);
        self.heartbeat_watchdog.arm(beats, now);
        self.applied_version = version;
        self.start_positions = self.telemetry().iter().map(|t| t.map(|t| t.position)).collect();
        self.stage_ticks = 0;
        self.run = Run::Running;

        if let Some(monitor) = self.monitor.as_mut() {
            monitor.reset_motion();
        }
    }

    fn uses_policy(&self) -> bool {
        self.inputs.policy_attached
            && matches!(
                self.ladder.mode(),
                Mode::Rehearse | Mode::FirstRun | Mode::Policy | Mode::LongerRuns
            )
    }

    fn active_slot_version(&self) -> u64 {
        if self.uses_policy() {
            self.inputs.policy_actions.version()
        } else {
            self.inputs.intents.version()
        }
    }

    fn stale_fault(&self) -> Fault {
        if self.uses_policy() {
            Fault::PolicyStale
        } else {
            Fault::IntentStale
        }
    }

    fn not_finite_fault(&self) -> Fault {
        if self.uses_policy() {
            Fault::PolicyNotFinite
        } else {
            Fault::IntentNotFinite
        }
    }

    pub(super) fn read_intent(&mut self) -> Result<Option<Fresh>, Fault> {
        let now = self.now_us();

        if self.heartbeat_watchdog.observe(self.inputs.heartbeat.count(), now) == Freshness::Stale {
            return Err(Fault::ClientLost);
        }

        let mut values = [0.0f32; MAX_JOINTS];
        let slot = if self.uses_policy() {
            &self.inputs.policy_actions
        } else {
            &self.inputs.intents
        };
        let snapshot = slot.read(&mut values);
        let version = slot.version();

        if self.intent_watchdog.observe(version, now) == Freshness::Stale {
            return Err(self.stale_fault());
        }

        match snapshot {
            Some(snap) if snap.version != self.applied_version => {
                self.applied_version = snap.version;

                Ok(Some(Fresh {
                    values: values[..snap.count].to_vec(),
                }))
            }
            _ => Ok(None),
        }
    }

    fn running(&mut self) {
        let fresh = match self.read_intent() {
            Ok(fresh) => fresh,
            Err(fault) => return self.fault(fault),
        };

        let telemetry = self.telemetry();
        let complete = telemetry.iter().all(Option::is_some);

        if let (Some(Fresh { values }), true) = (fresh, complete) {
            if let Some(Err(error)) = self.with_layer(|layer| layer.command(&values, &telemetry)) {
                return self.write_failed(error);
            }
        }

        self.track_travel();
        self.publish_observations();
        self.count_stage();
    }

    fn rehearsing(&mut self) {
        let telemetry = self.telemetry();

        if self.shadow_goals.iter().any(Option::is_none) {
            self.shadow_goals = telemetry.iter().map(|t| t.map(|t| t.position)).collect();
            self.start_running_watchdogs();

            return;
        }

        let fresh = match self.read_intent() {
            Ok(fresh) => fresh,
            Err(fault) => return self.fault(fault),
        };

        let complete = telemetry.iter().all(Option::is_some);

        if let (Some(Fresh { values }), true) = (fresh, complete) {
            let shadow = self.shadow_goals.clone();

            match self.with_layer(|layer| layer.plan(&values, &telemetry, &shadow)) {
                Some(Ok(planned)) => self.shadow_goals = planned.into_iter().map(Some).collect(),
                Some(Err(error)) => return self.write_failed(error),
                None => {}
            }
        }

        self.publish_observations();
        self.count_stage();
    }

    fn start_running_watchdogs(&mut self) {
        let now = self.now_us();
        let version = self.active_slot_version();
        let beats = self.inputs.heartbeat.count();

        self.intent_watchdog.arm(version, now);
        self.heartbeat_watchdog.arm(beats, now);
        self.applied_version = version;
    }

    pub(super) fn write_failed(&mut self, error: WriteError) {
        let fault = match error {
            WriteError::Sealed => return,
            WriteError::BusGone => Fault::BusGone,
            WriteError::NotFinite { .. } => self.not_finite_fault(),
            WriteError::OutOfRange { id } => Fault::OutOfRange {
                id,
                joint: self.joint_name(id),
            },
            other => Fault::WriteRefused {
                detail: format!("{other:?}"),
            },
        };

        self.fault(fault);
    }

    fn joint_name(&self, id: u8) -> String {
        self.calibration
            .as_ref()
            .and_then(|calibration| calibration.joints.iter().find(|joint| joint.id == id))
            .map_or_else(|| format!("servo {id}"), |joint| joint.name.clone())
    }

    fn track_travel(&mut self) {
        for (index, telemetry) in self.telemetry().iter().enumerate() {
            let start = self.start_positions.get(index).copied().flatten();

            if let (Some(telemetry), Some(start), Some(travel)) = (telemetry, start, self.travel.get_mut(index)) {
                *travel = (*travel).max((telemetry.position - start).abs());
            }
        }
    }

    fn publish_observations(&self) {
        let telemetry = self.telemetry();
        let joints = self.with_calibration_joints();
        let mut observation = Vec::with_capacity(MAX_OBSERVATIONS);

        for (sample, joint) in telemetry.iter().zip(joints) {
            let position = sample.map_or(f32::NAN, |t| joint.rad_from_counts(t.position));
            let velocity = sample.map_or(f32::NAN, |t| f32::from(joint.direction) * t.velocity_rad_s);

            observation.push(position);
            observation.push(velocity);
        }

        observation.truncate(MAX_OBSERVATIONS);
        self.inputs.observations.publish(&observation);
    }

    fn with_calibration_joints(&self) -> Vec<crate::calibration::JointCalibration> {
        match &self.holder {
            Holder::Armed(layer) => layer.joints().to_vec(),
            _ => Vec::new(),
        }
    }

    fn count_stage(&mut self) {
        self.stage_ticks += 1;

        let mode = self.ladder.mode();
        let caps = self.with_layer(|layer| layer.caps());
        let needed = match mode {
            Mode::Test => Some(TEST_TICKS),
            Mode::Rehearse => Some(REHEARSE_TICKS),
            _ => caps
                .and_then(|caps| caps.run_limit_s)
                .map(|seconds| (seconds * 1e6 / TICK_US as f32) as u32),
        };
        let travelled = mode != Mode::Test || self.travel.iter().all(|travel| *travel >= TEST_TRAVEL_COUNTS);

        if needed.is_some_and(|needed| self.stage_ticks >= needed) && travelled {
            self.complete(mode);
        }
    }

    fn complete(&mut self, mode: Mode) {
        self.ladder.apply(Event::Completed(mode));

        let at_us = self.now_us();

        self.push(DaemonEvent::Completed { at_us, mode });

        if mode != Mode::Test {
            self.begin_stop(None, crate::stop::lost_commands(self.class()));
        }
    }
}
