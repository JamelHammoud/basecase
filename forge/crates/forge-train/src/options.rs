use serde_json::Value;

const RESET_JOINT_NOISE: f64 = 0.05;
const START_AREA_REACH_M: f64 = 5.0;

#[derive(Clone, Debug, PartialEq)]
pub struct CommandRanges {
    pub ranges: [[f64; 2]; 3],
    pub resample_s: [f64; 2],
    pub still_share: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TaskOptions {
    pub reward: Option<String>,
    pub commands: Option<CommandRanges>,
    pub reset_noise: f64,
    pub delay_steps: [usize; 2],
    pub delay_ramp: Option<f64>,
    pub encoder_bias: f64,
    pub imu_bias: f64,
    pub actor_linvel: bool,
    pub stand_height: Option<f64>,
    pub fall_resets: bool,
    pub pushes: bool,
    pub episode_s: Option<f64>,
    pub start_area: Option<[[f64; 2]; 2]>,
}

impl Default for TaskOptions {
    fn default() -> Self {
        Self {
            reward: None,
            commands: None,
            reset_noise: RESET_JOINT_NOISE,
            delay_steps: [0, 0],
            delay_ramp: None,
            encoder_bias: 0.0,
            imu_bias: 0.0,
            actor_linvel: true,
            stand_height: None,
            fall_resets: true,
            pushes: true,
            episode_s: None,
            start_area: None,
        }
    }
}

fn pair(value: &Value, key: &str) -> Result<[f64; 2], String> {
    let list = value
        .as_array()
        .filter(|l| l.len() == 2)
        .ok_or_else(|| format!("job.json needs two numbers in {key}"))?;
    let low = list[0].as_f64().ok_or_else(|| format!("{key} has a non-number"))?;
    let high = list[1].as_f64().ok_or_else(|| format!("{key} has a non-number"))?;

    if !(low.is_finite() && high.is_finite() && low <= high) {
        return Err(format!("{key} needs a low and a high, in order"));
    }

    Ok([low, high])
}

fn commands(value: &Value) -> Result<CommandRanges, String> {
    let ranges = value
        .get("ranges")
        .and_then(Value::as_array)
        .filter(|l| l.len() == 3)
        .ok_or("commands needs three ranges: forward, left and turn")?;

    Ok(CommandRanges {
        ranges: [
            pair(&ranges[0], "commands.ranges")?,
            pair(&ranges[1], "commands.ranges")?,
            pair(&ranges[2], "commands.ranges")?,
        ],
        resample_s: pair(value.get("resampleS").unwrap_or(&Value::Null), "commands.resampleS")?,
        still_share: value
            .get("stillShare")
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
            .clamp(0.0, 1.0),
    })
}

fn steps(root: &Value) -> Result<[usize; 2], String> {
    match root.get("delaySteps") {
        None => Ok([0, 0]),
        Some(value) => {
            let [low, high] = pair(value, "delaySteps")?;

            if low < 0.0 || high > 8.0 {
                return Err("delaySteps runs from 0 to 8 control steps".to_owned());
            }

            Ok([low as usize, high as usize])
        }
    }
}

fn non_negative(root: &Value, key: &str, fallback: f64) -> Result<f64, String> {
    let value = root.get(key).and_then(Value::as_f64).unwrap_or(fallback);

    if value.is_finite() && value >= 0.0 {
        Ok(value)
    } else {
        Err(format!("job.json needs a number of at least 0 in {key}"))
    }
}

fn ramp(root: &Value) -> Result<Option<f64>, String> {
    let Some(value) = root.get("delayRamp") else {
        return Ok(None);
    };

    match value.as_f64() {
        Some(share) if share > 0.0 && share <= 1.0 => Ok(Some(share)),
        _ => Err("job.json needs delayRamp above 0 and at most 1, the share of the budget it ramps over".to_owned()),
    }
}

fn start_area(root: &Value) -> Result<Option<[[f64; 2]; 2]>, String> {
    let Some(value) = root.get("startArea") else {
        return Ok(None);
    };
    let forward = pair(value.get("forwardM").unwrap_or(&Value::Null), "startArea.forwardM")?;
    let side = pair(value.get("sideM").unwrap_or(&Value::Null), "startArea.sideM")?;
    let within = |[low, high]: [f64; 2]| low >= -START_AREA_REACH_M && high <= START_AREA_REACH_M;

    if !(within(forward) && within(side)) {
        return Err(format!(
            "startArea reaches at most {START_AREA_REACH_M} m from the start on each axis"
        ));
    }

    Ok(Some([forward, side]))
}

fn flag(root: &Value, key: &str) -> bool {
    root.get(key).and_then(Value::as_bool).unwrap_or(true)
}

pub fn parse(root: &Value) -> Result<TaskOptions, String> {
    Ok(TaskOptions {
        reward: root.get("reward").and_then(Value::as_str).map(str::to_owned),
        commands: root.get("commands").map(commands).transpose()?,
        reset_noise: non_negative(root, "resetNoise", RESET_JOINT_NOISE)?,
        delay_steps: steps(root)?,
        delay_ramp: ramp(root)?,
        encoder_bias: non_negative(root, "encoderBias", 0.0)?,
        imu_bias: non_negative(root, "imuBias", 0.0)?,
        actor_linvel: flag(root, "actorLinvel"),
        stand_height: root.get("standHeight").and_then(Value::as_f64),
        fall_resets: flag(root, "fallResets"),
        pushes: flag(root, "pushes"),
        episode_s: root.get("episodeS").and_then(Value::as_f64).filter(|s| *s > 0.0),
        start_area: start_area(root)?,
    })
}

#[cfg(test)]
mod tests {
    use super::{parse, TaskOptions};
    use serde_json::json;

    #[test]
    fn no_fields_keep_the_train_py_environment() {
        assert_eq!(parse(&json!({})).expect("parses"), TaskOptions::default());
    }

    #[test]
    fn reads_commands_delays_and_biases() {
        let options = parse(&json!({
            "commands": { "ranges": [[0, 0.2], [0, 0], [-0.5, 0.5]], "resampleS": [2, 4], "stillShare": 0.2 },
            "delaySteps": [0, 2], "encoderBias": 0.02, "imuBias": 0.05, "actorLinvel": false, "fallResets": false
        }))
        .expect("parses");
        let commands = options.commands.expect("commands");

        assert_eq!(commands.ranges[2], [-0.5, 0.5]);
        assert_eq!(commands.resample_s, [2.0, 4.0]);
        assert_eq!(options.delay_steps, [0, 2]);
        assert!(!options.actor_linvel && !options.fall_resets && options.pushes);
    }

    #[test]
    fn reads_a_delay_ramp_as_a_share_of_the_budget() {
        let ramped = parse(&json!({ "delaySteps": [0, 2], "delayRamp": 0.6 })).expect("parses");

        assert_eq!(ramped.delay_ramp, Some(0.6));
        assert!(parse(&json!({ "delayRamp": 0 })).is_err());
        assert!(parse(&json!({ "delayRamp": 1.5 })).is_err());
    }

    #[test]
    fn reads_a_start_area_within_five_metres() {
        let area = parse(&json!({ "startArea": { "forwardM": [-1, 2], "sideM": [0, 0.5] } })).expect("parses");

        assert_eq!(area.start_area, Some([[-1.0, 2.0], [0.0, 0.5]]));
        assert!(parse(&json!({ "startArea": { "forwardM": [-6, 0], "sideM": [0, 0] } }))
            .expect_err("too far")
            .contains("5 m"));
        assert!(parse(&json!({ "startArea": { "forwardM": [1, 0], "sideM": [0, 0] } })).is_err());
        assert!(parse(&json!({ "startArea": { "forwardM": [0, 1] } })).is_err());
    }

    #[test]
    fn refuses_ranges_out_of_order() {
        let broken = json!({ "commands": { "ranges": [[0.2, 0], [0, 0], [0, 0]], "resampleS": [2, 4] } });

        assert!(parse(&broken).is_err());
    }
}
