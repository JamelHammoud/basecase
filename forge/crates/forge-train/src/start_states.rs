use crate::rng::Rng;
use crate::robot::Robot;
use serde_json::Value;

const MOST_STATES: usize = 256;

#[derive(Clone, Debug, PartialEq)]
pub struct StartState {
    pub joints: Vec<f64>,
    pub joint_vels: Vec<f64>,
    pub height: f64,
    pub quat: [f64; 4],
    pub linear: [f64; 3],
    pub angular: [f64; 3],
}

fn numbers(state: &Value, key: &str, index: usize) -> Result<Vec<f64>, String> {
    let list = state
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("startStates[{index}] needs a list of numbers in {key}"))?;

    list.iter()
        .map(|v| v.as_f64().filter(|x| x.is_finite()))
        .collect::<Option<Vec<f64>>>()
        .ok_or_else(|| format!("startStates[{index}].{key} has a value that isn't a finite number"))
}

fn fixed<const N: usize>(state: &Value, key: &str, index: usize) -> Result<[f64; N], String> {
    numbers(state, key, index)?
        .try_into()
        .map_err(|_| format!("startStates[{index}].{key} needs {N} numbers"))
}

fn unit_quat(state: &Value, index: usize) -> Result<[f64; 4], String> {
    let quat: [f64; 4] = fixed(state, "quat", index)?;
    let length = quat.iter().map(|q| q * q).sum::<f64>().sqrt();

    if !(length.is_finite() && length > 1e-9) {
        return Err(format!("startStates[{index}].quat has no length"));
    }

    Ok(quat.map(|q| q / length))
}

fn state(value: &Value, index: usize) -> Result<StartState, String> {
    let height = value
        .get("height")
        .and_then(Value::as_f64)
        .filter(|h| h.is_finite() && *h > 0.0)
        .ok_or_else(|| format!("startStates[{index}] needs a height above 0 in metres"))?;

    Ok(StartState {
        joints: numbers(value, "joints", index)?,
        joint_vels: numbers(value, "jointVels", index)?,
        height,
        quat: unit_quat(value, index)?,
        linear: fixed(value, "linear", index)?,
        angular: fixed(value, "angular", index)?,
    })
}

pub fn parse(root: &Value) -> Result<Vec<StartState>, String> {
    let Some(value) = root.get("startStates") else {
        return Ok(Vec::new());
    };
    let list = value
        .as_array()
        .filter(|l| (1..=MOST_STATES).contains(&l.len()))
        .ok_or_else(|| format!("job.json needs 1 to {MOST_STATES} states in startStates"))?;

    list.iter()
        .enumerate()
        .map(|(index, item)| state(item, index))
        .collect()
}

pub fn check(states: &[StartState], joints: usize) -> Result<(), String> {
    let wrong = states
        .iter()
        .position(|s| s.joints.len() != joints || s.joint_vels.len() != joints);

    match wrong {
        None => Ok(()),
        Some(index) => Err(format!(
            "startStates[{index}] has {} numbers in joints and {} in jointVels; each needs {joints}, \
             one per joint in the job's joints order (radians or metres)",
            states[index].joints.len(),
            states[index].joint_vels.len()
        )),
    }
}

pub fn place_one(robot: &Robot, rng: &mut Rng, row: &mut [f64]) -> bool {
    let states = &robot.job.options.start_states;

    if states.is_empty() {
        return false;
    }

    let state = &states[rng.below(states.len())];
    let layout = robot.layout;

    for (j, (&adr, &dof)) in robot.joint_qpos.iter().zip(&robot.joint_dof).enumerate() {
        row[layout.qpos + adr] = state.joints[j];
        row[layout.qvel + dof] = state.joint_vels[j];
    }

    let root = layout.qpos + robot.root_qpos;
    let vel = layout.qvel + robot.root_dof;

    row[root + 2] = state.height;
    row[root + 3..root + 7].copy_from_slice(&state.quat);
    row[vel..vel + 3].copy_from_slice(&state.linear);
    row[vel + 3..vel + 6].copy_from_slice(&state.angular);

    true
}

pub fn turn_velocity(robot: &Robot, row: &mut [f64], yaw: f64) {
    let at = robot.layout.qvel + robot.root_dof;
    let (sin, cos) = yaw.sin_cos();
    let [x, y] = [row[at], row[at + 1]];

    row[at] = cos * x - sin * y;
    row[at + 1] = sin * x + cos * y;
}

#[cfg(test)]
mod tests {
    use super::{check, parse};
    use serde_json::{json, Value};

    fn walking(joints: Value) -> Value {
        json!({
            "joints": joints, "jointVels": [0.5, -0.5], "height": 0.12,
            "quat": [2, 0, 0, 0], "linear": [0.2, 0, 0], "angular": [0, 0, 0.1]
        })
    }

    fn refused(states: Value) -> String {
        parse(&json!({ "startStates": states })).expect_err("refused")
    }

    #[test]
    fn reads_states_and_normalises_their_quaternions() {
        let states = parse(&json!({ "startStates": [walking(json!([0.1, -0.2]))] })).expect("parses");

        assert_eq!(states.len(), 1);
        assert_eq!(states[0].quat, [1.0, 0.0, 0.0, 0.0]);
        assert_eq!(states[0].joints, vec![0.1, -0.2]);
        assert_eq!(states[0].angular, [0.0, 0.0, 0.1]);
        assert!(parse(&json!({})).expect("parses").is_empty());
        assert!(check(&states, 2).is_ok());
        assert!(check(&states, 3)
            .expect_err("one joint short")
            .contains("has 2 numbers in joints and 2 in jointVels; each needs 3"));
    }

    #[test]
    fn refuses_states_of_the_wrong_shape() {
        let good = walking(json!([0, 0]));
        let with = |key: &str, value: Value| {
            let mut state = good.clone();

            state[key] = value;
            json!([state])
        };
        let mut missing = good.clone();

        missing.as_object_mut().expect("object").remove("linear");

        assert!(refused(json!([])).contains("1 to 256"));
        assert!(refused(json!(vec![good.clone(); 257])).contains("1 to 256"));
        assert!(refused(json!([missing])).contains("startStates[0] needs a list of numbers in linear"));
        assert!(refused(with("quat", json!([0, 0, 0, 0]))).contains("quat has no length"));
        assert!(refused(with("quat", json!([1, 0, 0]))).contains("quat needs 4 numbers"));
        assert!(refused(with("joints", json!([0, "a"]))).contains("joints has a value that isn't a finite number"));
        assert!(refused(with("linear", json!([f64::INFINITY, 0, 0]))).contains("linear has a value that isn't"));
        assert!(refused(with("height", json!(0))).contains("height above 0"));
        assert!(refused(json!({ "joints": [] })).contains("1 to 256"));
        assert!(parse(&json!({ "startStates": vec![good; 256] })).is_ok());
    }
}
