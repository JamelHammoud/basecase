use forge_train::snapshots::{thin, KEPT};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
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

const STEPS_PER_ITERATION: u64 = 24 * 8;

const LEG: &str = r#"<geom type="capsule" fromto="0 0 0 0 0 -0.09" size="0.012" mass="0.05"/>"#;
const FOOTED_LEG: &str = r#"<geom type="capsule" fromto="0 0 0 0 0 -0.09" size="0.012" mass="0.05"/>
        <geom type="box" pos="0 0 -0.095" size="0.015 0.06 0.008" mass="0.02"/>"#;

fn job_folder(name: &str, extra: Value) -> PathBuf {
    job_folder_with(name, MODEL, extra)
}

fn job_folder_with(name: &str, model: &str, extra: Value) -> PathBuf {
    let folder = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("snapshots").join(name);
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
    fs::write(folder.join("model.xml"), model).expect("model");
    fs::write(folder.join("job.json"), job.to_string()).expect("job");

    folder
}

fn run(folder: &Path) -> Vec<Value> {
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

fn of_type<'a>(events: &'a [Value], kind: &str) -> Vec<&'a Value> {
    events.iter().filter(|e| e["type"] == kind).collect()
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).expect("file")).expect("json")
}

fn snapshot_files(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(folder.join("snapshots"))
        .expect("snapshots folder")
        .map(|entry| entry.expect("entry").file_name().to_string_lossy().into_owned())
        .collect();

    names.sort_by_key(|name| name.trim_end_matches(".json").parse::<usize>().unwrap_or(usize::MAX));

    names
}

#[test]
fn every_gate_writes_the_copy_it_judges() {
    let folder = job_folder("three-gates", json!({ "gateEvery": 1, "evalSeeds": 2 }));
    let events = run(&folder);
    let gates = of_type(&events, "gate");
    let snapshots = of_type(&events, "snapshot");

    assert_eq!(gates.len(), 3);
    assert_eq!(snapshots.len(), 3);
    assert_eq!(snapshot_files(&folder), vec!["1.json", "2.json", "3.json"]);

    for gate in gates {
        let iteration = gate["iteration"].as_u64().expect("iteration");
        let file = format!("snapshots/{iteration}.json");
        let snapshot = snapshots
            .iter()
            .find(|s| s["iteration"] == iteration)
            .expect("snapshot event");
        let policy = read_json(&folder.join(&file));

        assert_eq!(gate["snapshot"], json!(file));
        assert_eq!(
            **snapshot,
            json!({ "type": "snapshot", "iteration": iteration, "steps": gate["steps"], "file": file })
        );
        assert_eq!(policy["format"], "basecase-policy");
        assert_eq!(policy["trainedSteps"], gate["steps"]);
        assert_eq!(gate["steps"], iteration * STEPS_PER_ITERATION);
    }
}

#[test]
fn a_passing_gate_saves_exactly_the_snapshot_it_wrote() {
    let footed = MODEL.replace(LEG, FOOTED_LEG);
    let folder = job_folder_with(
        "passing-gate",
        &footed,
        json!({ "task": "stand", "command": [0, 0, 0], "gateEvery": 1, "evalSeeds": 2, "maxIterations": 6 }),
    );
    let events = run(&folder);
    let gate = of_type(&events, "gate").last().copied().expect("gate").clone();
    let done = of_type(&events, "done")[0].clone();
    let file = gate["snapshot"].as_str().expect("snapshot file");
    let mut snapshot = read_json(&folder.join(file));
    let mut policy = read_json(&folder.join("policy.json"));

    assert_eq!(
        gate["passed"], 2,
        "the tiny robot must pass a stand gate for this test to mean anything"
    );
    assert_eq!(done["steps"], gate["steps"]);

    snapshot["createdAt"] = Value::Null;
    policy["createdAt"] = Value::Null;

    assert_eq!(snapshot.to_string(), policy.to_string());
}

#[test]
fn forty_snapshots_thin_to_twelve_evenly() {
    let folder = job_folder(
        "forty-gates",
        json!({ "gateEvery": 1, "evalSeeds": 1, "maxIterations": 40 }),
    );
    let events = run(&folder);
    let mut expected: Vec<usize> = Vec::new();

    for written in 1..=40 {
        expected.push(written);

        if let Some(drop) = thin(&expected) {
            expected.remove(drop);
        }
    }

    let expected_files: Vec<String> = expected.iter().map(|n| format!("{n}.json")).collect();

    assert_eq!(of_type(&events, "snapshot").len(), 40);
    assert_eq!(expected.len(), KEPT);
    assert_eq!(snapshot_files(&folder), expected_files);
    assert!(expected_files.contains(&"1.json".to_owned()));
    assert!(expected_files.contains(&"40.json".to_owned()));
}

#[test]
fn timed_snapshots_need_no_gates() {
    let folder = job_folder("timed", json!({ "snapshotEveryS": 0.001, "maxIterations": 10 }));
    let events = run(&folder);
    let snapshots = of_type(&events, "snapshot");

    assert!(of_type(&events, "gate").is_empty());
    assert!(snapshots.len() >= 2, "{} snapshots", snapshots.len());
    assert_eq!(snapshot_files(&folder).len(), snapshots.len());

    for snapshot in snapshots {
        let iteration = snapshot["iteration"].as_u64().expect("iteration");
        let file = format!("snapshots/{iteration}.json");
        let policy = read_json(&folder.join(&file));

        assert_eq!(snapshot["file"], json!(file));
        assert_eq!(snapshot["steps"], iteration * STEPS_PER_ITERATION);
        assert_eq!(policy["trainedSteps"], snapshot["steps"]);
    }
}

#[test]
fn a_run_without_gates_or_timed_snapshots_writes_none() {
    let folder = job_folder("none", json!({}));
    let events = run(&folder);

    assert!(of_type(&events, "snapshot").is_empty());
    assert!(!folder.join("snapshots").exists());
}
