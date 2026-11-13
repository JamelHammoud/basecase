use plant_bam::SplitMix;

pub const SUBSTEP_S: f32 = 0.001;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Gains {
    pub kp: f32,
    pub kd: f32,
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
pub struct Build {
    pub at: f32,
    pub range: (f32, f32),
    pub torque_limit: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Joint {
    pub q: f32,
    pub dq: f32,
    pub ddq: f32,
    pub tau: f32,
    pub hidden: Hidden,
    build: Build,
}

impl Joint {
    pub fn new(build: Build, hidden: Hidden) -> Self {
        Self {
            q: build.at,
            dq: 0.0,
            ddq: 0.0,
            tau: 0.0,
            hidden,
            build,
        }
    }

    pub fn step(&mut self, drive: Drive) {
        let pd = drive.gains.kp * (drive.target - self.q) + drive.gains.kd * (drive.velocity - self.dq);
        let limit = self.build.torque_limit;
        let applied = ((pd + drive.feedforward) * self.hidden.gain).clamp(-limit, limit);
        let friction = self.hidden.viscous * self.dq + self.hidden.coulomb * sign(self.dq);
        let net = applied - friction;
        let static_hold = self.dq == 0.0 && net.abs() <= self.hidden.coulomb;
        let ddq = if static_hold { 0.0 } else { net / self.hidden.inertia };
        let next_dq = self.dq + ddq * SUBSTEP_S;
        let crossed_zero =
            self.dq != 0.0 && next_dq.signum() != self.dq.signum() && applied.abs() <= self.hidden.coulomb;
        let (min, max) = self.build.range;

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

    const ARM: Gains = Gains { kp: 40.0, kd: 1.0 };

    fn joint(range: (f32, f32)) -> Joint {
        let build = Build {
            at: 0.0,
            range,
            torque_limit: 25.0,
        };

        Joint::new(build, Hidden::seeded(&mut SplitMix::new(3)))
    }

    fn drive_to(target: f32) -> Drive {
        Drive {
            target,
            velocity: 0.0,
            feedforward: 0.0,
            gains: ARM,
        }
    }

    #[test]
    fn a_joint_settles_on_its_pd_target() {
        let mut joint = joint((-3.0, 3.0));

        for _ in 0..3000 {
            joint.step(drive_to(0.6));
        }

        assert!((joint.q - 0.6).abs() < 0.02, "{}", joint.q);
    }

    #[test]
    fn a_joint_never_leaves_its_range() {
        let mut joint = joint((-0.5, 0.5));

        for _ in 0..3000 {
            joint.step(drive_to(2.0));
        }

        assert!(joint.q <= 0.5);
    }
}
