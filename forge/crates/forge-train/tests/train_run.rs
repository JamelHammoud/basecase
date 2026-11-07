use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

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

fn run(folder: &PathBuf) -> Vec<Value> {
    let output = Command::new(env!("CARGO_BIN_EXE_forge-train"))
        .arg("--job")
        .arg(folder)
        .output()
        .expect("runs");

    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|l| serde_json::from_str(l).expect("JSON line"))
        .collect()
}

#[test]
fn a_short_run_prints_train_py_events_and_writes_every_output() {
    let folder = job_folder("short-run", json!({ "gateEvery": 2, "evalSeeds": 4 }));
    let events = run(&folder);
    let kinds: Vec<&str> = events.iter().filter_map(|e| e["type"].as_str()).collect();
    let progress = events.iter().rfind(|e| e["type"] == "progress").expect("progress");
    let done = events.iter().find(|e| e["type"] == "done").expect("done");

    assert_eq!(kinds.iter().filter(|k| **k == "progress").count(), 3);
    assert_eq!(kinds.iter().filter(|k| **k == "gate").count(), 1);
    assert_eq!(progress["steps"], 3 * 24 * 8);

    for key in ["physics", "observe", "reward", "inference", "gradient"] {
        assert!(progress["phases"][key].as_f64().expect("phase") >= 0.0, "phase {key}");
    }

    assert!(progress["phases"]["physics"].as_f64().expect("physics") > 0.0);

    for key in ["fellAt", "seconds", "forward", "travelled"] {
        assert!(done["eval"].get(key).is_some(), "eval {key}");
    }

    assert_eq!(done["gate"]["seeds"], 4);

    let policy: Value =
        serde_json::from_str(&fs::read_to_string(folder.join("policy.json")).expect("policy")).expect("json");
    let check: Value =
        serde_json::from_str(&fs::read_to_string(folder.join("policy-check.json")).expect("check")).expect("json");

    assert_eq!(policy["format"], "basecase-policy");
    assert_eq!(policy["joints"], json!(["front", "back"]));
    assert_eq!(policy["obsMean"].as_array().expect("mean").len(), 12 + 3 * 2);
    assert_eq!(policy["layers"].as_array().expect("layers").len(), 4);
    assert!(check["samples"].as_array().expect("samples").len() >= 8);
    assert!(fs::metadata(folder.join("policy.onnx")).expect("onnx").len() > 1000);
}

fn rewards(events: &[Value]) -> Vec<f64> {
    events
        .iter()
        .filter(|e| e["type"] == "progress")
        .map(|e| e["reward"].as_f64().expect("reward"))
        .collect()
}

#[test]
fn tuning_physics_threads_never_changes_the_run() {
    let tuned = run(&job_folder("tuned", json!({ "envs": 16, "maxIterations": 14 })));
    let fixed = run(&job_folder(
        "fixed",
        json!({ "envs": 16, "maxIterations": 14, "threads": 3 }),
    ));

    assert_eq!(rewards(&tuned).len(), 14);
    assert_eq!(rewards(&tuned), rewards(&fixed));
}

#[test]
fn a_stop_file_ends_training_and_still_saves() {
    let folder = job_folder("stopped", json!({ "maxIterations": 1000 }));

    fs::write(folder.join("stop"), "").expect("stop file");

    let events = run(&folder);
    let done = events.iter().find(|e| e["type"] == "done").expect("done");

    assert_eq!(done["stopped"], true);
    assert_eq!(done["steps"], 0);
    assert!(folder.join("policy.json").exists());
}

#[test]
fn a_missing_joint_fails_with_its_name() {
    let folder = job_folder("bad-joint", json!({ "joints": [{"id": "x", "name": "nope"}] }));
    let output = Command::new(env!("CARGO_BIN_EXE_forge-train"))
        .arg("--job")
        .arg(&folder)
        .output()
        .expect("runs");

    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("nope"));
}

fn assert_same_events(algo: &str) {
    let folder = job_folder(
        &format!("off-policy-{algo}"),
        json!({ "algo": algo, "envs": 64, "maxIterations": 72, "gateEvery": 36, "evalSeeds": 4 }),
    );
    let events = run(&folder);
    let progress = events.iter().rfind(|e| e["type"] == "progress").expect("progress");
    let done = events.iter().find(|e| e["type"] == "done").expect("done");

    assert_eq!(events.iter().filter(|e| e["type"] == "gate").count(), 2);
    assert_eq!(progress["steps"], 72 * 64);
    assert!(progress["phases"]["gradient"].as_f64().expect("gradient") > 0.0);
    assert_eq!(done["gate"]["seeds"], 4);

    let policy: Value =
        serde_json::from_str(&fs::read_to_string(folder.join("policy.json")).expect("policy")).expect("json");

    assert_eq!(policy["squash"], "tanh");
    assert_eq!(
        policy["layers"].as_array().expect("layers").last().expect("head")["out"],
        2
    );
}

#[test]
fn fastsac_reports_the_same_events() {
    assert_same_events("fastsac");
}

#[test]
fn flashsac_reports_the_same_events() {
    assert_same_events("flashsac");
}

#[test]
fn the_adam_vector_names_every_field() {
    let file = PathBuf::from(env!("CARGO_TARGET_TMPDIR"))
        .join("adam")
        .join("vector.json");
    let output = Command::new(env!("CARGO_BIN_EXE_forge-train"))
        .arg("--adam-vector")
        .arg(&file)
        .output()
        .expect("runs");

    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));

    let vector: Value = serde_json::from_str(&fs::read_to_string(&file).expect("vector")).expect("json");

    for key in ["initial", "lr", "x", "y", "steps", "final"] {
        assert!(vector.get(key).is_some(), "{key}");
    }

    assert_eq!(
        vector["initial"].as_array().map(Vec::len),
        vector["final"].as_array().map(Vec::len)
    );
    assert_ne!(vector["initial"][0]["w"], vector["final"][0]["w"]);
}
