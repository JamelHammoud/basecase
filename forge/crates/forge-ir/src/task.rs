pub use forge_reward::code::{Binary, Code, Input, Op, Unary};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Observed {
    Gravity,
    AngVel,
    LinVel,
    Command,
    JointOffsets,
    JointVel,
    LastAction,
    Clock,
}

pub const OBSERVATIONS: [Observed; 7] = [
    Observed::Gravity,
    Observed::AngVel,
    Observed::LinVel,
    Observed::Command,
    Observed::JointOffsets,
    Observed::JointVel,
    Observed::LastAction,
];

#[derive(Clone, Debug, PartialEq)]
pub struct Actuated {
    pub qpos: usize,
    pub dof: usize,
    pub actuator: usize,
    pub default_pose: f64,
    pub ctrl_range: [f64; 2],
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pushes {
    pub speed: [f64; 2],
    pub gap_steps: [i64; 2],
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CommandDraws {
    pub ranges: [[f64; 2]; 3],
    pub resample_steps: [f64; 2],
    pub still_share: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Conditions {
    pub commands: Option<CommandDraws>,
    pub delay_steps: [usize; 2],
    pub delay_ramp: bool,
    pub encoder_bias: f64,
    pub imu_bias: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Reference {
    pub looping: bool,
    pub width: usize,
    pub frames: Vec<f64>,
}

impl Reference {
    pub fn count(&self) -> usize {
        self.frames.len() / self.width.max(1)
    }

    fn index(&self, k: i64) -> usize {
        let last = self.count().saturating_sub(1);
        let k = k.max(0) as usize;

        if self.looping {
            k % self.count().max(1)
        } else {
            k.min(last)
        }
    }

    pub fn frame(&self, k: i64) -> &[f64] {
        let at = self.index(k) * self.width;

        &self.frames[at..at + self.width]
    }

    pub fn angle(&self, k: i64) -> f64 {
        let at = self.index(k) as f64;
        let count = self.count() as f64;

        if self.looping {
            std::f64::consts::TAU * at / count
        } else {
            std::f64::consts::PI * at / (count - 1.0).max(1.0)
        }
    }

    pub fn clock(&self, k: i64) -> [f64; 2] {
        let angle = self.angle(k);

        [angle.sin(), angle.cos()]
    }
}

pub const COUNTERS: usize = 4;

#[derive(Clone, Debug, PartialEq)]
pub struct Task {
    pub joints: Vec<Actuated>,
    pub ctrl_default: Vec<f64>,
    pub root_qpos: usize,
    pub root_dof: usize,
    pub action_scale: f64,
    pub command: [f64; 3],
    pub z0: f64,
    pub control_dt: f64,
    pub decimation: usize,
    pub episode_steps: i64,
    pub reset_noise: f64,
    pub fall_resets: bool,
    pub squash: bool,
    pub pushes: Option<Pushes>,
    pub conditions: Conditions,
    pub reference: Option<Reference>,
    pub observations: Vec<Observed>,
    pub reward: Code,
    pub fell: Code,
}

impl Task {
    pub fn nact(&self) -> usize {
        self.joints.len()
    }

    pub fn delay_depth(&self) -> usize {
        self.conditions.delay_steps[1] + 1
    }

    pub fn env_width(&self) -> usize {
        (3 + self.delay_depth()) * self.nact() + 5
    }

    pub fn nobs(&self) -> usize {
        self.observations
            .iter()
            .map(|o| match o {
                Observed::Gravity | Observed::AngVel | Observed::LinVel | Observed::Command => 3,
                Observed::Clock => 2,
                _ => self.nact(),
            })
            .sum()
    }
}

#[cfg(test)]
mod tests {
    use super::Reference;

    fn reference(looping: bool) -> Reference {
        Reference {
            looping,
            width: 2,
            frames: vec![0.0, 10.0, 1.0, 11.0, 2.0, 12.0, 3.0, 13.0],
        }
    }

    #[test]
    fn a_looping_reference_wraps_and_its_clock_turns_once_per_loop() {
        let looping = reference(true);

        assert_eq!(looping.count(), 4);
        assert_eq!(looping.frame(5), &[1.0, 11.0]);
        assert_eq!(looping.clock(0), [0.0, 1.0]);
        assert!((looping.angle(1) - std::f64::consts::FRAC_PI_2).abs() < 1e-15);
        assert_eq!(looping.angle(4), 0.0);
    }

    #[test]
    fn a_one_shot_reference_holds_its_last_frame_and_its_clock_stops_at_half_a_turn() {
        let once = reference(false);

        assert_eq!(once.frame(3), &[3.0, 13.0]);
        assert_eq!(once.frame(40), &[3.0, 13.0]);
        assert!((once.angle(3) - std::f64::consts::PI).abs() < 1e-15);
        assert_eq!(once.angle(40), once.angle(3));
    }
}
