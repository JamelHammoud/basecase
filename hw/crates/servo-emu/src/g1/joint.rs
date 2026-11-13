use plant_bam::SplitMix;
use servo_wire::unitree::g1::{is_leg, is_waist, LIMITS};

pub const SUBSTEP_S: f32 = 0.001;

pub const STAND_POSE: [f32; 29] = [
    -0.1, 0.0, 0.0, 0.3, -0.2, 0.0, -0.1, 0.0, 0.0, 0.3, -0.2, 0.0, 0.0, 0.0, 0.0, 0.3, 0.25, 0.0, 0.97, 0.15, 0.0,
    0.0, 0.3, -0.25, 0.0, 0.97, -0.15, 0.0, 0.0,
];

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Gains {
    pub kp: f32,
    pub kd: f32,
}

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

fn sign(value: f32) -> f32 {
    if value == 0.0 {
        0.0
    } else {
        value.signum()
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hidden {
    pub inertia: f32,
    pub viscous: f32,
    pub coulomb: f32,
    pub gain: f32,
}

impl Hidden {
    pub fn seeded(rng: &mut SplitMix) -> Self {
        Self {
            inertia: 0.08 * rng.spread(0.2) as f32,
            viscous: 0.3 * rng.spread(0.3) as f32,
            coulomb: 0.4 * rng.spread(0.3) as f32,
            gain: rng.spread(0.1) as f32,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Drive {
    pub target: f32,
    pub velocity: f32,
    pub feedforward: f32,
    pub gains: Gains,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Joint {
    pub motor: usize,
    pub q: f32,
    pub dq: f32,
    pub ddq: f32,
    pub tau: f32,
    pub hidden: Hidden,
}

impl Joint {
    pub fn new(motor: usize, rng: &mut SplitMix) -> Self {
        Self {
            motor,
            q: STAND_POSE[motor],
            dq: 0.0,
            ddq: 0.0,
            tau: 0.0,
            hidden: Hidden::seeded(rng),
        }
    }

    pub fn step(&mut self, drive: Drive) {
        let pd = drive.gains.kp * (drive.target - self.q) + drive.gains.kd * (drive.velocity - self.dq);
        let limit = torque_limit(self.motor);
        let applied = ((pd + drive.feedforward) * self.hidden.gain).clamp(-limit, limit);
        let friction = self.hidden.viscous * self.dq + self.hidden.coulomb * sign(self.dq);
        let net = applied - friction;
        let static_hold = self.dq == 0.0 && net.abs() <= self.hidden.coulomb;
        let ddq = if static_hold { 0.0 } else { net / self.hidden.inertia };
        let next_dq = self.dq + ddq * SUBSTEP_S;
        let crossed_zero =
            self.dq != 0.0 && next_dq.signum() != self.dq.signum() && applied.abs() <= self.hidden.coulomb;
        let (min, max) = LIMITS[self.motor];

        self.ddq = ddq;
        self.tau = applied;
        self.dq = if crossed_zero { 0.0 } else { next_dq };
        self.q = (self.q + self.dq * SUBSTEP_S).clamp(min, max);

        if self.q <= min || self.q >= max {
            self.dq = 0.0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let mut joint = Joint::new(22, &mut SplitMix::new(3));

        for _ in 0..3000 {
            joint.step(drive_to(0.6, 22));
        }

        assert!((joint.q - 0.6).abs() < 0.02, "{}", joint.q);
    }

    #[test]
    fn a_joint_never_leaves_its_limits() {
        let mut joint = Joint::new(13, &mut SplitMix::new(3));

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
