use super::table::{
    CCW_DEAD, CURRENT_UNIT_AMPS, CW_DEAD, GOAL_SPEED, MAX_ANGLE, MAX_TEMPERATURE, MAX_TORQUE, MAX_VOLTAGE, MIN_ANGLE,
    MIN_VOLTAGE, MOVING, OVERCURRENT_TIME, OVERLOAD_TORQUE, PRESENT_CURRENT, PRESENT_LOAD, PRESENT_POSITION,
    PRESENT_SPEED, PRESENT_TEMPERATURE, PRESENT_VOLTAGE, PROTECTION_CURRENT, PROTECTION_TIME, PROTECTIVE_TORQUE,
    P_GAIN, STATUS, TORQUE_ENABLE, TORQUE_LIMIT, UNLOADING, UNLOAD_CURRENT, UNLOAD_OVERHEAT, UNLOAD_OVERLOAD,
};
use super::{FeetechServo, Protection};
use crate::firmware::{counts_to_rad, rad_to_counts};
use crate::registers::sign_magnitude;
use plant_bam::DriveInput;
use servo_wire::feetech::{ERR_OVERCURRENT, ERR_OVERHEAT, ERR_OVERLOAD, ERR_VOLTAGE};

const CENTER_COUNTS: f64 = 2048.0;
const MOVING_THRESHOLD_COUNTS: i32 = 4;

impl FeetechServo {
    pub(super) fn control_step(&mut self, dt_s: f64, bus_volts: f64, now_us: u64) {
        let present = self.present_counts();
        let enabled = self.table.u8_at(TORQUE_ENABLE) != 0;
        let duty = if enabled {
            self.position_duty(present, dt_s, now_us)
        } else {
            0.0
        };

        self.plant.step(
            DriveInput {
                duty,
                enabled,
                bus_volts,
            },
            dt_s,
        );
        self.update_protection(duty, bus_volts, dt_s);
        self.refresh_present(duty, self.plant.current(), bus_volts);
    }

    fn position_duty(&mut self, present: f64, dt_s: f64, now_us: u64) -> f64 {
        let gains = self.plant.unit.gains;
        let goal = self.clamped_goal(now_us);
        let speed_counts = f64::from(self.table.u16_at(GOAL_SPEED) & 0x7FFF);
        let max_speed = if speed_counts > 0.0 {
            counts_to_rad(speed_counts).min(gains.max_velocity)
        } else {
            gains.max_velocity
        };
        let target = self
            .smoother
            .next(counts_to_rad(goal), counts_to_rad(present), max_speed * dt_s);
        let error_counts = rad_to_counts(target) - present;
        let dead = if error_counts > 0.0 {
            self.table.u8_at(CCW_DEAD)
        } else {
            self.table.u8_at(CW_DEAD)
        };

        if error_counts.abs() <= f64::from(dead) {
            return 0.0;
        }

        let kp = f64::from(self.table.u8_at(P_GAIN));
        let duty = counts_to_rad(error_counts) * kp * gains.error_gain * gains.error_gain_ratio;
        let limit = self.output_limit() * gains.max_duty;

        duty.clamp(-limit, limit)
    }

    fn clamped_goal(&mut self, now_us: u64) -> f64 {
        let low = f64::from(self.table.u16_at(MIN_ANGLE));
        let high = f64::from(self.table.u16_at(MAX_ANGLE));
        let goal = f64::from(self.goal.value_at(now_us));

        if high > low {
            goal.clamp(low, high)
        } else {
            goal
        }
    }

    fn output_limit(&self) -> f64 {
        let eeprom_limit = f64::from(self.table.u16_at(MAX_TORQUE)).min(1000.0) / 1000.0;
        let ram_limit = f64::from(self.table.u16_at(TORQUE_LIMIT)).min(1000.0) / 1000.0;
        let base = eeprom_limit.min(ram_limit);

        match self.protection {
            Protection::None => base,
            Protection::Overload => base.min(f64::from(self.table.u8_at(PROTECTIVE_TORQUE)) / 100.0),
            Protection::Overcurrent => 0.0,
        }
    }

    fn update_protection(&mut self, duty: f64, bus_volts: f64, dt_s: f64) {
        let unloading = self.table.u8_at(UNLOADING);
        let load_percent = duty.abs() / self.plant.unit.gains.max_duty * 100.0;
        let overload_trip = f64::from(self.table.u8_at(OVERLOAD_TORQUE));
        let overload_hold_s = f64::from(self.table.u8_at(PROTECTION_TIME)) * 0.01;
        let current_trip = f64::from(self.table.u16_at(PROTECTION_CURRENT)) * CURRENT_UNIT_AMPS;
        let current_hold_s = f64::from(self.table.u8_at(OVERCURRENT_TIME)) * 0.01;
        let overloaded = self.overload_timer.update(load_percent >= overload_trip, dt_s) >= overload_hold_s;
        let overcurrent = self
            .current_timer
            .update(self.plant.current().abs() >= current_trip, dt_s)
            >= current_hold_s;
        let mut status = self.table.u8_at(STATUS);

        if overloaded {
            status |= ERR_OVERLOAD;
            self.raise(Protection::Overload, unloading & UNLOAD_OVERLOAD != 0);
        }

        if overcurrent {
            status |= ERR_OVERCURRENT;
            self.raise(Protection::Overcurrent, unloading & UNLOAD_CURRENT != 0);
        }

        status = self.temperature_status(status, unloading);
        status = self.voltage_status(status, bus_volts);
        self.table.set_u8(STATUS, status);
    }

    fn raise(&mut self, level: Protection, unload_allowed: bool) {
        if !unload_allowed || self.protection == Protection::Overcurrent {
            return;
        }

        self.protection = level;
    }

    fn temperature_status(&mut self, status: u8, unloading: u8) -> u8 {
        if self.plant.temperature_c() < f64::from(self.table.u8_at(MAX_TEMPERATURE)) {
            return status & !ERR_OVERHEAT;
        }

        if unloading & UNLOAD_OVERHEAT != 0 {
            self.table.set_u8(TORQUE_ENABLE, 0);
        }

        status | ERR_OVERHEAT
    }

    fn voltage_status(&self, status: u8, bus_volts: f64) -> u8 {
        let volts_tenths = (bus_volts * 10.0).round();
        let low = f64::from(self.table.u8_at(MIN_VOLTAGE));
        let high = f64::from(self.table.u8_at(MAX_VOLTAGE));

        if volts_tenths < low || volts_tenths > high {
            status | ERR_VOLTAGE
        } else {
            status & !ERR_VOLTAGE
        }
    }

    pub(super) fn refresh_present(&mut self, duty: f64, current: f64, bus_volts: f64) {
        let present = self.present_counts();
        let speed_counts = rad_to_counts(self.plant.velocity()).round() as i32;
        let load = (duty / self.plant.unit.gains.max_duty * 1000.0).round() as i32;
        let current_units = (current / CURRENT_UNIT_AMPS).round() as i32;

        self.table.set_u16(PRESENT_POSITION, present as u16);
        self.table.set_u16(PRESENT_SPEED, sign_magnitude(speed_counts, 15));
        self.table.set_u16(PRESENT_LOAD, sign_magnitude(load, 10));
        self.table
            .set_u8(PRESENT_VOLTAGE, (bus_volts * 10.0).round().clamp(0.0, 255.0) as u8);
        self.table.set_u8(
            PRESENT_TEMPERATURE,
            self.plant.temperature_c().round().clamp(0.0, 255.0) as u8,
        );
        self.table
            .set_u8(MOVING, u8::from(speed_counts.abs() > MOVING_THRESHOLD_COUNTS));
        self.table.set_u16(PRESENT_CURRENT, sign_magnitude(current_units, 15));
    }

    fn present_counts(&self) -> f64 {
        let raw =
            rad_to_counts(self.plant.encoder_position()).round() + CENTER_COUNTS - f64::from(self.offset_counts());

        raw.rem_euclid(4096.0)
    }
}
