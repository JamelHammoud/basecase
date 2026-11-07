use crate::damage::ReplyDamage;
use crate::schedule::{Fault, Schedule};
use crate::tap::Tap;
use plant_bam::SplitMix;
use servo_emu::{InProcessBus, SharedBus};
use servo_wire::{ByteTransport, Clock, Family, TransportError};
use std::sync::{Arc, Mutex};

pub struct FaultyBus {
    inner: InProcessBus,
    bus: SharedBus,
    clock: Arc<dyn Clock>,
    schedule: Schedule,
    damage: Arc<Mutex<ReplyDamage>>,
    tap: Tap,
    adapter_gone: bool,
    brownout_ends_at: Option<u64>,
    latency_ends_at: Option<u64>,
}

impl FaultyBus {
    pub fn new(mut inner: InProcessBus, schedule: Schedule, seed: u64) -> Self {
        let bus = inner.bus();
        let clock = inner.clock();
        let family = bus.lock().map(|bus| bus.family()).unwrap_or(Family::Feetech);
        let damage = Arc::new(Mutex::new(ReplyDamage::default()));
        let filter_damage = damage.clone();
        let mut rng = SplitMix::new(seed);

        inner.set_reply_filter(Box::new(move |reply| {
            filter_damage
                .lock()
                .ok()
                .and_then(|mut damage| damage.apply(family, &mut rng, reply))
        }));

        Self {
            inner,
            bus,
            clock,
            schedule,
            damage,
            tap: Tap::new(),
            adapter_gone: false,
            brownout_ends_at: None,
            latency_ends_at: None,
        }
    }

    pub fn tap(&self) -> Tap {
        self.tap.clone()
    }

    pub fn bus(&self) -> SharedBus {
        self.bus.clone()
    }

    fn apply_due(&mut self) {
        let now = self.clock.now_micros();

        self.end_expired(now);

        for fault in self.schedule.take_due(now) {
            self.start(fault, now);
        }
    }

    fn end_expired(&mut self, now: u64) {
        if self.brownout_ends_at.is_some_and(|end| now >= end) {
            self.brownout_ends_at = None;
            self.with_bus(|bus| bus.force_volts(None));
        }

        if self.latency_ends_at.is_some_and(|end| now >= end) {
            self.latency_ends_at = None;
            self.with_damage(|damage| damage.extra_latency_us = 0);
        }
    }

    fn start(&mut self, fault: Fault, now: u64) {
        match fault {
            Fault::UnplugMidPacket { after_reply_bytes } => {
                self.with_damage(|damage| damage.cut_after = Some(after_reply_bytes));
                self.with_bus(|bus| bus.force_volts(Some(0.0)));
            }
            Fault::AdapterGone => self.adapter_gone = true,
            Fault::Brownout { volts, duration_us } => {
                self.brownout_ends_at = Some(now + duration_us);
                self.with_bus(|bus| bus.force_volts(Some(volts)));
            }
            Fault::BitFlip { replies } => self.with_damage(|damage| damage.flips_left += replies),
            Fault::Truncate { replies } => self.with_damage(|damage| damage.truncations_left += replies),
            Fault::WrongIdReply { replies } => self.with_damage(|damage| damage.wrong_ids_left += replies),
            Fault::LatencySpike { extra_us, duration_us } => {
                self.latency_ends_at = Some(now + duration_us);
                self.with_damage(|damage| damage.extra_latency_us = extra_us);
            }
            Fault::DuplicateId { id } => self.with_bus(|bus| bus.add_servo_at(id, 0.05)),
            servo_fault => self.start_servo_fault(servo_fault),
        }
    }

    fn start_servo_fault(&mut self, fault: Fault) {
        self.with_bus(|bus| match fault {
            Fault::StuckMotor { id } => {
                if let Some(servo) = bus.servo_mut(id) {
                    servo.plant_mut().faults.stuck = true;
                }
            }
            Fault::Overheat { id, watts } => {
                if let Some(servo) = bus.servo_mut(id) {
                    servo.plant_mut().faults.extra_heat_watts = watts;
                }
            }
            Fault::InvertedDirection { id } => {
                if let Some(servo) = bus.servo_mut(id) {
                    servo.plant_mut().faults.inverted_drive = true;
                }
            }
            Fault::FirmwareMismatch { id, version } => {
                if let Some(servo) = bus.servo_mut(id) {
                    servo.set_firmware_version(version);
                }
            }
            _ => {}
        });
    }

    fn with_bus(&self, change: impl FnOnce(&mut servo_emu::ServoBus)) {
        if let Ok(mut bus) = self.bus.lock() {
            change(&mut bus);
        }
    }

    fn with_damage(&self, change: impl FnOnce(&mut ReplyDamage)) {
        if let Ok(mut damage) = self.damage.lock() {
            change(&mut damage);
        }
    }
}

impl ByteTransport for FaultyBus {
    fn write_bytes(&mut self, bytes: &[u8]) -> Result<(), TransportError> {
        self.apply_due();
        self.tap.record(self.clock.now_micros(), bytes);

        if self.adapter_gone {
            return Err(TransportError::Disconnected);
        }

        self.inner.write_bytes(bytes)
    }

    fn read_bytes(&mut self, out: &mut [u8], timeout_micros: u64) -> Result<usize, TransportError> {
        self.apply_due();

        if self.adapter_gone {
            return Err(TransportError::Disconnected);
        }

        self.inner.read_bytes(out, timeout_micros)
    }
}
