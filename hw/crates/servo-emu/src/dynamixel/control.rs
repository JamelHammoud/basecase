use super::table::{
    BUS_WATCHDOG, GOAL_POSITION, GOAL_PWM, HARDWARE_ERROR, HOMING_OFFSET, HW_OVERHEAT, HW_OVERLOAD, HW_VOLTAGE,
    MAX_VOLTAGE, MIN_VOLTAGE, MOVING, MOVING_THRESHOLD, POSITION_P, POSITION_TRAJECTORY, PRESENT_CURRENT,
    PRESENT_POSITION, PRESENT_PWM, PRESENT_TEMPERATURE, PRESENT_VELOCITY, PRESENT_VOLTAGE, PROFILE_VELOCITY, PWM_FULL,
    PWM_LIMIT, REALTIME_TICK, SHUTDOWN, TEMPERATURE_LIMIT, TORQUE_ENABLE, VELOCITY_LIMIT, VELOCITY_TRAJECTORY,
    VELOCITY_UNIT_RAD_S, WATCHDOG_ERROR,
};
use super::DynamixelServo;
use crate::firmware::{counts_to_rad, rad_to_counts};
use plant_bam::DriveInput;

const CENTER_COUNTS: f64 = 2048.0;
const OVERLOAD_DUTY: f64 = 0.8;
const OVERLOAD_HOLD_S: f64 = 3.0;

impl DynamixelServo {
    pub(super) fn control_step(&mut self, dt_s: f64, bus_volts: f64, now_us: u64) {
        self.check_watchdog(now_us);

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
        self.check_hardware(duty, bus_volts, dt_s);
        self.refresh_present(duty, self.plant.current(), bus_volts, now_us);
    }

    fn check_watchdog(&mut self, now_us: u64) {
        let setting = self.table.u8_at(BUS_WATCHDOG);
        let armed = setting != 0 && setting != WATCHDOG_ERROR && self.table.u8_at(TORQUE_ENABLE) != 0;
        let limit_us = u64::from(setting) * 20_000;

        if !armed || now_us.saturating_sub(self.last_instruction_us) <= limit_us {
            return;
        }

        let present = self.table.u32_at(PRESENT_POSITION);

        self.table.set_u8(BUS_WATCHDOG, WATCHDOG_ERROR);
        self.table.set_u32(GOAL_POSITION, present);
        self.goal.set_now(present as i32);
        self.smoother.reset();
    }

    fn position_duty(&mut self, present: f64, dt_s: f64, now_us: u64) -> f64 {
        let gains = self.plant.unit.gains;
        let goal = f64::from(self.goal.value_at(now_us));
        let profile = f64::from(self.table.u32_at(PROFILE_VELOCITY));
        let limit = f64::from(self.table.u32_at(VELOCITY_LIMIT));
        let max_speed = if profile > 0.0 { profile.min(limit) } else { limit } * VELOCITY_UNIT_RAD_S;
        let target = self
            .smoother
            .next(counts_to_rad(goal), counts_to_rad(present), max_speed * dt_s);
        let error = target - counts_to_rad(present);
        let kp = f64::from(self.table.u16_at(POSITION_P));
        let duty = error * kp * gains.error_gain * gains.error_gain_ratio;
        let pwm = f64::from(self.table.u16_at(GOAL_PWM)).min(f64::from(self.table.u16_at(PWM_LIMIT)));
        let bound = pwm / PWM_FULL * gains.max_duty;

        duty.clamp(-bound, bound)
    }

    fn check_hardware(&mut self, duty: f64, bus_volts: f64, dt_s: f64) {
        let shutdown = self.table.u8_at(SHUTDOWN);
        let overloaded = self.overload_timer.update(duty.abs() >= OVERLOAD_DUTY, dt_s) >= OVERLOAD_HOLD_S;
        let overheated = self.plant.temperature_c() > f64::from(self.table.u8_at(TEMPERATURE_LIMIT));
        let volts_tenths = (bus_volts * 10.0).round();
        let voltage_bad = volts_tenths < f64::from(self.table.u16_at(MIN_VOLTAGE))
            || volts_tenths > f64::from(self.table.u16_at(MAX_VOLTAGE));
        let mut errors = self.table.u8_at(HARDWARE_ERROR);

        if overloaded {
            errors |= HW_OVERLOAD;
        }

        if overheated {
            errors |= HW_OVERHEAT;
        }

        if voltage_bad {
            errors |= HW_VOLTAGE;
        }

        self.table.set_u8(HARDWARE_ERROR, errors);

        if errors & shutdown != 0 {
            self.table.set_u8(TORQUE_ENABLE, 0);
        }
    }

    pub(super) fn refresh_present(&mut self, duty: f64, current: f64, bus_volts: f64, now_us: u64) {
        let present = self.present_counts();
        let velocity_units = (self.plant.velocity() / VELOCITY_UNIT_RAD_S).round() as i32;
        let threshold = i32::try_from(self.table.u32_at(MOVING_THRESHOLD)).unwrap_or(i32::MAX);

        self.table.set_u16(REALTIME_TICK, ((now_us / 1000) % 32_768) as u16);
        self.table.set_u8(MOVING, u8::from(velocity_units.abs() > threshold));
        self.table
            .set_u16(PRESENT_PWM, ((duty * PWM_FULL).round() as i16) as u16);
        self.table
            .set_u16(PRESENT_CURRENT, ((current * 1000.0).round() as i16) as u16);
        self.table.set_u32(PRESENT_VELOCITY, velocity_units as u32);
        self.table.set_u32(PRESENT_POSITION, present as i32 as u32);
        self.table.set_u32(VELOCITY_TRAJECTORY, velocity_units as u32);
        self.table.set_u32(
            POSITION_TRAJECTORY,
            rad_to_counts(self.plant.encoder_position()) as i32 as u32,
        );
        self.table
            .set_u16(PRESENT_VOLTAGE, (bus_volts * 10.0).round().clamp(0.0, 65535.0) as u16);
        self.table.set_u8(
            PRESENT_TEMPERATURE,
            self.plant.temperature_c().round().clamp(0.0, 255.0) as u8,
        );
    }

    fn present_counts(&self) -> f64 {
        let offset = self.table.u32_at(HOMING_OFFSET) as i32;

        rad_to_counts(self.plant.encoder_position()).round() + CENTER_COUNTS + f64::from(offset)
    }
}
