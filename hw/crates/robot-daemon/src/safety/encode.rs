use super::guard::SafeGoal;
use servo_wire::dynamixel::{self as dxl, crc16, stuff};
use servo_wire::feetech::{self as sts, checksum};
use servo_wire::Family;
use std::f32::consts::TAU;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) enum Register {
    Torque(bool),
    TorqueLimit(f32),
    Goal(SafeGoal),
    Speed(f32),
    BusWatchdog(u8),
}

struct Layout {
    address: u16,
    width: usize,
}

fn layout(family: Family, register: Register) -> Layout {
    let (address, width) = match (family, register) {
        (Family::Feetech, Register::Torque(_)) => (40, 1),
        (Family::Feetech, Register::TorqueLimit(_)) => (48, 2),
        (Family::Feetech, Register::Goal(_)) => (42, 2),
        (Family::Feetech, Register::Speed(_)) => (46, 2),
        (Family::Feetech, Register::BusWatchdog(_)) => (0, 0),
        (Family::Dynamixel, Register::Torque(_)) => (64, 1),
        (Family::Dynamixel, Register::TorqueLimit(_)) => (100, 2),
        (Family::Dynamixel, Register::Goal(_)) => (116, 4),
        (Family::Dynamixel, Register::Speed(_)) => (112, 4),
        (Family::Dynamixel, Register::BusWatchdog(_)) => (98, 1),
    };

    Layout { address, width }
}

fn raw_value(family: Family, register: Register) -> u32 {
    match (family, register) {
        (_, Register::Torque(on)) => u32::from(on),
        (Family::Feetech, Register::TorqueLimit(fraction)) => (fraction.clamp(0.0, 1.0) * 1000.0).floor() as u32,
        (Family::Dynamixel, Register::TorqueLimit(fraction)) => (fraction.clamp(0.0, 1.0) * 885.0).floor() as u32,
        (_, Register::Goal(goal)) => goal.counts().max(0) as u32,
        (Family::Feetech, Register::Speed(rad_s)) => ((rad_s.max(0.0) * 4096.0 / TAU).floor() as u32).max(1),
        (Family::Dynamixel, Register::Speed(rad_s)) => ((rad_s.max(0.0) / (0.229 * TAU / 60.0)).floor() as u32).max(1),
        (_, Register::BusWatchdog(units)) => u32::from(units.min(127)),
    }
}

#[cfg(test)]
pub(super) fn is_supported(family: Family, register: Register) -> bool {
    layout(family, register).width > 0
}

pub(super) fn sync_write(family: Family, entries: &[(u8, Register)]) -> Option<Vec<u8>> {
    let first = entries.first()?;
    let shape = layout(family, first.1);
    let mut params = Vec::new();

    if shape.width == 0 {
        return None;
    }

    match family {
        Family::Feetech => params.extend_from_slice(&[shape.address as u8, shape.width as u8]),
        Family::Dynamixel => {
            params.extend_from_slice(&shape.address.to_le_bytes());
            params.extend_from_slice(&(shape.width as u16).to_le_bytes());
        }
    }

    for (id, register) in entries {
        params.push(*id);
        params.extend_from_slice(&raw_value(family, *register).to_le_bytes()[..shape.width]);
    }

    Some(match family {
        Family::Feetech => feetech_frame(sts::OP_SYNC_WRITE, &params),
        Family::Dynamixel => dynamixel_frame(dxl::OP_SYNC_WRITE, &params),
    })
}

fn feetech_frame(code: u8, params: &[u8]) -> Vec<u8> {
    let length = u8::try_from(params.len() + 2).unwrap_or(u8::MAX);
    let mut out = vec![0xFF, 0xFF, sts::BROADCAST_ID, length, code];

    out.extend_from_slice(params);
    out.push(checksum(&out[2..]));

    out
}

fn dynamixel_frame(code: u8, params: &[u8]) -> Vec<u8> {
    let stuffed = stuff(params, &[code]);
    let length = u16::try_from(stuffed.len() + 3).unwrap_or(u16::MAX).to_le_bytes();
    let mut out = vec![0xFF, 0xFF, 0xFD, 0x00, dxl::BROADCAST_ID, length[0], length[1], code];

    out.extend_from_slice(&stuffed);

    let crc = crc16(&out).to_le_bytes();

    out.extend_from_slice(&crc);

    out
}

#[cfg(test)]
mod tests {
    use super::super::guard::{hold_at, CountBounds};
    use super::*;
    use servo_wire::{Frame, Scan};

    fn decoded(family: Family, bytes: &[u8]) -> Frame {
        match family.scan(bytes) {
            Scan::Frame(frame) => frame,
            other => panic!("expected a frame, got {other:?}"),
        }
    }

    #[test]
    fn feetech_goal_sync_write_matches_bytes_captured_from_scservo_sdk() {
        let goal = hold_at(2148, CountBounds { min: 0, max: 4095 }).unwrap();
        let bytes = sync_write(Family::Feetech, &[(1, Register::Goal(goal)), (2, Register::Goal(goal))]).unwrap();

        assert_eq!(
            bytes,
            vec![0xFF, 0xFF, 0xFE, 0x0A, 0x83, 0x2A, 0x02, 0x01, 0x64, 0x08, 0x02, 0x64, 0x08, 0x6D]
        );
    }

    #[test]
    fn feetech_torque_limit_matches_bytes_captured_from_scservo_sdk() {
        let bytes = sync_write(Family::Feetech, &[(3, Register::TorqueLimit(0.3))]).unwrap();

        assert_eq!(
            bytes,
            vec![0xFF, 0xFF, 0xFE, 0x07, 0x83, 0x30, 0x02, 0x03, 0x2C, 0x01, 0x15]
        );
    }

    #[test]
    fn dynamixel_torque_off_matches_bytes_captured_from_dynamixel_sdk() {
        let bytes = sync_write(Family::Dynamixel, &[(3, Register::Torque(false))]).unwrap();
        let frame = decoded(Family::Dynamixel, &bytes);

        assert_eq!(
            bytes,
            vec![0xFF, 0xFF, 0xFD, 0x00, 0xFE, 0x09, 0x00, 0x83, 0x40, 0x00, 0x01, 0x00, 0x03, 0x00, 0x1B, 0xD3]
        );
        assert_eq!(frame.code, dxl::OP_SYNC_WRITE);
    }

    #[test]
    fn torque_limits_are_never_written_above_full_scale() {
        let bytes = sync_write(Family::Feetech, &[(1, Register::TorqueLimit(7.0))]).unwrap();
        let frame = decoded(Family::Feetech, &bytes);

        assert_eq!(u16::from_le_bytes([frame.params[3], frame.params[4]]), 1000);
    }

    #[test]
    fn feetech_has_no_bus_watchdog() {
        assert!(!is_supported(Family::Feetech, Register::BusWatchdog(5)));
        assert_eq!(sync_write(Family::Feetech, &[(1, Register::BusWatchdog(5))]), None);
    }
}
