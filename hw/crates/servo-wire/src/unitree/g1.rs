use std::f32::consts::{FRAC_PI_3, FRAC_PI_6};
use std::ops::Range;

const TWO_PI_3: f32 = 2.0 * FRAC_PI_3;

pub const MOTORS: usize = 29;
pub const LEGS: Range<usize> = 0..12;
pub const WAIST: Range<usize> = 12..15;
pub const WRITABLE: Range<usize> = 12..29;
pub const WEIGHT_SLOT: usize = 29;
pub const RIGHT_SHOULDER_PITCH: usize = 22;

pub const LIMITS: [(f32, f32); MOTORS] = [
    (-2.5307, 2.8798),
    (-FRAC_PI_6, 2.9671),
    (-2.7576, 2.7576),
    (-0.087_267, 2.8798),
    (-0.872_67, FRAC_PI_6),
    (-0.2618, 0.2618),
    (-2.5307, 2.8798),
    (-2.9671, FRAC_PI_6),
    (-2.7576, 2.7576),
    (-0.087_267, 2.8798),
    (-0.872_67, FRAC_PI_6),
    (-0.2618, 0.2618),
    (-2.618, 2.618),
    (-0.52, 0.52),
    (-0.52, 0.52),
    (-3.0892, 2.6704),
    (-1.5882, 2.2515),
    (-2.618, 2.618),
    (-FRAC_PI_3, TWO_PI_3),
    (-1.972_222, 1.972_222),
    (-1.614_429_6, 1.614_429_6),
    (-1.614_429_6, 1.614_429_6),
    (-3.0892, 2.6704),
    (-2.2515, 1.5882),
    (-2.618, 2.618),
    (-FRAC_PI_3, TWO_PI_3),
    (-1.972_222, 1.972_222),
    (-1.614_429_6, 1.614_429_6),
    (-1.614_429_6, 1.614_429_6),
];

pub fn is_leg(motor: usize) -> bool {
    LEGS.contains(&motor)
}

pub fn is_waist(motor: usize) -> bool {
    WAIST.contains(&motor)
}

pub fn is_writable(motor: usize) -> bool {
    WRITABLE.contains(&motor)
}

pub fn joint_id(motor: usize) -> u8 {
    u8::try_from(motor + 1).unwrap_or(u8::MAX)
}

pub fn motor_of(id: u8) -> Option<usize> {
    usize::from(id).checked_sub(1).filter(|motor| *motor < MOTORS)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legs_and_writable_joints_never_overlap() {
        assert_eq!(WRITABLE.end, MOTORS);
        assert_eq!(WRITABLE.len(), 17);
        assert!((0..MOTORS).all(|motor| !(is_leg(motor) && is_writable(motor))));
    }

    #[test]
    fn every_limit_is_ordered_and_holds_zero() {
        for (min, max) in LIMITS {
            assert!(min < max);
            assert!(min <= 0.0 && max >= 0.0);
        }
    }

    #[test]
    fn ids_count_motors_from_one() {
        assert_eq!(joint_id(0), 1);
        assert_eq!(motor_of(29), Some(28));
        assert_eq!(motor_of(0), None);
        assert_eq!(motor_of(30), None);
    }
}
