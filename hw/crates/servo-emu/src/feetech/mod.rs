mod control;
pub mod table;

use crate::firmware::{DelayedGoal, Firmware, SustainTimer, TargetSmoother};
use crate::registers::{from_sign_magnitude, Registers};
use plant_bam::Plant;
use servo_wire::feetech::{self as wire, OP_ACTION, OP_PING, OP_READ, OP_REG_WRITE, OP_RESET, OP_WRITE};
use servo_wire::Frame;
use table::{
    EEPROM_END, GOAL_POSITION, ID, LOCK, PRESENT_END, PRESENT_POSITION, PRESENT_START, RESPONSE_LEVEL, RETURN_DELAY,
    STATUS, TORQUE_ENABLE,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Protection {
    None,
    Overload,
    Overcurrent,
}

pub struct FeetechServo {
    table: Registers,
    saved_eeprom: Registers,
    plant: Plant,
    goal: DelayedGoal,
    smoother: TargetSmoother,
    protection: Protection,
    overload_timer: SustainTimer,
    current_timer: SustainTimer,
    registered: Option<(u16, Vec<u8>)>,
    goal_write_enables_torque: bool,
    powered_on_at_us: u64,
}

impl FeetechServo {
    pub fn new(id: u8, plant: Plant) -> Self {
        let table = table::factory(id);
        let mut servo = Self {
            saved_eeprom: table.clone(),
            table,
            plant,
            goal: DelayedGoal::new(0),
            smoother: TargetSmoother::new(),
            protection: Protection::None,
            overload_timer: SustainTimer::new(),
            current_timer: SustainTimer::new(),
            registered: None,
            goal_write_enables_torque: true,
            powered_on_at_us: 0,
        };

        servo.restart_ram();

        servo
    }

    pub fn set_goal_write_enables_torque(&mut self, enabled: bool) {
        self.goal_write_enables_torque = enabled;
    }

    pub fn set_model(&mut self, model: u16) {
        self.table.set_u16(table::MODEL, model);
        self.saved_eeprom.set_u16(table::MODEL, model);
    }

    fn restart_ram(&mut self) {
        for address in EEPROM_END..=255 {
            self.table.set_u8(address, 0);
        }

        self.table.set_u16(table::TORQUE_LIMIT, 1000);
        self.table.set_u8(LOCK, 1);
        self.refresh_present(0.0, 0.0, 7.4);

        let present = i32::from(self.table.u16_at(PRESENT_POSITION));

        self.table.set_u16(GOAL_POSITION, u16::try_from(present).unwrap_or(0));
        self.goal.set_now(present);
        self.smoother.reset();
        self.protection = Protection::None;
        self.overload_timer.reset();
        self.current_timer.reset();
        self.registered = None;
    }

    fn offset_counts(&self) -> i32 {
        from_sign_magnitude(self.table.u16_at(table::OFFSET), 11)
    }

    fn apply_write(&mut self, address: u16, data: &[u8], now_us: u64) {
        let writes_goal = spans(address, data.len(), GOAL_POSITION, 6);
        let writes_position = spans(address, data.len(), GOAL_POSITION, 2);
        let writes_torque = spans(address, data.len(), TORQUE_ENABLE, 1);

        for (offset, byte) in (0u16..).zip(data) {
            self.write_byte(address.wrapping_add(offset), *byte);
        }

        if writes_goal || writes_torque {
            self.clear_protection();
        }

        if writes_position {
            self.accept_goal(now_us);
        }

        if writes_torque {
            self.smoother.reset();
        }
    }

    fn write_byte(&mut self, address: u16, byte: u8) {
        if address < ID || (PRESENT_START..PRESENT_END).contains(&address) {
            return;
        }

        self.table.set_u8(address, byte);

        if address < EEPROM_END && self.table.u8_at(LOCK) == 0 {
            self.saved_eeprom.set_u8(address, byte);
        }
    }

    fn accept_goal(&mut self, now_us: u64) {
        let delay_us = (self.plant.unit.gains.command_delay_s * 1e6) as u64;
        let goal = i32::from(self.table.u16_at(GOAL_POSITION) & 0x7FFF);

        self.goal.write(goal, now_us + delay_us);

        if self.goal_write_enables_torque && self.table.u8_at(TORQUE_ENABLE) == 0 {
            self.table.set_u8(TORQUE_ENABLE, 1);
            self.smoother.reset();
        }
    }

    fn clear_protection(&mut self) {
        self.protection = Protection::None;
        self.overload_timer.reset();
        self.current_timer.reset();

        let status = self.table.u8_at(STATUS);

        self.table
            .set_u8(STATUS, status & !(wire::ERR_OVERLOAD | wire::ERR_OVERCURRENT));
    }

    fn status_reply(&self, data: &[u8]) -> Vec<u8> {
        wire::status_frame(self.id(), self.table.u8_at(STATUS), data)
    }

    fn answers_writes(&self) -> bool {
        self.table.u8_at(RESPONSE_LEVEL) != 0
    }

    fn take_address_data(params: &[u8]) -> Option<(u16, &[u8])> {
        let (address, data) = params.split_first()?;

        Some((u16::from(*address), data))
    }

    fn acknowledge(&self) -> Option<Vec<u8>> {
        self.answers_writes().then(|| self.status_reply(&[]))
    }

    fn handle_write(&mut self, frame: &Frame, now_us: u64) -> Option<Vec<u8>> {
        let (address, data) = Self::take_address_data(&frame.params)?;

        self.apply_write(address, data, now_us);

        self.acknowledge()
    }

    fn handle_reg_write(&mut self, frame: &Frame) -> Option<Vec<u8>> {
        let (address, data) = Self::take_address_data(&frame.params)?;

        self.registered = Some((address, data.to_vec()));

        self.acknowledge()
    }

    fn handle_action(&mut self, now_us: u64) -> Option<Vec<u8>> {
        if let Some((address, data)) = self.registered.take() {
            self.apply_write(address, &data, now_us);
        }

        self.acknowledge()
    }

    fn handle_read(&self, frame: &Frame) -> Option<Vec<u8>> {
        let [address, length] = frame.params.as_slice() else {
            return None;
        };

        Some(self.status_reply(&self.table.slice(u16::from(*address), u16::from(*length))))
    }
}

fn spans(address: u16, length: usize, target: u16, target_length: u16) -> bool {
    let end = usize::from(address) + length;

    usize::from(address) < usize::from(target + target_length) && end > usize::from(target)
}

impl Firmware for FeetechServo {
    fn id(&self) -> u8 {
        self.table.u8_at(ID)
    }

    fn respond(&mut self, frame: &Frame, now_us: u64) -> Option<Vec<u8>> {
        match frame.code {
            OP_PING => Some(self.status_reply(&[])),
            OP_READ => self.handle_read(frame),
            OP_WRITE => self.handle_write(frame, now_us),
            OP_REG_WRITE => self.handle_reg_write(frame),
            OP_ACTION => self.handle_action(now_us),
            OP_RESET => self.acknowledge(),
            _ => None,
        }
    }

    fn sync_read_reply(&mut self, address: u16, length: u16, _now_us: u64) -> Vec<u8> {
        self.status_reply(&self.table.slice(address, length))
    }

    fn sync_write(&mut self, address: u16, data: &[u8], now_us: u64) {
        self.apply_write(address, data, now_us);
    }

    fn step(&mut self, dt_s: f64, bus_volts: f64, now_us: u64) {
        self.control_step(dt_s, bus_volts, now_us);
    }

    fn current_amps(&self) -> f64 {
        self.plant.current().abs()
    }

    fn return_delay_us(&self) -> u64 {
        u64::from(self.table.u8_at(RETURN_DELAY)) * 2
    }

    fn power_cycle(&mut self, now_us: u64) {
        self.table = self.saved_eeprom.clone();
        self.powered_on_at_us = now_us;
        self.restart_ram();
    }

    fn plant_mut(&mut self) -> &mut Plant {
        &mut self.plant
    }

    fn plant(&self) -> &Plant {
        &self.plant
    }

    fn torque_enabled(&self) -> bool {
        self.table.u8_at(TORQUE_ENABLE) != 0
    }

    fn set_firmware_version(&mut self, version: u8) {
        self.table.set_u8(table::FIRMWARE_MAJOR, version);
        self.saved_eeprom.set_u8(table::FIRMWARE_MAJOR, version);
    }

    fn register(&self, address: u16) -> u8 {
        self.table.u8_at(address)
    }
}
