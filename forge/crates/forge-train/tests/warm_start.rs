use forge_train::mask::LINEAR_VELOCITY;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const MODEL: &str = r#"<mujoco model="tiny">
  <option timestep="0.002" integrator="implicitfast"/>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 0.05"/>
    <body name="base" pos="0 0 0.12">
      <freejoint name="root"/>
      <geom type="box" size="0.08 0.05 0.02" mass="0.6"/>
      <body pos="0.06 0 0">
        <joint name="front" type="hinge" axis="1 0 0" range="-1 1" damping="0.04" armature="0.007"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.09" size="0.012" mass="0.05"/>
      </body>
      <body pos="-0.06 0 0">
        <joint name="back" type="hinge" axis="1 0 0" range="-1 1" damping="0.04" armature="0.007"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.09" size="0.012" mass="0.05"/>
      </body>
    </body>
  </worldbody>
  <actuator>
    <position name="front" joint="front" kp="3" ctrlrange="-1 1"/>
    <position name="back" joint="back" kp="3" ctrlrange="-1 1"/>
  </actuator>
</mujoco>"#;

const POSE: &str = r#"
def reward(state):
    return term("pose", exp(-sum((state.joint_pos - 0.15) ** 2) / 0.03))
"#;
const EPISODE_S: f64 = 0.48;
const LEARNED_ITERATIONS: usize = 60;
const RESUMED_ITERATIONS: usize = 2;
const NOBS: usize = 18;

fn job_folder(name: &str, extra: Value) -> PathBuf {
    let folder = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    let mut job = json!({
        "task": "stand", "minutes": 5, "command": [0, 0, 0], "root": "root", "robotName": "Tiny",
        "joints": [{"id": "front", "name": "front"}, {"id": "back", "name": "back"}],
        "defaultPose": [0, 0], "ctrlDefault": [0, 0], "initialJoints": {"front": 0, "back": 0},
        "rootOffset": [0, 0, 0], "actionScale": 0.25, "controlDt": 0.02, "envs": 32,
        "maxIterations": LEARNED_ITERATIONS, "seed": 6, "actorLinvel": false, "reward": POSE,
        "resetNoise": 0.05, "pushes": false, "episodeS": EPISODE_S
    });

    job.as_object_mut()
        .expect("object")
        .extend(extra.as_object().expect("object").clone());

    let _ = fs::remove_dir_all(&folder);

    fs::create_dir_all(&folder).expect("job folder");
    fs::write(folder.join("model.xml"), MODEL).expect("model");
    fs::write(folder.join("job.json"), job.to_string()).expect("job");

    folder
}

fn run(folder: &Path) -> Output {
    Command::new(env!("CARGO_BIN_EXE_forge-train"))
        .arg("--job")
        .arg(folder)
        .output()
        .expect("runs")
}

fn rewards(output: &Output) -> Vec<f64> {
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .filter(|e| e["type"] == "progress")
        .map(|e| e["reward"].as_f64().expect("reward"))
        .collect()
}

fn read(folder: &Path, file: &str) -> Value {
    serde_json::from_str(&fs::read_to_string(folder.join(file)).expect(file)).expect("json")
}

fn mean(values: &[f64]) -> f64 {
    values.iter().sum::<f64>() / values.len() as f64
}

#[test]
fn a_resumed_run_starts_where_its_source_ended() {
    let source = job_folder("warm-source", json!({}));
    let learned = rewards(&run(&source));
    let resumed_folder = job_folder(
        "warm-resumed",
        json!({ "warmStart": "../warm-source", "maxIterations": RESUMED_ITERATIONS, "seed": 7 }),
    );
    let resumed = rewards(&run(&resumed_folder));
    let start = mean(&learned[..3]);
    let end = mean(&learned[learned.len() - 3..]);
    let first = resumed[0];

    assert!(
        end - start > 0.1 * start.abs(),
        "the source run learned: {start} to {end}"
    );
    assert!(
        (first - end).abs() < 0.25 * (end - start),
        "the resumed run starts at {first}, the source ended at {end} and started at {start}"
    );

    let resume = read(&source, "resume.json");

    assert_eq!(resume["algo"], "ppo");
    assert_eq!(resume["critic"]["sizes"], json!([NOBS, 256, 128, 64, 1]));
    assert_eq!(read(&source, "policy.json")["format"], "basecase-policy");
}

#[test]
fn a_policy_file_alone_also_warm_starts() {
    let source = job_folder("warm-policy-source", json!({ "maxIterations": 3 }));

    rewards(&run(&source));

    let resumed = job_folder(
        "warm-policy-resumed",
        json!({ "warmStart": source.join("policy.json"), "maxIterations": 1 }),
    );
    let output = run(&resumed);

    assert_eq!(rewards(&output).len(), 1);
    assert!(String::from_utf8_lossy(&output.stdout).contains("starts fresh"));
}

#[test]
fn a_warm_start_of_another_shape_fails_with_a_reason() {
    let source = job_folder("warm-shape-source", json!({ "maxIterations": 1 }));

    rewards(&run(&source));

    let mut policy = read(&source, "policy.json");
    let first = policy["layers"][0].clone();
    let outs = first["out"].as_u64().expect("out") as usize;

    policy["layers"][0]["in"] = json!(NOBS + 3);
    policy["layers"][0]["w"] = json!(vec![0.0; (NOBS + 3) * outs]);
    policy["obsMean"] = json!(vec![0.0; NOBS + 3]);
    policy["obsStd"] = json!(vec![1.0; NOBS + 3]);
    fs::write(source.join("other.json"), policy.to_string()).expect("policy");

    let resumed = job_folder(
        "warm-shape-resumed",
        json!({ "warmStart": source.join("other.json"), "maxIterations": 1 }),
    );
    let output = run(&resumed);
    let stderr = String::from_utf8_lossy(&output.stderr);

    assert!(!output.status.success());
    assert!(
        stderr.contains("21-256-128-64-2") && stderr.contains("18-256-128-64-2"),
        "{stderr}"
    );
}

fn first_layer_reads(policy: &Value, input: usize) -> bool {
    let first = &policy["layers"][0];
    let ins = first["in"].as_u64().expect("in") as usize;
    let weights = first["w"].as_array().expect("weights");

    (0..first["out"].as_u64().expect("out") as usize).any(|o| weights[o * ins + input].as_f64() != Some(0.0))
}

#[test]
fn a_masked_policy_ignores_linear_velocity_in_every_export() {
    let folder = job_folder("warm-masked", json!({ "maxIterations": 12 }));

    rewards(&run(&folder));

    let policy = read(&folder, "policy.json");
    let resume = read(&folder, "resume.json");
    let outs = resume["actor"]["sizes"][1].as_u64().expect("width") as usize;
    let actor = resume["actor"]["params"].as_array().expect("params");

    for input in LINEAR_VELOCITY {
        assert!(!first_layer_reads(&policy, input), "policy.json reads input {input}");
        assert!(actor[input * outs..(input + 1) * outs]
            .iter()
            .all(|w| w.as_f64() == Some(0.0)));
    }

    assert!(first_layer_reads(&policy, 0));
    assert!(fs::metadata(folder.join("policy.onnx")).expect("onnx").len() > 1000);
}
