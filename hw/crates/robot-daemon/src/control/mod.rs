mod entry;
pub(crate) mod running;
mod scan;
mod stopping;

use crate::artefacts::ArtefactSource;
use crate::calibration::{Calibration, RobotClass};
use crate::caps::{voltage_window, WATCHDOG_US};
use crate::fault::Fault;
use crate::intent::{Heartbeat, IntentSlot, MAX_OBSERVATIONS};
use crate::ladder::{Hash, Ladder, Mode};
use crate::monitor::{Limits, Monitor};
use crate::safety::{ReadBus, SafetyLayer};
use crate::stop::StopPlan;
use crate::telemetry::{sample_from, tagged_block, Sample};
use crate::watchdog::Watchdog;
use servo_wire::{ByteTransport, Clock, Family};
use std::sync::Arc;

pub use entry::Command;

#[derive(Debug, Clone, PartialEq)]
pub struct DaemonConfig {
    pub family: Family,
    pub ids: Vec<u8>,
    pub class: RobotClass,
}

#[derive(Clone, Default)]
pub struct Inputs {
    pub intents: Arc<IntentSlot>,
    pub policy_actions: Arc<IntentSlot>,
    pub observations: Arc<IntentSlot<MAX_OBSERVATIONS>>,
    pub heartbeat: Arc<Heartbeat>,
    pub policy_attached: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DaemonEvent {
    Fault { at_us: u64, code: String, message: String },
    Mode { at_us: u64, mode: Mode },
    Stopped { at_us: u64, message: String },
    Completed { at_us: u64, mode: Mode },
    Refused { message: String },
}

#[derive(Debug, Clone, PartialEq)]
pub enum Run {
    Idle,
    SoftStart { tick: u32 },
    Running,
    Rehearsing,
    Stopping { plan: StopPlan, retries_left: u32 },
    Stopped,
}

enum Holder {
    Look(ReadBus),
    Armed(SafetyLayer),
    Empty,
}

pub struct Daemon {
    config: DaemonConfig,
    clock: Arc<dyn Clock>,
    holder: Holder,
    ladder: Ladder,
    artefacts: Box<dyn ArtefactSource>,
    calibration: Option<Calibration>,
    firmware: Option<Hash>,
    run: Run,
    monitor: Option<Monitor>,
    inputs: Inputs,
    intent_watchdog: Watchdog,
    heartbeat_watchdog: Watchdog,
    applied_version: u64,
    read_tag: u16,
    samples: Vec<Sample>,
    shadow_goals: Vec<Option<i32>>,
    start_positions: Vec<Option<i32>>,
    travel: Vec<i32>,
    stage_ticks: u32,
    stand_ticks: u32,
    events: Vec<DaemonEvent>,
}

impl Daemon {
    pub fn new(
        config: DaemonConfig,
        transport: Box<dyn ByteTransport>,
        clock: Arc<dyn Clock>,
        artefacts: Box<dyn ArtefactSource>,
    ) -> Self {
        let bus = ReadBus::new(transport, config.family, clock.clone());

        Self {
            config,
            clock,
            holder: Holder::Look(bus),
            ladder: Ladder::new(),
            artefacts,
            calibration: None,
            firmware: None,
            run: Run::Idle,
            monitor: None,
            inputs: Inputs::default(),
            intent_watchdog: Watchdog::new(WATCHDOG_US),
            heartbeat_watchdog: Watchdog::new(WATCHDOG_US),
            applied_version: 0,
            read_tag: 0,
            samples: Vec::new(),
            shadow_goals: Vec::new(),
            start_positions: Vec::new(),
            travel: Vec::new(),
            stage_ticks: 0,
            stand_ticks: 0,
            events: Vec::new(),
        }
    }

    pub fn inputs(&self) -> Inputs {
        self.inputs.clone()
    }

    pub fn attach_policy(&mut self) -> Inputs {
        self.inputs.policy_attached = true;

        self.inputs.clone()
    }

    pub fn mode(&self) -> Mode {
        self.ladder.mode()
    }

    pub fn run(&self) -> &Run {
        &self.run
    }

    pub fn fault_latched(&self) -> bool {
        self.ladder.fault_latched()
    }

    pub fn samples(&self) -> &[Sample] {
        &self.samples
    }

    pub fn is_sealed(&self) -> bool {
        match &self.holder {
            Holder::Armed(layer) => layer.is_sealed(),
            _ => true,
        }
    }

    pub fn now_us(&self) -> u64 {
        self.clock.now_micros()
    }

    pub fn take_events(&mut self) -> Vec<DaemonEvent> {
        std::mem::take(&mut self.events)
    }

    pub fn class(&self) -> RobotClass {
        self.calibration
            .as_ref()
            .map_or(self.config.class, |calibration| calibration.class)
    }

    fn limits(&self, stop_temp_c: f32) -> Limits {
        let (volts_min, volts_max) = voltage_window(self.config.family);

        Limits {
            stop_temp_c,
            volts_min,
            volts_max,
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
            message: fault.message(),
        });
    }

    pub fn tick(&mut self) {
        self.read_tag = self.read_tag.wrapping_add(1);

        match &mut self.holder {
            Holder::Look(bus) => {
                let ids = self.config.ids.clone();

                self.samples = read_samples(bus, &ids, self.read_tag)
                    .map(|read| read.samples)
                    .unwrap_or_default();
            }
            Holder::Armed(_) => self.armed_tick(),
            Holder::Empty => {}
        }
    }
}

pub(crate) struct Readings {
    pub samples: Vec<Sample>,
    pub late: usize,
}

fn read_samples(bus: &mut ReadBus, ids: &[u8], tag: u16) -> Result<Readings, Fault> {
    let family = bus.family();
    let (address, length) = tagged_block(family, tag);
    let drained = bus.drain_late().map_err(|_| Fault::BusGone)?;
    let exchange = bus
        .sync_read(ids, address, length, crate::caps::READ_BUDGET_US)
        .map_err(|_| Fault::BusGone)?;

    Ok(Readings {
        samples: exchange
            .replies
            .iter()
            .map(|reply| sample_from(family, reply))
            .collect(),
        late: drained + exchange.stale_frames,
    })
}
