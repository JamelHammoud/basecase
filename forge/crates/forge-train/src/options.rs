use crate::start_states::{self, StartState};
use forge_ir::task::Reference;
use serde_json::{Map, Value};

const RESET_JOINT_NOISE: f64 = 0.05;
const START_AREA_REACH_M: f64 = 5.0;
const REFERENCE_FRAMES: [usize; 2] = [2, 30_000];
const RANDOMIZATION_AXES: [&str; 3] = ["friction", "mass", "servo"];
const FRICTION_BOUNDS: [f64; 2] = [0.1, 3.0];
const MASS_BOUNDS: [f64; 2] = [0.25, 4.0];
const SERVO_BOUNDS: [f64; 2] = [0.2, 2.0];

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Randomization {
    pub friction: [f64; 2],
    pub mass: [f64; 2],
    pub servo: [f64; 2],
}

impl Default for Randomization {
    fn default() -> Self {
        Self {
            friction: [0.6, 1.3],
            mass: [0.85, 1.15],
            servo: [0.85, 1.15],
        }
    }
}

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
    pub reference: Option<Reference>,
    pub start_states: Vec<StartState>,
    pub randomization: Randomization,
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
            reference: None,
            start_states: Vec::new(),
            randomization: Randomization::default(),
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

fn randomization_axis(
    object: &Map<String, Value>,
    key: &str,
    fallback: [f64; 2],
    [least, most]: [f64; 2],
) -> Result<[f64; 2], String> {
    let Some(value) = object.get(key) else {
        return Ok(fallback);
    };
    let name = format!("randomization.{key}");
    let [low, high] = pair(value, &name)?;

    if low < least || high > most {
        return Err(format!("{name} multiplies the model's value by {least} to {most}"));
    }

    Ok([low, high])
}

fn randomization(root: &Value) -> Result<Randomization, String> {
    let defaults = Randomization::default();
    let Some(value) = root.get("randomization") else {
        return Ok(defaults);
    };
    let object = value
        .as_object()
        .ok_or("job.json needs an object in randomization, with friction, mass or servo")?;

    if let Some(unknown) = object.keys().find(|k| !RANDOMIZATION_AXES.contains(&k.as_str())) {
        return Err(format!(
            "randomization has no {unknown}; it takes friction, mass and servo"
        ));
    }

    Ok(Randomization {
        friction: randomization_axis(object, "friction", defaults.friction, FRICTION_BOUNDS)?,
        mass: randomization_axis(object, "mass", defaults.mass, MASS_BOUNDS)?,
        servo: randomization_axis(object, "servo", defaults.servo, SERVO_BOUNDS)?,
    })
}

fn reference_frame(value: &Value, index: usize) -> Result<Vec<f64>, String> {
    let numbers = value
        .as_array()
        .ok_or_else(|| format!("reference frame {index} isn't a list of numbers"))?;

    numbers
        .iter()
        .map(|v| v.as_f64().filter(|x| x.is_finite()))
        .collect::<Option<Vec<f64>>>()
        .ok_or_else(|| format!("reference frame {index} has a value that isn't a finite number"))
}

fn reference(root: &Value) -> Result<Option<Reference>, String> {
    let Some(value) = root.get("reference") else {
        return Ok(None);
    };
    let looping = value
        .get("loop")
        .and_then(Value::as_bool)
        .ok_or("job.json needs true or false in reference.loop")?;
    let [fewest, most] = REFERENCE_FRAMES;
    let list = value
        .get("frames")
        .and_then(Value::as_array)
        .filter(|l| (fewest..=most).contains(&l.len()))
        .ok_or_else(|| format!("job.json needs {fewest} to {most} frames in reference.frames, one per control step"))?;
    let width = list[0].as_array().map_or(0, Vec::len);
    let mut frames = Vec::with_capacity(width * list.len());

    for (index, item) in list.iter().enumerate() {
        let frame = reference_frame(item, index)?;

        if frame.len() != width {
            return Err(format!(
                "reference frame {index} has {} numbers and frame 0 has {width}",
                frame.len()
            ));
        }

        frames.extend(frame);
    }

    Ok(Some(Reference { looping, width, frames }))
}

pub fn check_reference(options: &TaskOptions, joints: usize) -> Result<(), String> {
    let Some(found) = options.reference.as_ref().map(|r| r.width) else {
        return Ok(());
    };

    if found == joints + 2 {
        return Ok(());
    }

    Err(format!(
        "reference frames need {} numbers each, the offset from defaultPose of each of the {joints} joints \
         (radians or metres), then the base height in metres and the tilt in radians; they have {found}",
        joints + 2
    ))
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
        reference: reference(root)?,
        start_states: start_states::parse(root)?,
        randomization: randomization(root)?,
    })
}

#[cfg(test)]
mod tests {
    use super::{check_reference, parse, Randomization, TaskOptions};
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
    fn reads_a_reference_as_one_frame_per_control_step() {
        let options =
            parse(&json!({ "reference": { "loop": true, "frames": [[0.1, -0.2, 0.12, 0], [0.2, -0.1, 0.13, 0.05]] } }))
                .expect("parses");
        let reference = options.reference.as_ref().expect("reference");

        assert!(reference.looping);
        assert_eq!((reference.width, reference.count()), (4, 2));
        assert_eq!(reference.frame(1), &[0.2, -0.1, 0.13, 0.05]);
        assert!(check_reference(&options, 2).is_ok());
        assert!(check_reference(&options, 3)
            .expect_err("one joint short")
            .contains("need 5 numbers"));
        assert!(check_reference(&TaskOptions::default(), 3).is_ok());
    }

    #[test]
    fn reads_start_states_from_another_skill() {
        let state = json!({
            "joints": [0.1, -0.2], "jointVels": [0, 0], "height": 0.1,
            "quat": [1, 0, 0, 0], "linear": [0, 0, 0], "angular": [0, 0, 0]
        });
        let options = parse(&json!({ "startStates": [state.clone(), state] })).expect("parses");

        assert_eq!(options.start_states.len(), 2);
        assert!(parse(&json!({ "startStates": [] }))
            .expect_err("empty")
            .contains("startStates"));
    }

    #[test]
    fn refuses_references_of_the_wrong_shape() {
        let refused = |reference: serde_json::Value| parse(&json!({ "reference": reference })).expect_err("refused");

        assert!(refused(json!({ "loop": true, "frames": [[0, 0]] })).contains("reference.frames"));
        assert!(refused(json!({ "loop": true, "frames": [] })).contains("reference.frames"));
        assert!(refused(json!({ "frames": [[0, 0], [0, 0]] })).contains("reference.loop"));
        assert!(refused(json!({ "loop": false, "frames": [[0, 0], [0, 0, 0]] })).contains("frame 1 has 3"));
        assert!(refused(json!({ "loop": false, "frames": [[0, 0], [0, "a"]] })).contains("frame 1"));
        assert!(refused(json!({ "loop": false, "frames": [[0, 0], 4] })).contains("frame 1"));

        let long = vec![json!([0, 0]); 30_001];

        assert!(refused(json!({ "loop": true, "frames": long })).contains("30000"));
    }

    #[test]
    fn reads_randomization_ranges_and_keeps_the_rest() {
        let widened = parse(&json!({ "randomization": { "friction": [0.3, 2], "servo": [0.5, 1.5] } }))
            .expect("parses")
            .randomization;
        let defaults = Randomization::default();

        assert_eq!(widened.friction, [0.3, 2.0]);
        assert_eq!(widened.servo, [0.5, 1.5]);
        assert_eq!(widened.mass, defaults.mass);
        assert_eq!(
            parse(&json!({ "randomization": {} })).expect("parses").randomization,
            defaults
        );
        assert_eq!(defaults.friction, [0.6, 1.3]);
        assert_eq!((defaults.mass, defaults.servo), ([0.85, 1.15], [0.85, 1.15]));
    }

    #[test]
    fn refuses_randomization_outside_physical_bounds() {
        let refused =
            |randomization: serde_json::Value| parse(&json!({ "randomization": randomization })).expect_err("refused");

        assert!(refused(json!({ "friction": [0.05, 1] })).contains("randomization.friction multiplies"));
        assert!(refused(json!({ "friction": [0.5, 3.5] })).contains("0.1 to 3"));
        assert!(refused(json!({ "mass": [0.2, 1] })).contains("0.25 to 4"));
        assert!(refused(json!({ "mass": [1, 4.5] })).contains("randomization.mass"));
        assert!(refused(json!({ "servo": [0.1, 1] })).contains("0.2 to 2"));
        assert!(refused(json!({ "servo": [1.5, 0.9] })).contains("in order"));
        assert!(refused(json!({ "servo": [1, "a"] })).contains("non-number"));
        assert!(refused(json!({ "servo": [1] })).contains("two numbers"));
        assert!(refused(json!({ "gravity": [1, 1] })).contains("randomization has no gravity"));
        assert!(refused(json!([0.6, 1.3])).contains("an object in randomization"));
    }

    #[test]
    fn refuses_ranges_out_of_order() {
        let broken = json!({ "commands": { "ranges": [[0.2, 0], [0, 0], [0, 0]], "resampleS": [2, 4] } });

        assert!(parse(&broken).is_err());
    }
}
