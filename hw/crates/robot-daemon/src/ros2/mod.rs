mod entry;
mod joint_map;
mod run;
mod words;

pub use entry::{spec_joint, POLICY_RUNGS_OUT};
pub use joint_map::{map_joints, JointMap};
pub use words::unmatched_message;

use crate::artefacts::ArtefactSource;
use crate::calibration::Calibration;
use crate::control::{DaemonEvent, Inputs};
use crate::fault::Fault;
use crate::ladder::{Event, Hash, Ladder, Mode};
use crate::safety::{Ros2Bus, Ros2Layer, Ros2Reading};
use crate::session::{IntentFeed, TestProgress};
use servo_wire::ros2::ControllerKind;
use servo_wire::{Clock, TopicTransport};
use std::sync::Arc;

pub const LOST_STATE_US: u64 = 60_000;
pub const SET_UP_WAIT_US: u64 = 100_000;
pub const TOP_RUNG: Mode = Mode::Test;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ros2Run {
    Idle,
    SoftStart,
    Running,
    Stopped,
}

impl Ros2Run {
    pub fn label(self) -> &'static str {
        match self {
            Ros2Run::Idle => "idle",
            Ros2Run::SoftStart => "soft_start",
            Ros2Run::Running => "running",
            Ros2Run::Stopped => "stopped",
        }
    }

    pub fn is_commanding(self) -> bool {
        matches!(self, Ros2Run::SoftStart | Ros2Run::Running)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ros2Spec {
    pub kind: ControllerKind,
    pub joints: Vec<String>,
}

enum Holder {
    Look(Ros2Bus),
    Armed(Ros2Layer),
    Empty,
}

pub struct Ros2Daemon {
    spec: Ros2Spec,
    clock: Arc<dyn Clock>,
    holder: Holder,
    ladder: Ladder,
    artefacts: Box<dyn ArtefactSource>,
    calibration: Option<Calibration>,
    firmware: Option<Hash>,
    run: Ros2Run,
    feed: IntentFeed,
    target: Option<Vec<f32>>,
    refused_at_last_state: u64,
    progress: TestProgress,
    events: Vec<DaemonEvent>,
}

pub struct Ros2Parts {
    pub spec: Ros2Spec,
    pub transport: Box<dyn TopicTransport>,
    pub clock: Arc<dyn Clock>,
    pub artefacts: Box<dyn ArtefactSource>,
}

impl Ros2Daemon {
    pub fn new(parts: Ros2Parts) -> Self {
        Self {
            spec: parts.spec,
            holder: Holder::Look(Ros2Bus::new(parts.transport, parts.clock.clone())),
            clock: parts.clock,
            ladder: Ladder::new(),
            artefacts: parts.artefacts,
            calibration: None,
            firmware: None,
            run: Ros2Run::Idle,
            feed: IntentFeed::new(),
            target: None,
            refused_at_last_state: 0,
            progress: TestProgress::default(),
            events: Vec::new(),
        }
    }

    pub fn inputs(&self) -> Inputs {
        self.feed.inputs()
    }

    pub fn spec(&self) -> &Ros2Spec {
        &self.spec
    }

    pub fn mode(&self) -> Mode {
        self.ladder.mode()
    }

    pub fn run(&self) -> Ros2Run {
        self.run
    }

    pub fn fault_latched(&self) -> bool {
        self.ladder.fault_latched()
    }

    pub fn is_sealed(&self) -> bool {
        match &self.holder {
            Holder::Armed(layer) => layer.is_sealed(),
            _ => true,
        }
    }

    pub fn reading(&self) -> Option<&Ros2Reading> {
        self.bus().and_then(Ros2Bus::latest)
    }

    pub fn refused(&self) -> u64 {
        self.bus().map_or(0, Ros2Bus::refused)
    }

    pub fn joint_positions(&self) -> Vec<Option<f64>> {
        self.bus().and_then(|bus| bus.fresh(LOST_STATE_US)).map_or_else(
            || vec![None; self.spec.joints.len()],
            |reading| reading.positions_of(&self.spec.joints),
        )
    }

    pub fn now_us(&self) -> u64 {
        self.clock.now_micros()
    }

    pub fn take_events(&mut self) -> Vec<DaemonEvent> {
        std::mem::take(&mut self.events)
    }

    fn bus(&self) -> Option<&Ros2Bus> {
        match &self.holder {
            Holder::Look(bus) => Some(bus),
            Holder::Armed(layer) => Some(layer.bus()),
            Holder::Empty => None,
        }
    }

    fn bus_mut(&mut self) -> Option<&mut Ros2Bus> {
        match &mut self.holder {
            Holder::Look(bus) => Some(bus),
            Holder::Armed(layer) => Some(layer.bus_mut()),
            Holder::Empty => None,
        }
    }

    fn push(&mut self, event: DaemonEvent) {
        self.events.push(event);
    }

    fn report_fault(&mut self, fault: &Fault) {
        let at_us = self.now_us();

        self.push(DaemonEvent::Fault {
            at_us,
            code: fault.code().into(),
            message: fault.ros2_message(),
            id: None,
        });
    }

    fn fault(&mut self, fault: Fault) {
        self.report_fault(&fault);
        self.ladder.apply(Event::Fault);
        self.hold();
    }

    fn joint_name(&self, id: u8) -> String {
        usize::from(id)
            .checked_sub(1)
            .and_then(|index| self.spec.joints.get(index))
            .map_or_else(|| format!("joint {id}"), Clone::clone)
    }

    pub fn tick(&mut self) {
        let polled = self.bus_mut().map(Ros2Bus::poll);

        if matches!(polled, Some(Err(_))) && matches!(self.holder, Holder::Armed(_)) {
            return self.fault(Fault::BusGone);
        }

        if matches!(self.holder, Holder::Armed(_)) {
            self.armed_tick();
        }
    }

    fn state_fault(&mut self) -> Option<Fault> {
        let refused = self.refused();
        let fresh = self.bus().and_then(|bus| bus.fresh(LOST_STATE_US)).is_some();

        if fresh {
            self.refused_at_last_state = refused;

            return None;
        }

        Some(if refused > self.refused_at_last_state {
            Fault::JointStatesRefused
        } else {
            Fault::JointStatesLost
        })
    }

    fn armed_tick(&mut self) {
        let found = if self.run.is_commanding() {
            self.state_fault()
        } else {
            None
        };

        if let Some(fault) = found {
            return self.fault(fault);
        }

        match self.run {
            Ros2Run::SoftStart => self.soft_start(),
            Ros2Run::Running => self.running(),
            Ros2Run::Idle | Ros2Run::Stopped => {}
        }
    }
}
