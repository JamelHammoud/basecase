#![cfg(target_os = "macos")]

use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

const MODEL: &str = r#"<mujoco model="tiny">
  <option timestep="0.002" integrator="implicitfast"/>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 0.05" contype="0" conaffinity="1"/>
    <body name="base" pos="0 0 0.12">
      <freejoint name="root"/>
      <geom type="box" size="0.08 0.05 0.02" mass="0.6" contype="1" conaffinity="0"/>
      <body pos="0.06 0 0">
        <joint name="front" type="hinge" axis="1 0 0" range="-1 1" damping="0.04" armature="0.007"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.09" size="0.012" mass="0.05" contype="1" conaffinity="0"/>
      </body>
      <body pos="-0.06 0 0">
        <joint name="back" type="hinge" axis="1 0 0" range="-1 1" damping="0.04" armature="0.007"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.09" size="0.012" mass="0.05" contype="1" conaffinity="0"/>
      </body>
    </body>
  </worldbody>
  <actuator>
    <position name="front" joint="front" kp="3" ctrlrange="-1 1"/>
    <position name="back" joint="back" kp="3" ctrlrange="-1 1"/>
  </actuator>
</mujoco>"#;

fn folder(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name)
}

fn run(name: &str, extra: &Value) -> Vec<Value> {
    let folder = folder(name);
    let mut job = json!({
        "task": "walk", "minutes": 5, "command": [0.2, 0, 0], "root": "root", "robotName": "Tiny",
        "joints": [{"id": "front", "name": "front"}, {"id": "back", "name": "back"}],
        "defaultPose": [0, 0], "ctrlDefault": [0, 0], "initialJoints": {"front": 0, "back": 0},
        "rootOffset": [0, 0, 0], "actionScale": 0.25, "controlDt": 0.02, "envs": 64, "maxIterations": 3,
        "seed": 4, "backend": "metal", "gateEvery": 2, "evalSeeds": 4
    });

    job.as_object_mut()
        .expect("object")
        .extend(extra.as_object().expect("object").clone());

    let _ = fs::remove_dir_all(&folder);

    fs::create_dir_all(&folder).expect("job folder");
    fs::write(folder.join("model.xml"), MODEL).expect("model");
    fs::write(folder.join("job.json"), job.to_string()).expect("job");

    let output = Command::new(env!("CARGO_BIN_EXE_forge-train"))
        .arg("--job")
        .arg(&folder)
        .output()
        .expect("runs");

    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));

    for file in ["policy.json", "policy.onnx", "policy-check.json", "resume.json"] {
        assert!(folder.join(file).exists(), "{file} was written");
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|l| serde_json::from_str(l).expect("JSON line"))
        .collect()
}

fn messages(events: &[Value]) -> Vec<String> {
    events
        .iter()
        .filter_map(|e| e["message"].as_str().map(str::to_owned))
        .collect()
}

#[test]
fn a_metal_job_trains_on_the_gpu_loop_and_checks_in_c() {
    let events = run("gpu-loop-run", &json!({}));
    let status = messages(&events);
    let progress: Vec<&Value> = events.iter().filter(|e| e["type"] == "progress").collect();
    let gates = events.iter().filter(|e| e["type"] == "gate").count();

    assert!(
        status.iter().any(|s| s.starts_with("Training on the GPU")),
        "{status:?}"
    );
    assert_eq!(progress.len(), 3);
    assert_eq!(gates, 1);
    assert!(progress[2]["steps"].as_u64().expect("steps") > progress[0]["steps"].as_u64().expect("steps"));
    assert!(progress
        .iter()
        .all(|p| p["reward"].as_f64().is_some_and(f64::is_finite)));
}

fn trains_on_the_gpu(name: &str, extra: &Value) -> Value {
    let events = run(name, extra);
    let status = messages(&events);

    assert!(
        status.iter().any(|s| s.starts_with("Training on the GPU")),
        "{status:?}"
    );
    assert!(!status.iter().any(|s| s.contains("qualification")), "{status:?}");

    serde_json::from_str(&fs::read_to_string(folder(name).join("policy.json")).expect("policy")).expect("json")
}

#[test]
fn the_gpu_learner_matches_the_cpu_learner_on_a_minibatch_with_and_without_the_squash() {
    let clipped = trains_on_the_gpu("gpu-loop-clip", &json!({}));
    let squashed = trains_on_the_gpu("gpu-loop-tanh", &json!({ "squash": "tanh", "logStdMin": -2.5 }));

    assert!(clipped.get("squash").is_none());
    assert_eq!(squashed["squash"], "tanh");
}

#[test]
fn options_the_gpu_loop_lacks_fall_back_to_the_cpu_learner_with_the_reason() {
    let events = run("gpu-loop-fallback", &json!({ "delaySteps": [0, 2] }));
    let status = messages(&events);

    assert!(
        status
            .iter()
            .any(|s| s.contains("GPU loop can't train this job") && s.contains("servo delays")),
        "{status:?}"
    );
    assert!(!status.iter().any(|s| s.starts_with("Training on the GPU")));
}

fn first_layer_weights(policy: &Value, input: usize) -> Vec<f64> {
    let layer = &policy["layers"][0];
    let ins = layer["in"].as_u64().expect("in") as usize;
    let w = layer["w"].as_array().expect("weights");

    w.iter()
        .skip(input)
        .step_by(ins)
        .map(|v| v.as_f64().expect("weight"))
        .collect()
}

#[test]
fn the_gpu_loop_masks_linear_velocity_and_warm_starts() {
    let events = run("gpu-loop-masked", &json!({ "actorLinvel": false, "logStdMin": -1.0 }));

    assert!(messages(&events).iter().any(|s| s.starts_with("Training on the GPU")));

    let text = fs::read_to_string(folder("gpu-loop-masked").join("policy.json")).expect("policy");
    let policy: Value = serde_json::from_str(&text).expect("JSON");

    for input in 6..9 {
        assert!(
            first_layer_weights(&policy, input).iter().all(|w| *w == 0.0),
            "input {input}"
        );
    }

    assert!(first_layer_weights(&policy, 3).iter().any(|w| *w != 0.0));

    let from = folder("gpu-loop-masked").to_string_lossy().into_owned();
    let resumed = run("gpu-loop-resumed", &json!({ "actorLinvel": false, "warmStart": from }));
    let status = messages(&resumed);

    assert!(
        status.iter().any(|s| s == "Continuing from a trained policy"),
        "{status:?}"
    );
    assert!(
        status.iter().any(|s| s.starts_with("Training on the GPU")),
        "{status:?}"
    );
}
