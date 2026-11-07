use crate::registers::Registers;

pub const MODEL_STS3215: u16 = 777;

pub const FIRMWARE_MAJOR: u16 = 0;
pub const MODEL: u16 = 3;
pub const ID: u16 = 5;
pub const BAUD: u16 = 6;
pub const RETURN_DELAY: u16 = 7;
pub const RESPONSE_LEVEL: u16 = 8;
pub const MIN_ANGLE: u16 = 9;
pub const MAX_ANGLE: u16 = 11;
pub const MAX_TEMPERATURE: u16 = 13;
pub const MAX_VOLTAGE: u16 = 14;
pub const MIN_VOLTAGE: u16 = 15;
pub const MAX_TORQUE: u16 = 16;
pub const UNLOADING: u16 = 19;
pub const P_GAIN: u16 = 21;
pub const CW_DEAD: u16 = 26;
pub const CCW_DEAD: u16 = 27;
pub const PROTECTION_CURRENT: u16 = 28;
pub const OFFSET: u16 = 31;
pub const PROTECTIVE_TORQUE: u16 = 34;
pub const PROTECTION_TIME: u16 = 35;
pub const OVERLOAD_TORQUE: u16 = 36;
pub const OVERCURRENT_TIME: u16 = 38;
pub const TORQUE_ENABLE: u16 = 40;
pub const GOAL_POSITION: u16 = 42;
pub const GOAL_SPEED: u16 = 46;
pub const TORQUE_LIMIT: u16 = 48;
pub const LOCK: u16 = 55;
pub const PRESENT_POSITION: u16 = 56;
pub const PRESENT_SPEED: u16 = 58;
pub const PRESENT_LOAD: u16 = 60;
pub const PRESENT_VOLTAGE: u16 = 62;
pub const PRESENT_TEMPERATURE: u16 = 63;
pub const STATUS: u16 = 65;
pub const MOVING: u16 = 66;
pub const PRESENT_CURRENT: u16 = 69;

pub const EEPROM_END: u16 = 40;
pub const PRESENT_START: u16 = 56;
pub const PRESENT_END: u16 = 71;

pub const UNLOAD_OVERHEAT: u8 = 4;
pub const UNLOAD_CURRENT: u8 = 8;
pub const UNLOAD_OVERLOAD: u8 = 32;

pub const CURRENT_UNIT_AMPS: f64 = 0.0065;

pub fn factory(id: u8) -> Registers {
    let mut table = Registers::zeroed();

    table.set_u8(FIRMWARE_MAJOR, 3);
    table.set_u8(FIRMWARE_MAJOR + 1, 9);
    table.set_u16(MODEL, MODEL_STS3215);
    table.set_u8(ID, id);
    table.set_u8(BAUD, 0);
    table.set_u8(RETURN_DELAY, 0);
    table.set_u8(RESPONSE_LEVEL, 1);
    table.set_u16(MIN_ANGLE, 0);
    table.set_u16(MAX_ANGLE, 4095);
    table.set_u8(MAX_TEMPERATURE, 70);
    table.set_u8(MAX_VOLTAGE, 80);
    table.set_u8(MIN_VOLTAGE, 40);
    table.set_u16(MAX_TORQUE, 1000);
    table.set_u8(18, 12);
    table.set_u8(UNLOADING, UNLOAD_OVERHEAT | UNLOAD_CURRENT | UNLOAD_OVERLOAD);
    table.set_u8(20, 47);
    table.set_u8(P_GAIN, 32);
    table.set_u8(22, 32);
    table.set_u8(23, 0);
    table.set_u16(24, 16);
    table.set_u8(CW_DEAD, 1);
    table.set_u8(CCW_DEAD, 1);
    table.set_u16(PROTECTION_CURRENT, 500);
    table.set_u8(30, 1);
    table.set_u8(PROTECTIVE_TORQUE, 20);
    table.set_u8(PROTECTION_TIME, 200);
    table.set_u8(OVERLOAD_TORQUE, 80);
    table.set_u8(37, 10);
    table.set_u8(OVERCURRENT_TIME, 200);
    table.set_u8(39, 10);
    table.set_u16(TORQUE_LIMIT, 1000);
    table.set_u8(LOCK, 1);

    table
}
