#[derive(Clone, Copy, Debug, Default)]
pub struct BodyState {
    pub pos: [f64; 3],
    pub vel: [f64; 3],
}

#[derive(Clone, Copy, Debug)]
pub struct RewardState<'a> {
    pub gravity: [f64; 3],
    pub angvel: [f64; 3],
    pub linvel: [f64; 3],
    pub command: [f64; 3],
    pub z: f64,
    pub z0: f64,
    pub control_dt: f64,
    pub joint_pos: &'a [f64],
    pub joint_vel: &'a [f64],
    pub action: &'a [f64],
    pub last_action: &'a [f64],
    pub bodies: &'a [BodyState],
}
