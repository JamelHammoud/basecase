use crate::registers::Registers;

pub const MODEL_XL330_M288: u16 = 1200;

pub const MODEL: u16 = 0;
pub const FIRMWARE: u16 = 6;
pub const ID: u16 = 7;
pub const BAUD: u16 = 8;
pub const RETURN_DELAY: u16 = 9;
pub const DRIVE_MODE: u16 = 10;
pub const OPERATING_MODE: u16 = 11;
pub const SECONDARY_ID: u16 = 12;
pub const PROTOCOL_TYPE: u16 = 13;
pub const HOMING_OFFSET: u16 = 20;
pub const MOVING_THRESHOLD: u16 = 24;
pub const TEMPERATURE_LIMIT: u16 = 31;
pub const MAX_VOLTAGE: u16 = 32;
pub const MIN_VOLTAGE: u16 = 34;
pub const PWM_LIMIT: u16 = 36;
pub const CURRENT_LIMIT: u16 = 38;
pub const VELOCITY_LIMIT: u16 = 44;
pub const MAX_POSITION: u16 = 48;
pub const MIN_POSITION: u16 = 52;
pub const STARTUP: u16 = 60;
pub const PWM_SLOPE: u16 = 62;
pub const SHUTDOWN: u16 = 63;
pub const TORQUE_ENABLE: u16 = 64;
pub const LED: u16 = 65;
pub const STATUS_RETURN: u16 = 68;
pub const REGISTERED: u16 = 69;
pub const HARDWARE_ERROR: u16 = 70;
pub const VELOCITY_I: u16 = 76;
pub const VELOCITY_P: u16 = 78;
pub const POSITION_P: u16 = 84;
pub const BUS_WATCHDOG: u16 = 98;
pub const GOAL_PWM: u16 = 100;
pub const GOAL_CURRENT: u16 = 102;
pub const GOAL_VELOCITY: u16 = 104;
pub const PROFILE_ACCELERATION: u16 = 108;
pub const PROFILE_VELOCITY: u16 = 112;
pub const GOAL_POSITION: u16 = 116;
pub const REALTIME_TICK: u16 = 120;
pub const MOVING: u16 = 122;
pub const PRESENT_PWM: u16 = 124;
pub const PRESENT_CURRENT: u16 = 126;
pub const PRESENT_VELOCITY: u16 = 128;
pub const PRESENT_POSITION: u16 = 132;
pub const VELOCITY_TRAJECTORY: u16 = 136;
pub const POSITION_TRAJECTORY: u16 = 140;
pub const PRESENT_VOLTAGE: u16 = 144;
pub const PRESENT_TEMPERATURE: u16 = 146;

pub const EEPROM_END: u16 = 64;
pub const TABLE_END: u16 = 252;

pub const HW_VOLTAGE: u8 = 1;
pub const HW_OVERHEAT: u8 = 4;
pub const HW_SHOCK: u8 = 16;
pub const HW_OVERLOAD: u8 = 32;

pub const VELOCITY_UNIT_RAD_S: f64 = 0.229 * std::f64::consts::TAU / 60.0;
pub const PWM_FULL: f64 = 885.0;
pub const WATCHDOG_ERROR: u8 = 0xFF;

pub fn factory(id: u8) -> Registers {
    let mut table = Registers::zeroed();

    table.set_u16(MODEL, MODEL_XL330_M288);
    table.set_u8(FIRMWARE, 53);
    table.set_u8(ID, id);
    table.set_u8(BAUD, 1);
    table.set_u8(RETURN_DELAY, 250);
    table.set_u8(OPERATING_MODE, 3);
    table.set_u8(SECONDARY_ID, 255);
    table.set_u8(PROTOCOL_TYPE, 2);
    table.set_u32(MOVING_THRESHOLD, 10);
    table.set_u8(TEMPERATURE_LIMIT, 70);
    table.set_u16(MAX_VOLTAGE, 70);
    table.set_u16(MIN_VOLTAGE, 35);
    table.set_u16(PWM_LIMIT, 885);
    table.set_u16(CURRENT_LIMIT, 1750);
    table.set_u32(VELOCITY_LIMIT, 445);
    table.set_u32(MAX_POSITION, 4095);
    table.set_u32(MIN_POSITION, 0);
    table.set_u8(PWM_SLOPE, 140);
    table.set_u8(SHUTDOWN, 53);

    table
}

pub fn restore_ram(table: &mut Registers) {
    for address in EEPROM_END..=255 {
        table.set_u8(address, 0);
    }

    table.set_u8(STATUS_RETURN, 2);
    table.set_u16(VELOCITY_I, 1600);
    table.set_u16(VELOCITY_P, 180);
    table.set_u16(POSITION_P, 400);

    let pwm_limit = table.u16_at(PWM_LIMIT);
    let current_limit = table.u16_at(CURRENT_LIMIT);

    table.set_u16(GOAL_PWM, pwm_limit);
    table.set_u16(GOAL_CURRENT, current_limit);
}

pub fn is_read_only(address: u16) -> bool {
    matches!(
        address,
        0..=6 | 69..=70 | 120..=167
    )
}

pub fn is_goal(address: u16) -> bool {
    (GOAL_PWM..GOAL_POSITION + 4).contains(&address) && !(PROFILE_ACCELERATION..GOAL_POSITION).contains(&address)
}
