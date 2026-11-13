use crate::joint::{Build, Gains, Hidden, Joint};
use plant_bam::SplitMix;
use servo_wire::unitree::g1::{is_leg, is_waist, LIMITS};

pub const STAND_POSE: [f32; 29] = [
    -0.1, 0.0, 0.0, 0.3, -0.2, 0.0, -0.1, 0.0, 0.0, 0.3, -0.2, 0.0, 0.0, 0.0, 0.0, 0.3, 0.25, 0.0, 0.97, 0.15, 0.0,
    0.0, 0.3, -0.25, 0.0, 0.97, -0.15, 0.0, 0.0,
];

pub fn own_gains(motor: usize) -> Gains {
    if is_leg(motor) {
        Gains { kp: 150.0, kd: 2.0 }
    } else if is_waist(motor) {
        Gains { kp: 200.0, kd: 5.0 }
    } else {
        Gains { kp: 40.0, kd: 1.0 }
    }
}

fn torque_limit(motor: usize) -> f32 {
    if is_leg(motor) || is_waist(motor) {
        88.0
    } else {
        25.0
    }
}

pub fn g1_joint(motor: usize, rng: &mut SplitMix) -> Joint {
    let build = Build {
        at: STAND_POSE[motor],
        range: LIMITS[motor],
        torque_limit: torque_limit(motor),
    };

    Joint::new(build, Hidden::seeded(rng))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::joint::Drive;

    fn drive_to(target: f32, motor: usize) -> Drive {
        Drive {
            target,
            velocity: 0.0,
            feedforward: 0.0,
            gains: own_gains(motor),
        }
    }

    #[test]
    fn a_joint_settles_on_its_pd_target() {
        let mut joint = g1_joint(22, &mut SplitMix::new(3));

        for _ in 0..3000 {
            joint.step(drive_to(0.6, 22));
        }

        assert!((joint.q - 0.6).abs() < 0.02, "{}", joint.q);
    }

    #[test]
    fn a_joint_never_leaves_its_limits() {
        let mut joint = g1_joint(13, &mut SplitMix::new(3));

        for _ in 0..3000 {
            joint.step(drive_to(2.0, 13));
        }

        assert!(joint.q <= LIMITS[13].1);
    }

    #[test]
    fn the_stand_pose_is_inside_every_limit() {
        for (motor, q) in STAND_POSE.iter().enumerate() {
            assert!(*q >= LIMITS[motor].0 && *q <= LIMITS[motor].1, "motor {motor}");
        }
    }
}
