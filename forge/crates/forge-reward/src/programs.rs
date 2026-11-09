pub const SHARED: &str = r#"
def upright(state):
    return exp(-(state.gravity[0] ** 2 + state.gravity[1] ** 2) / 0.05)

def height(state):
    return exp(-((state.z - state.z0) / (0.08 * max(state.z0, 0.05))) ** 2)

def fell(state):
    return -state.gravity[2] < 0.5 or state.z < 0.45 * state.z0

def per_second(state):
    return state.control_dt * 10
"#;

pub const STAND: &str = r#"
def reward(state):
    scale = per_second(state)
    forward = -state.linvel[1]
    left = state.linvel[0]
    return (
        term("upright", 1.0 * upright(state) * scale)
        + term("height", 0.5 * height(state) * scale)
        + term("pose", 0.3 * exp(-sum(state.joint_pos ** 2) / 0.1) * scale)
        - term("drift", 0.5 * (forward ** 2 + left ** 2) * scale)
        - term("wobble", 0.05 * sum(state.angvel[:2] ** 2) * scale)
        - term("action_rate", 0.02 * sum((state.action - state.last_action) ** 2) * scale)
        - term("joint_speed", 1e-4 * sum(state.joint_vel ** 2) * scale)
        - term("fall", 2.0 if fell(state) else 0.0)
    )
"#;

pub const WALK: &str = r#"
def reward(state):
    scale = per_second(state)
    forward = -state.linvel[1]
    left = state.linvel[0]
    speed_error = (forward - state.command[0]) ** 2 + (left - state.command[1]) ** 2
    return (
        term("track", 1.5 * exp(-speed_error / 0.05) * scale)
        + term("turn", 0.5 * exp(-(state.angvel[2] - state.command[2]) ** 2 / 0.25) * scale)
        + term("upright", 0.5 * upright(state) * scale)
        + term("height", 0.2 * height(state) * scale)
        - term("wobble", 0.05 * sum(state.angvel[:2] ** 2) * scale)
        - term("action_rate", 0.02 * sum((state.action - state.last_action) ** 2) * scale)
        - term("joint_speed", 2e-4 * sum(state.joint_vel ** 2) * scale)
        - term("fall", 2.0 if fell(state) else 0.0)
    )
"#;

pub fn stand() -> String {
    format!("{SHARED}{STAND}")
}

pub fn walk() -> String {
    format!("{SHARED}{WALK}")
}

pub const FELL: &str = r#"
def reward(state):
    return 1.0 if fell(state) else 0.0
"#;

pub fn fell() -> String {
    format!("{SHARED}{FELL}")
}
