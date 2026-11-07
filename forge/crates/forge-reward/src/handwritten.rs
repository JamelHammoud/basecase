use crate::state::RewardState;

const FALL_PENALTY: f64 = 2.0;
const MIN_FALL_UPRIGHT: f64 = 0.5;
const MIN_FALL_HEIGHT_SHARE: f64 = 0.45;
const REWARD_RATE_HZ: f64 = 10.0;
const MIN_HEIGHT_SCALE: f64 = 0.05;

fn squared_sum(values: &[f64]) -> f64 {
    values.iter().map(|v| v * v).sum()
}

fn rate(state: &RewardState) -> f64 {
    state
        .action
        .iter()
        .zip(state.last_action)
        .map(|(a, b)| (a - b) * (a - b))
        .sum()
}

fn upright(state: &RewardState) -> f64 {
    (-(state.gravity[0] * state.gravity[0] + state.gravity[1] * state.gravity[1]) / 0.05).exp()
}

fn height(state: &RewardState) -> f64 {
    let scale = 0.08 * state.z0.max(MIN_HEIGHT_SCALE);
    let off = (state.z - state.z0) / scale;

    (-(off * off)).exp()
}

fn roll_pitch_rate(state: &RewardState) -> f64 {
    state.angvel[0] * state.angvel[0] + state.angvel[1] * state.angvel[1]
}

pub fn fell(state: &RewardState) -> bool {
    -state.gravity[2] < MIN_FALL_UPRIGHT || state.z < MIN_FALL_HEIGHT_SHARE * state.z0
}

pub fn stand(state: &RewardState) -> f64 {
    let forward = -state.linvel[1];
    let left = state.linvel[0];

    1.0 * upright(state) + 0.5 * height(state) + 0.3 * (-squared_sum(state.joint_pos) / 0.1).exp()
        - 0.5 * (forward * forward + left * left)
        - 0.05 * roll_pitch_rate(state)
        - 0.02 * rate(state)
        - 1e-4 * squared_sum(state.joint_vel)
}

pub fn walk(state: &RewardState) -> f64 {
    let forward = -state.linvel[1];
    let left = state.linvel[0];
    let forward_off = forward - state.command[0];
    let left_off = left - state.command[1];
    let turn_off = state.angvel[2] - state.command[2];
    let track = (-(forward_off * forward_off + left_off * left_off) / 0.05).exp();
    let turn = (-(turn_off * turn_off) / 0.25).exp();

    1.5 * track + 0.5 * turn + 0.5 * upright(state) + 0.2 * height(state)
        - 0.05 * roll_pitch_rate(state)
        - 0.02 * rate(state)
        - 2e-4 * squared_sum(state.joint_vel)
}

pub fn scaled(state: &RewardState, raw: f64) -> f64 {
    let per_second = raw * state.control_dt * REWARD_RATE_HZ;

    if fell(state) {
        per_second - FALL_PENALTY
    } else {
        per_second
    }
}
