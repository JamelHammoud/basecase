mod entry;
mod run;

pub use entry::{writable_joint, POLICY_RUNGS_OUT};

use crate::artefacts::ArtefactSource;
use crate::calibration::Calibration;
use crate::control::{DaemonEvent, Inputs};
use crate::fault::Fault;
use crate::ladder::{Event, Hash, Ladder, Mode};
use crate::safety::{ArmSdkLayer, G1Bus, Reading};
use crate::session::{IntentFeed, TestProgress};
use servo_wire::unitree::g1::motor_of;
use servo_wire::{Clock, TopicTransport};
use std::sync::Arc;

pub const LOST_STATE_US: u64 = 60_000;
pub const FSM_TIMEOUT_US: u64 = 50_000;
pub const TOP_RUNG: Mode = Mode::Test;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum G1Run {
    Idle,
    SoftStart,
    Running,
    HandingBack { then_look: bool },
    Stopped,
}

impl G1Run {
    pub fn label(self) -> &'static str {
        match self {
            G1Run::Idle => "idle",
            G1Run::SoftStart => "soft_start",
            G1Run::Running => "running",
            G1Run::HandingBack { .. } => "stopping",
            G1Run::Stopped => "stopped",
        }
    }
}

enum Holder {
    Look(G1Bus),
    Armed(ArmSdkLayer),
    Empty,
}

pub struct G1Daemon {
    clock: Arc<dyn Clock>,
    holder: Holder,
    ladder: Ladder,
    artefacts: Box<dyn ArtefactSource>,
    calibration: Option<Calibration>,
    firmware: Option<Hash>,
    run: G1Run,
    feed: IntentFeed,
    refused_at_last_state: u64,
    progress: TestProgress,
    events: Vec<DaemonEvent>,
}

impl G1Daemon {
    pub fn new(transport: Box<dyn TopicTransport>, clock: Arc<dyn Clock>, artefacts: Box<dyn ArtefactSource>) -> Self {
        Self {
            holder: Holder::Look(G1Bus::new(transport, clock.clone())),
            clock,
            ladder: Ladder::new(),
            artefacts,
            calibration: None,
            firmware: None,
            run: G1Run::Idle,
            feed: IntentFeed::new(),
            refused_at_last_state: 0,
            progress: TestProgress::default(),
            events: Vec::new(),
        }
    }

    pub fn inputs(&self) -> Inputs {
        self.feed.inputs()
    }

    pub fn mode(&self) -> Mode {
        self.ladder.mode()
    }

    pub fn run(&self) -> G1Run {
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

    pub fn weight(&self) -> f32 {
        match &self.holder {
            Holder::Armed(layer) => layer.weight(),
            _ => 0.0,
        }
    }

    pub fn reading(&self) -> Option<&Reading> {
        self.bus().and_then(G1Bus::latest)
    }

    pub fn now_us(&self) -> u64 {
        self.clock.now_micros()
    }

    pub fn take_events(&mut self) -> Vec<DaemonEvent> {
        std::mem::take(&mut self.events)
    }

    fn bus(&self) -> Option<&G1Bus> {
        match &self.holder {
            Holder::Look(bus) => Some(bus),
            Holder::Armed(layer) => Some(layer.bus()),
            Holder::Empty => None,
        }
    }

    fn bus_mut(&mut self) -> Option<&mut G1Bus> {
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
            message: fault.g1_message(),
            id: None,
        });
    }

    fn fault(&mut self, fault: Fault) {
        self.report_fault(&fault);
        self.ladder.apply(Event::Fault);
        self.begin_hand_back(false);
    }

    fn joint_name(&self, motor: usize) -> String {
        self.calibration
            .as_ref()
            .and_then(|calibration| {
                calibration
                    .joints
                    .iter()
                    .find(|joint| motor_of(joint.id) == Some(motor))
            })
            .map_or_else(|| format!("motor {motor}"), |joint| joint.name.clone())
    }

    pub fn tick(&mut self) {
        let polled = self.bus_mut().map(G1Bus::poll);

        if matches!(polled, Some(Err(_))) && matches!(self.holder, Holder::Armed(_)) {
            return self.fault(Fault::BusGone);
        }

        if matches!(self.holder, Holder::Armed(_)) {
            self.armed_tick();
        }
    }

    fn state_fault(&mut self) -> Option<Fault> {
        let now = self.now_us();
        let refused = self.bus().map_or(0, G1Bus::refused);
        let fresh = self
            .reading()
            .is_some_and(|reading| now.saturating_sub(reading.at_us) <= LOST_STATE_US);

        if fresh {
            self.refused_at_last_state = refused;

            return None;
        }

        Some(if refused > self.refused_at_last_state {
            Fault::StateCorrupt
        } else {
            Fault::StateLost
        })
    }

    fn motor_fault(&self) -> Option<Fault> {
        let Holder::Armed(layer) = &self.holder else {
            return None;
        };
        let reading = self.reading()?;
        let motor = layer
            .ids()
            .into_iter()
            .filter_map(motor_of)
            .find(|motor| reading.motors.get(*motor).is_some_and(|state| state.error != 0))?;

        Some(Fault::MotorError {
            joint: self.joint_name(motor),
        })
    }

    fn armed_tick(&mut self) {
        let active = matches!(self.run, G1Run::SoftStart | G1Run::Running);
        let found = if active {
            self.state_fault().or_else(|| self.motor_fault())
        } else {
            None
        };

        if let Some(fault) = found {
            return self.fault(fault);
        }

        match self.run {
            G1Run::SoftStart => self.soft_start(),
            G1Run::Running => self.running(),
            G1Run::HandingBack { then_look } => self.hand_back(then_look),
            G1Run::Idle | G1Run::Stopped => {}
        }
    }
}
