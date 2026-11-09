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
                _ => self.nact(),
            })
            .sum()
    }
}
