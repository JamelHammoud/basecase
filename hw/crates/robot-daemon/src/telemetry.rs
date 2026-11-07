use crate::safety::Reply;
use servo_wire::{Family, Status};
use std::f32::consts::TAU;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Telemetry {
    pub id: u8,
    pub torque_on: bool,
    pub goal: i32,
    pub position: i32,
    pub velocity_rad_s: f32,
    pub load_fraction: f32,
    pub volts: f32,
    pub temp_c: f32,
    pub overload: bool,
    pub overcurrent: bool,
    pub hardware_error: u8,
    pub watchdog_tripped: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Sample {
    Good(Telemetry),
    Missing,
    Corrupt,
    WrongId(u8),
}

impl Sample {
    pub fn telemetry(&self) -> Option<Telemetry> {
        match self {
            Sample::Good(telemetry) => Some(*telemetry),
            _ => None,
        }
    }
}

pub const READ_TAGS: u16 = 4;

pub fn block(family: Family) -> (u16, u16) {
    match family {
        Family::Feetech => (40, 31),
        Family::Dynamixel => (64, 84),
    }
}

pub fn tagged_block(family: Family, tag: u16) -> (u16, u16) {
    let (address, length) = block(family);

    (address, length + tag % READ_TAGS)
}

pub fn sample_from(family: Family, reply: &Reply) -> Sample {
    match reply {
        Reply::Status(status) => decode(family, status).map_or(Sample::Corrupt, Sample::Good),
        Reply::Missing => Sample::Missing,
        Reply::Corrupt => Sample::Corrupt,
        Reply::WrongId(id) => Sample::WrongId(*id),
    }
}

pub fn decode(family: Family, status: &Status) -> Option<Telemetry> {
    let base = usize::from(block(family).1);

    if !(base..base + usize::from(READ_TAGS)).contains(&status.data.len()) {
        return None;
    }

    Some(match family {
        Family::Feetech => decode_feetech(status),
        Family::Dynamixel => decode_dynamixel(status),
    })
}

fn word(data: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([data[at], data[at + 1]])
}

fn long(data: &[u8], at: usize) -> i32 {
    i32::from_le_bytes([data[at], data[at + 1], data[at + 2], data[at + 3]])
}

fn sign_magnitude(raw: u16, sign_bit: u8) -> i32 {
    let magnitude = i32::from(raw & ((1u16 << sign_bit) - 1));

    if raw & (1u16 << sign_bit) != 0 {
        -magnitude
    } else {
        magnitude
    }
}

fn decode_feetech(status: &Status) -> Telemetry {
    let data = &status.data;
    let flags = data[25] | status.error;

    Telemetry {
        id: status.id,
        torque_on: data[0] != 0,
        goal: i32::from(word(data, 2) & 0x7FFF),
        position: sign_magnitude(word(data, 16), 15),
        velocity_rad_s: sign_magnitude(word(data, 18), 15) as f32 * TAU / 4096.0,
        load_fraction: sign_magnitude(word(data, 20), 10) as f32 / 1000.0,
        volts: f32::from(data[22]) / 10.0,
        temp_c: f32::from(data[23]),
        overload: flags & servo_wire::feetech::ERR_OVERLOAD != 0,
        overcurrent: flags & servo_wire::feetech::ERR_OVERCURRENT != 0,
        hardware_error: flags & servo_wire::feetech::ERR_OVERHEAT,
        watchdog_tripped: false,
    }
}

fn decode_dynamixel(status: &Status) -> Telemetry {
    let data = &status.data;
    let hardware = data[6];

    Telemetry {
        id: status.id,
        torque_on: data[0] != 0,
        goal: long(data, 52),
        position: long(data, 68),
        velocity_rad_s: long(data, 64) as f32 * 0.229 * TAU / 60.0,
        load_fraction: (word(data, 60) as i16) as f32 / 885.0,
        volts: f32::from(word(data, 80)) / 10.0,
        temp_c: f32::from(data[82]),
        overload: hardware & 32 != 0,
        overcurrent: hardware & 16 != 0,
        hardware_error: hardware,
        watchdog_tripped: data[34] == 0xFF,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use servo_emu::{BusOptions, ServoBus};
    use servo_wire::Scan;

    fn read_block(family: Family) -> Telemetry {
        let mut bus = ServoBus::new(family, &[1], BusOptions::default());
        let (address, length) = block(family);
        let replies = bus.feed(&family.read_request(1, address, length), 0);
        let Scan::Frame(frame) = family.scan(&replies[0].bytes) else {
            panic!("expected a frame");
        };

        decode(family, &family.status_of(&frame).unwrap()).unwrap()
    }

    #[test]
    fn decodes_a_fresh_feetech_servo() {
        let telemetry = read_block(Family::Feetech);

        assert!(!telemetry.torque_on);
        assert_eq!(telemetry.position, 2048);
        assert_eq!(telemetry.goal, 2048);
        assert!((telemetry.volts - 7.4).abs() < 0.01);
        assert_eq!(telemetry.temp_c, 25.0);
    }

    #[test]
    fn decodes_a_fresh_dynamixel_servo() {
        let telemetry = read_block(Family::Dynamixel);

        assert!(!telemetry.torque_on);
        assert_eq!(telemetry.position, 2048);
        assert!((telemetry.volts - 5.0).abs() < 0.01);
        assert!(!telemetry.watchdog_tripped);
    }

    #[test]
    fn short_blocks_are_not_telemetry() {
        let status = Status {
            id: 1,
            error: 0,
            data: vec![0; 3],
        };

        assert_eq!(decode(Family::Feetech, &status), None);
    }
}
