use crate::dynamixel::DynamixelServo;
use crate::feetech::FeetechServo;
use crate::firmware::Firmware;
use crate::parts::{supply_volts, unit_for, PartsById};
use plant_bam::{Load, PartModel, Plant, SplitMix};
use servo_wire::dynamixel as dxl_wire;
use servo_wire::{Family, Scan};
use std::sync::{Arc, Mutex};

pub type SharedBus = Arc<Mutex<ServoBus>>;

const STEP_US: u64 = 1000;

pub const FACTORY_ID: u8 = 1;
const STALE_INBOX_US: u64 = 50_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CliFault {
    None,
    BadChecksum,
    WrongModel,
    Silent,
    WrongId,
    Truncated,
}

#[derive(Debug, Clone, Copy)]
pub struct BusOptions {
    pub seed: u64,
    pub fault: CliFault,
    pub byte_micros: u64,
    pub supply_ohms: f64,
    pub load: Load,
    pub spread_start_rad: f64,
}

impl Default for BusOptions {
    fn default() -> Self {
        Self {
            seed: 1,
            fault: CliFault::None,
            byte_micros: 10,
            supply_ohms: 0.05,
            load: Load::default(),
            spread_start_rad: 0.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Timed {
    pub at_us: u64,
    pub bytes: Vec<u8>,
}

pub(crate) struct Slot {
    pub(crate) firmware: Box<dyn Firmware>,
    pub(crate) powered: bool,
    unit_seed: u64,
    fitted_id: u8,
}

pub struct ServoBus {
    pub(crate) family: Family,
    pub(crate) options: BusOptions,
    pub(crate) slots: Vec<Slot>,
    parts: PartsById,
    inbox: Vec<u8>,
    last_rx_us: u64,
    stepped_to_us: u64,
    nominal_volts: f64,
    reset_volts: f64,
    forced_volts: Option<f64>,
    bus_volts: f64,
    frames_seen: u64,
}

impl ServoBus {
    pub fn new(family: Family, ids: &[u8], options: BusOptions) -> Self {
        Self::with_parts(family, ids, options, PartsById::new())
    }

    pub fn with_parts(family: Family, ids: &[u8], options: BusOptions, parts: PartsById) -> Self {
        let (nominal_volts, reset_volts) = supply_volts(family);
        let mut bus = Self {
            family,
            options,
            slots: Vec::new(),
            parts,
            inbox: Vec::new(),
            last_rx_us: 0,
            stepped_to_us: 0,
            nominal_volts,
            reset_volts,
            forced_volts: None,
            bus_volts: nominal_volts,
            frames_seen: 0,
        };

        for id in ids {
            bus.add_servo(*id);
        }

        bus
    }

    pub fn factory(family: Family, options: BusOptions) -> Self {
        Self::new(family, &[], options)
    }

    pub fn factory_with_parts(family: Family, options: BusOptions, parts: PartsById) -> Self {
        Self::with_parts(family, &[], options, parts)
    }

    pub fn plug_in_new_servo(&mut self) {
        self.add_servo(FACTORY_ID);
    }

    pub fn shared(self) -> SharedBus {
        Arc::new(Mutex::new(self))
    }

    pub fn add_servo(&mut self, id: u8) {
        let slot_index = self.slots.len() as u64;
        let mut rng = SplitMix::new(self.options.seed.wrapping_add(slot_index * 977));
        let start = self.options.spread_start_rad * (2.0 * rng.unit() - 1.0);

        self.add_servo_at(id, start);
    }

    pub fn add_servo_at(&mut self, id: u8, start: f64) {
        let slot_index = self.slots.len() as u64;
        let unit_seed = self.options.seed.wrapping_add(slot_index << 8);
        let wrong_model = self.options.fault == CliFault::WrongModel;
        let unit = unit_for(self.family, self.part_of(id), unit_seed, id);
        let firmware: Box<dyn Firmware> = match self.family {
            Family::Feetech => {
                let mut servo = FeetechServo::new(id, Plant::new(unit, self.options.load, start));

                if wrong_model {
                    servo.set_model(crate::feetech::table::MODEL_STS3215 + 1);
                }

                Box::new(servo)
            }
            Family::Dynamixel => {
                let mut servo = DynamixelServo::new(id, Plant::new(unit, self.options.load, start));

                if wrong_model {
                    servo.set_model(crate::dynamixel::table::MODEL_XL330_M288 + 1);
                }

                Box::new(servo)
            }
        };

        self.slots.push(Slot {
            firmware,
            powered: true,
            unit_seed,
            fitted_id: id,
        });
    }

    fn part_of(&self, id: u8) -> Option<&PartModel> {
        self.parts
            .iter()
            .find(|(part_id, _)| *part_id == id)
            .map(|(_, part)| part)
    }

    fn refit_renumbered(&mut self) {
        if self.parts.is_empty() {
            return;
        }

        let renumbered: Vec<usize> = (0..self.slots.len())
            .filter(|&k| self.slots[k].firmware.id() != self.slots[k].fitted_id)
            .collect();

        for k in renumbered {
            let id = self.slots[k].firmware.id();
            let unit = unit_for(self.family, self.part_of(id), self.slots[k].unit_seed, id);
            let slot = &mut self.slots[k];

            slot.firmware.plant_mut().unit = unit;
            slot.fitted_id = id;
        }
    }

    pub fn unit_of(&self, id: u8) -> Option<plant_bam::UnitParams> {
        self.servo(id).map(|servo| servo.plant().unit)
    }

    pub fn family(&self) -> Family {
        self.family
    }

    pub fn byte_micros(&self) -> u64 {
        self.options.byte_micros
    }

    pub fn frames_seen(&self) -> u64 {
        self.frames_seen
    }

    pub fn servo(&self, id: u8) -> Option<&dyn Firmware> {
        self.slots
            .iter()
            .find(|slot| slot.firmware.id() == id)
            .map(|slot| slot.firmware.as_ref())
    }

    pub fn servo_mut(&mut self, id: u8) -> Option<&mut (dyn Firmware + 'static)> {
        self.slots
            .iter_mut()
            .find(|slot| slot.firmware.id() == id)
            .map(|slot| slot.firmware.as_mut())
    }

    pub fn servo_ids(&self) -> Vec<u8> {
        self.slots.iter().map(|slot| slot.firmware.id()).collect()
    }

    pub fn force_volts(&mut self, volts: Option<f64>) {
        self.forced_volts = volts;
    }

    pub fn is_powered(&self, id: u8) -> bool {
        self.slots.iter().any(|slot| slot.firmware.id() == id && slot.powered)
    }

    pub fn bus_volts(&self) -> f64 {
        self.bus_volts
    }

    pub fn advance_to(&mut self, now_us: u64) {
        while self.stepped_to_us + STEP_US <= now_us {
            self.stepped_to_us += STEP_US;
            self.step_once(self.stepped_to_us);
        }
    }

    fn step_once(&mut self, now_us: u64) {
        let draw: f64 = self
            .slots
            .iter()
            .filter(|slot| slot.powered)
            .map(|slot| slot.firmware.current_amps())
            .sum();
        let source = self.forced_volts.unwrap_or(self.nominal_volts);
        let volts = (source - draw * self.options.supply_ohms).max(0.0);
        let dt_s = STEP_US as f64 * 1e-6;

        self.bus_volts = volts;

        for slot in &mut self.slots {
            step_slot(slot, volts, self.reset_volts, (dt_s, now_us));
        }
    }

    pub fn feed(&mut self, bytes: &[u8], now_us: u64) -> Vec<Timed> {
        self.advance_to(now_us);

        if now_us.saturating_sub(self.last_rx_us) > STALE_INBOX_US {
            self.inbox.clear();
        }

        self.last_rx_us = now_us;
        self.inbox.extend_from_slice(bytes);

        let mut replies = Vec::new();

        while self.scan_one(now_us, &mut replies) {}

        replies
    }

    fn scan_one(&mut self, now_us: u64, replies: &mut Vec<Timed>) -> bool {
        match self.family.scan(&self.inbox) {
            Scan::NeedMore => false,
            Scan::Skip(count) => {
                self.inbox.drain(..count);

                true
            }
            Scan::Corrupt { consumed } => {
                if let Some(reply) = self.corrupt_reply(now_us) {
                    replies.push(reply);
                }

                self.inbox.drain(..consumed);

                true
            }
            Scan::Frame(frame) => {
                self.inbox.drain(..frame.consumed);
                self.frames_seen += 1;

                let answers = self.dispatch(&frame, now_us);

                self.refit_renumbered();
                replies.extend(answers.into_iter().filter_map(|timed| self.damage_for_cli(timed)));

                true
            }
        }
    }

    fn corrupt_reply(&self, now_us: u64) -> Option<Timed> {
        if self.family != Family::Dynamixel {
            return None;
        }

        let id = *self.inbox.get(4)?;
        let slot = self
            .slots
            .iter()
            .find(|slot| slot.powered && slot.firmware.id() == id)?;

        Some(Timed {
            at_us: now_us + slot.firmware.return_delay_us(),
            bytes: dxl_wire::status_frame(id, dxl_wire::ERR_CRC, &[]),
        })
    }

    fn damage_for_cli(&self, timed: Timed) -> Option<Timed> {
        let Timed { at_us, mut bytes } = timed;

        match self.options.fault {
            CliFault::Silent => return None,
            CliFault::BadChecksum => {
                if let Some(last) = bytes.last_mut() {
                    *last ^= 0xFF;
                }
            }
            CliFault::Truncated => {
                let keep = bytes.len().saturating_sub(2);

                bytes.truncate(keep);
            }
            CliFault::WrongId => bytes = self.with_next_id(&bytes),
            CliFault::None | CliFault::WrongModel => {}
        }

        Some(Timed { at_us, bytes })
    }

    fn with_next_id(&self, bytes: &[u8]) -> Vec<u8> {
        let Scan::Frame(frame) = self.family.scan(bytes) else {
            return bytes.to_vec();
        };

        self.family.status_of(&frame).map_or_else(
            || bytes.to_vec(),
            |status| {
                self.family
                    .status_frame(status.id.wrapping_add(1), status.error, &status.data)
            },
        )
    }
}

fn step_slot(slot: &mut Slot, volts: f64, reset_volts: f64, timing: (f64, u64)) {
    let (dt_s, now_us) = timing;

    if volts < reset_volts {
        slot.powered = false;
        slot.firmware.plant_mut().step(
            plant_bam::DriveInput {
                duty: 0.0,
                enabled: false,
                bus_volts: volts,
            },
            dt_s,
        );

        return;
    }

    if !slot.powered {
        slot.powered = true;
        slot.firmware.power_cycle(now_us);
    }

    slot.firmware.step(dt_s, volts, now_us);
}
