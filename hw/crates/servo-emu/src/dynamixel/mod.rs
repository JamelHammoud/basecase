mod control;
pub mod table;

use crate::firmware::{DelayedGoal, Firmware, SustainTimer, TargetSmoother};
use crate::registers::Registers;
use plant_bam::Plant;
use servo_wire::dynamixel::{
    self as wire, ERR_ACCESS, ERR_ALERT, ERR_DATA_LENGTH, ERR_DATA_LIMIT, ERR_DATA_RANGE, ERR_INSTRUCTION,
    ERR_RESULT_FAIL, OP_ACTION, OP_CLEAR, OP_FACTORY_RESET, OP_PING, OP_READ, OP_REBOOT, OP_REG_WRITE, OP_WRITE,
};
use servo_wire::Frame;
use table::{
    BUS_WATCHDOG, EEPROM_END, GOAL_POSITION, HARDWARE_ERROR, ID, MAX_POSITION, MIN_POSITION, REGISTERED, RETURN_DELAY,
    STATUS_RETURN, TABLE_END, TORQUE_ENABLE, WATCHDOG_ERROR,
};

pub struct DynamixelServo {
    table: Registers,
    factory_id: u8,
    saved_eeprom: Registers,
    plant: Plant,
    goal: DelayedGoal,
    smoother: TargetSmoother,
    overload_timer: SustainTimer,
    registered: Option<(u16, Vec<u8>)>,
    last_instruction_us: u64,
    reboot_pending: bool,
}

impl DynamixelServo {
    pub fn new(id: u8, plant: Plant) -> Self {
        let table = table::factory(id);
        let mut servo = Self {
            saved_eeprom: table.clone(),
            factory_id: id,
            table,
            plant,
            goal: DelayedGoal::new(0),
            smoother: TargetSmoother::new(),
            overload_timer: SustainTimer::new(),
            registered: None,
            last_instruction_us: 0,
            reboot_pending: false,
        };

        servo.restart_ram(0);

        servo
    }

    pub fn set_model(&mut self, model: u16) {
        self.table.set_u16(table::MODEL, model);
        self.saved_eeprom.set_u16(table::MODEL, model);
    }

    fn restart_ram(&mut self, now_us: u64) {
        table::restore_ram(&mut self.table);
        self.refresh_present(0.0, 0.0, 5.0, now_us);

        let present = self.table.u32_at(table::PRESENT_POSITION);

        self.table.set_u32(GOAL_POSITION, present);
        self.goal.set_now(present as i32);
        self.smoother.reset();
        self.overload_timer.reset();
        self.registered = None;
        self.last_instruction_us = now_us;
    }

    fn try_write(&mut self, address: u16, data: &[u8], now_us: u64) -> u8 {
        let refusal = self.write_refusal(address, data);

        if refusal != 0 {
            return refusal;
        }

        let writes_torque = (address..address + data.len() as u16).contains(&TORQUE_ENABLE);
        let writes_position = (address..address + data.len() as u16).contains(&GOAL_POSITION);

        for (offset, byte) in (0u16..).zip(data) {
            self.write_byte(address + offset, *byte);
        }

        if writes_position {
            let delay_us = (self.plant.unit.gains.command_delay_s * 1e6) as u64;

            self.goal
                .write(self.table.u32_at(GOAL_POSITION) as i32, now_us + delay_us);
        }

        if writes_torque {
            self.smoother.reset();
        }

        0
    }

    fn write_refusal(&self, address: u16, data: &[u8]) -> u8 {
        let end = address + data.len() as u16;

        if data.is_empty() || end > TABLE_END {
            return ERR_DATA_LENGTH;
        }

        for touched in address..end {
            if table::is_read_only(touched) {
                return ERR_ACCESS;
            }

            if touched < EEPROM_END && self.torque_enabled() {
                return ERR_ACCESS;
            }

            if table::is_goal(touched) && self.table.u8_at(BUS_WATCHDOG) == WATCHDOG_ERROR {
                return ERR_DATA_RANGE;
            }
        }

        self.value_refusal(address, data)
    }

    fn value_refusal(&self, address: u16, data: &[u8]) -> u8 {
        if address == TORQUE_ENABLE && data.first() == Some(&1) && self.table.u8_at(HARDWARE_ERROR) != 0 {
            return ERR_RESULT_FAIL;
        }

        if address == GOAL_POSITION && data.len() >= 4 {
            let goal = i32::from_le_bytes([data[0], data[1], data[2], data[3]]);
            let low = self.table.u32_at(MIN_POSITION) as i32;
            let high = self.table.u32_at(MAX_POSITION) as i32;

            if goal < low || goal > high {
                return ERR_DATA_LIMIT;
            }
        }

        0
    }

    fn write_byte(&mut self, address: u16, byte: u8) {
        self.table.set_u8(address, byte);

        if address < EEPROM_END {
            self.saved_eeprom.set_u8(address, byte);
        }
    }

    fn alert_bit(&self) -> u8 {
        if self.table.u8_at(HARDWARE_ERROR) != 0 {
            ERR_ALERT
        } else {
            0
        }
    }

    fn status_reply(&self, error: u8, data: &[u8]) -> Vec<u8> {
        wire::status_frame(self.id(), error | self.alert_bit(), data)
    }

    fn acknowledge(&self, error: u8) -> Option<Vec<u8>> {
        (self.table.u8_at(STATUS_RETURN) >= 2).then(|| self.status_reply(error, &[]))
    }

    fn handle_ping(&self) -> Vec<u8> {
        let [model_low, model_high] = self.table.u16_at(table::MODEL).to_le_bytes();

        self.status_reply(0, &[model_low, model_high, self.table.u8_at(table::FIRMWARE)])
    }

    fn handle_read(&self, frame: &Frame) -> Option<Vec<u8>> {
        let [address_low, address_high, length_low, length_high] = frame.params.as_slice() else {
            return (self.table.u8_at(STATUS_RETURN) >= 1).then(|| self.status_reply(ERR_DATA_LENGTH, &[]));
        };
        let address = u16::from_le_bytes([*address_low, *address_high]);
        let length = u16::from_le_bytes([*length_low, *length_high]);

        if self.table.u8_at(STATUS_RETURN) < 1 {
            return None;
        }

        if u32::from(address) + u32::from(length) > u32::from(TABLE_END) {
            return Some(self.status_reply(ERR_ACCESS, &[]));
        }

        Some(self.status_reply(0, &self.table.slice(address, length)))
    }

    fn handle_write(&mut self, frame: &Frame, now_us: u64) -> Option<Vec<u8>> {
        let [address_low, address_high, data @ ..] = frame.params.as_slice() else {
            return self.acknowledge(ERR_DATA_LENGTH);
        };
        let error = self.try_write(u16::from_le_bytes([*address_low, *address_high]), data, now_us);

        self.acknowledge(error)
    }

    fn handle_reg_write(&mut self, frame: &Frame) -> Option<Vec<u8>> {
        let [address_low, address_high, data @ ..] = frame.params.as_slice() else {
            return self.acknowledge(ERR_DATA_LENGTH);
        };

        self.registered = Some((u16::from_le_bytes([*address_low, *address_high]), data.to_vec()));
        self.table.set_u8(REGISTERED, 1);

        self.acknowledge(0)
    }

    fn handle_action(&mut self, now_us: u64) -> Option<Vec<u8>> {
        let Some((address, data)) = self.registered.take() else {
            return self.acknowledge(ERR_INSTRUCTION);
        };
        let error = self.try_write(address, &data, now_us);

        self.table.set_u8(REGISTERED, 0);

        self.acknowledge(error)
    }

    fn handle_reboot(&mut self) -> Option<Vec<u8>> {
        self.reboot_pending = true;

        self.acknowledge(0)
    }

    fn handle_factory_reset(&mut self) -> Option<Vec<u8>> {
        self.table = table::factory(self.factory_id);
        self.saved_eeprom = self.table.clone();
        self.reboot_pending = true;

        self.acknowledge(0)
    }
}

impl Firmware for DynamixelServo {
    fn id(&self) -> u8 {
        self.table.u8_at(ID)
    }

    fn respond(&mut self, frame: &Frame, now_us: u64) -> Option<Vec<u8>> {
        self.last_instruction_us = now_us;

        match frame.code {
            OP_PING => Some(self.handle_ping()),
            OP_READ => self.handle_read(frame),
            OP_WRITE => self.handle_write(frame, now_us),
            OP_REG_WRITE => self.handle_reg_write(frame),
            OP_ACTION => self.handle_action(now_us),
            OP_REBOOT => self.handle_reboot(),
            OP_FACTORY_RESET => self.handle_factory_reset(),
            OP_CLEAR => self.acknowledge(0),
            _ => self.acknowledge(ERR_INSTRUCTION),
        }
    }

    fn sync_read_reply(&mut self, address: u16, length: u16, now_us: u64) -> Vec<u8> {
        self.last_instruction_us = now_us;

        self.status_reply(0, &self.table.slice(address, length))
    }

    fn sync_write(&mut self, address: u16, data: &[u8], now_us: u64) {
        self.last_instruction_us = now_us;
        self.try_write(address, data, now_us);
    }

    fn step(&mut self, dt_s: f64, bus_volts: f64, now_us: u64) {
        if self.reboot_pending {
            self.reboot_pending = false;
            self.power_cycle(now_us);
        }

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
        self.restart_ram(now_us);
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
        self.table.set_u8(table::FIRMWARE, version);
        self.saved_eeprom.set_u8(table::FIRMWARE, version);
    }

    fn register(&self, address: u16) -> u8 {
        self.table.u8_at(address)
    }
}
