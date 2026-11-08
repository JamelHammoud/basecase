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

const TRACK: &str = r#"
def reward(state):
    forward = -state.linvel[1]
    return term("track", exp(-(forward - state.command[0]) ** 2 / 0.05)) - term("still", 0.01 * sum(state.joint_vel ** 2))
"#;

fn job_folder(name: &str, extra: Value) -> PathBuf {
    let folder = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    let mut job = json!({
        "task": "walk", "minutes": 5, "command": [0.2, 0, 0], "root": "root", "robotName": "Tiny",
        "joints": [{"id": "front", "name": "front"}, {"id": "back", "name": "back"}],
        "defaultPose": [0, 0], "ctrlDefault": [0, 0], "initialJoints": {"front": 0, "back": 0},
        "rootOffset": [0, 0, 0], "actionScale": 0.25, "controlDt": 0.02, "envs": 8, "maxIterations": 3,
        "seed": 4
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

fn run(folder: &PathBuf) -> Output {
    Command::new(env!("CARGO_BIN_EXE_forge-train"))
        .arg("--job")
        .arg(folder)
        .output()
        .expect("runs")
}

fn read(folder: &Path, file: &str) -> Value {
    serde_json::from_str(&fs::read_to_string(folder.join(file)).expect(file)).expect("json")
}

#[test]
fn a_kit_job_trains_with_commands_delays_biases_and_its_own_reward() {
    let folder = job_folder(
        "kit-options",
        json!({
            "reward": TRACK,
            "commands": { "ranges": [[0, 0.3], [-0.05, 0.05], [-0.5, 0.5]], "resampleS": [0.2, 0.4], "stillShare": 0.3 },
            "delaySteps": [0, 2], "encoderBias": 0.02, "imuBias": 0.05, "actorLinvel": false,
            "resetNoise": 0.2, "pushes": false, "episodeS": 2
        }),
    );
    let output = run(&folder);

    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));

    let policy = read(&folder, "policy.json");
    let first = &policy["layers"][0];
    let ins = first["in"].as_u64().expect("in") as usize;
    let weights = first["w"].as_array().expect("weights");
    let blind = (0..first["out"].as_u64().expect("out") as usize)
        .flat_map(|o| (6..9).map(move |i| o * ins + i))
        .all(|at| weights[at].as_f64() == Some(0.0));

    assert!(blind, "the actor reads linear velocity");
    assert_eq!(policy["command"], json!([0.2, 0.0, 0.0]));
    assert!(
        read(&folder, "policy-check.json")["samples"]
            .as_array()
            .expect("samples")
            .len()
            >= 8
    );
}

#[test]
fn a_reward_that_does_not_compile_fails_the_job_with_its_line() {
    let folder = job_folder(
        "bad-reward",
        json!({ "reward": "def reward(state):\n    return state.nope\n" }),
    );
    let output = run(&folder);

    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("reward"));
}
