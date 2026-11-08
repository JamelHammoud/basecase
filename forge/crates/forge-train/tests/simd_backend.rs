use forge_mujoco::Model;
use forge_train::envs::{Envs, StepResult};
use forge_train::events::Phases;
use forge_train::job;
use forge_train::physics::Engine;
use forge_train::robot::Robot;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

const HULL: &str = "0.01 0.01 0 0.01 -0.01 0 0.01 -0.01 -0.065 -0.01 0.01 0 \
                    -0.01 0.01 -0.065 -0.01 -0.01 -0.065 0.01 0.01 -0.065 -0.01 -0.01 0";
const BODY: &str =
    "0.08 -0.1 0 0.08 0.1 0.05 0.08 -0.1 0.05 0.08 0.1 0 -0.08 0.1 0 -0.08 0.1 0.05 -0.08 -0.1 0 -0.08 -0.1 0.05";

fn leg(i: usize, x: f64, y: f64) -> String {
    format!(
        r#"<body name="hip{i}" pos="{x} {y} 0">
        <joint name="a{i}" type="hinge" axis="0 -1 0" range="-0.7 0.7" damping="0.038" armature="0.0076" frictionloss="0.019"/>
        <geom type="mesh" mesh="leg" contype="1" conaffinity="0" mass="0.07"/>
        <body name="knee{i}" pos="0 0 -0.065">
          <joint name="b{i}" type="hinge" axis="1 0 0" range="-2.2 2.2" damping="0.038" armature="0.0076" frictionloss="0.019"/>
          <geom type="mesh" mesh="leg" contype="1" conaffinity="0" mass="0.07"/>
        </body>
      </body>"#
    )
}

fn joint_names() -> Vec<String> {
    (0..4).flat_map(|i| [format!("a{i}"), format!("b{i}")]).collect()
}

fn hull_robot() -> String {
    let legs: String = [(-0.07, 0.09), (0.07, 0.09), (-0.07, -0.09), (0.07, -0.09)]
        .iter()
        .enumerate()
        .map(|(i, (x, y))| leg(i, *x, *y))
        .collect();
    let actuators: String = joint_names()
        .iter()
        .map(|j| {
            format!(
                r#"<position name="{j}" joint="{j}" kp="11" dampratio="1" forcerange="-1.9 1.9" ctrlrange="-0.7 0.7"/>"#
            )
        })
        .collect();

    format!(
        r#"<mujoco model="hull">
  <compiler angle="radian" inertiafromgeom="true" boundmass="0.0005" boundinertia="1e-8"/>
  <option timestep="0.002" integrator="implicitfast"/>
  <default><geom friction="0.9 0.02 0.002" solref="0.004 1" condim="3"/></default>
  <asset>
    <mesh name="body" vertex="{BODY}" maxhullvert="96" inertia="convex"/>
    <mesh name="leg" vertex="{HULL}" maxhullvert="96" inertia="convex"/>
  </asset>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 0.05" contype="0" conaffinity="1"/>
    <body name="root" pos="0 0 0.135">
      <freejoint name="root"/>
      <geom type="mesh" mesh="body" contype="1" conaffinity="0" mass="0.7"/>
      {legs}
    </body>
  </worldbody>
  <actuator>{actuators}</actuator>
</mujoco>"#
    )
}

fn job_json(backend: &str) -> Value {
    let joints: Vec<Value> = joint_names().iter().map(|j| json!({"id": j, "name": j})).collect();
    let initial: serde_json::Map<String, Value> = joint_names().iter().map(|j| (j.clone(), json!(0))).collect();

    let zeros = vec![0.0; 8];

    json!({
        "task": "walk", "minutes": 5, "command": [0.2, 0, 0], "root": "root", "robotName": "Hull",
        "joints": joints, "defaultPose": zeros, "ctrlDefault": zeros, "initialJoints": initial,
        "rootOffset": [0, 0, 0], "actionScale": 0.25, "controlDt": 0.02, "envs": 8, "maxIterations": 3,
        "seed": 4, "backend": backend
    })
}

fn folder(name: &str, xml: &str, job: &Value) -> PathBuf {
    let folder = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&folder);

    fs::create_dir_all(&folder).expect("job folder");
    fs::write(folder.join("model.xml"), xml).expect("model");
    fs::write(folder.join("job.json"), job.to_string()).expect("job");
    folder
}

fn robot(name: &str, backend: &str) -> Robot {
    let dir = folder(name, &hull_robot(), &job_json(backend));
    let model = Model::load(&dir.join("model.xml")).expect("loads");

    Robot::load(model, job::load(&dir).expect("job")).expect("robot")
}

fn rollout(robot: &Robot) -> Vec<f32> {
    let count = 8;
    let mut envs = Envs::new(robot, count, 11, true).expect("envs");
    let mut obs = vec![0.0; count * robot.nobs()];
    let (mut reward, mut fell, mut timeout) = (vec![0.0; count], vec![false; count], vec![false; count]);
    let mut phases = Phases::default();
    let mut trace = Vec::new();

    for t in 0..80 {
        let actions: Vec<f32> = (0..count * robot.nact)
            .map(|k| ((t * 7 + k * 3) as f32 * 0.37).sin())
            .collect();
        let result = StepResult {
            reward: &mut reward,
            fell: &mut fell,
            timeout: &mut timeout,
        };

        envs.step(&actions, result, &mut phases).expect("steps");
        envs.observe(&mut obs);
        trace.extend_from_slice(&obs);
        trace.extend_from_slice(&reward);
    }

    trace
}

#[test]
fn the_simd_backend_steps_the_same_randomized_robots_as_mujoco() {
    let simd = robot("simd-envs", "simd");
    let mujoco = robot("mujoco-envs", "mujoco");

    assert!(matches!(simd.engine, Engine::Simd(_)));
    assert!(matches!(mujoco.engine, Engine::Mujoco { refusal: None }));

    let (a, b) = (rollout(&simd), rollout(&mujoco));
    let worst = a.iter().zip(&b).map(|(x, y)| (x - y).abs()).fold(0.0, f32::max);

    assert!(worst < 1e-4, "observations and rewards differ by {worst}");
}

fn train(dir: &PathBuf) -> Vec<Value> {
    let output = Command::new(env!("CARGO_BIN_EXE_forge-train"))
        .arg("--job")
        .arg(dir)
        .output()
        .expect("runs");

    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|l| serde_json::from_str(l).expect("JSON line"))
        .collect()
}

fn statuses(events: &[Value]) -> Vec<String> {
    events
        .iter()
        .filter(|e| e["type"] == "status")
        .filter_map(|e| e["message"].as_str().map(str::to_owned))
        .collect()
}

#[test]
fn a_simd_job_trains_and_says_which_engine_stepped_it() {
    let dir = folder("simd-train", &hull_robot(), &job_json("simd"));
    let events = train(&dir);

    assert!(statuses(&events)
        .iter()
        .any(|s| s == "Stepping physics on Forge's SIMD engine"));
    assert!(events.iter().any(|e| e["type"] == "done"));
    assert!(dir.join("policy.json").exists());
}

#[test]
fn a_model_outside_the_subset_trains_on_mujoco_and_says_why() {
    let xml = hull_robot().replace(
        r#"integrator="implicitfast""#,
        r#"integrator="implicitfast" cone="elliptic""#,
    );
    let dir = folder("simd-refused", &xml, &job_json("simd"));
    let events = train(&dir);
    let said = statuses(&events);

    assert!(
        said.iter()
            .any(|s| s.contains("elliptic friction cones") && s.ends_with("Stepping physics on C MuJoCo")),
        "{said:?}"
    );
    assert!(events.iter().any(|e| e["type"] == "done"));
}

#[cfg(target_os = "macos")]
#[test]
fn the_metal_backend_steps_the_same_randomized_robots_as_mujoco() {
    let metal = robot("metal-envs", "metal");
    let mujoco = robot("metal-mujoco-envs", "mujoco");

    assert!(matches!(metal.engine, Engine::Metal { .. }));

    let (a, b) = (rollout(&metal), rollout(&mujoco));
    let worst = a.iter().zip(&b).map(|(x, y)| (x - y).abs()).fold(0.0, f32::max);

    assert!(worst < 1e-3, "observations and rewards differ by {worst}");
}

#[cfg(target_os = "macos")]
#[test]
fn a_metal_job_trains_and_says_which_engine_stepped_it() {
    let dir = folder("metal-train", &hull_robot(), &job_json("metal"));
    let events = train(&dir);

    assert!(statuses(&events)
        .iter()
        .any(|s| s.starts_with("Stepping physics on Forge's Metal engine")));
    assert!(events.iter().any(|e| e["type"] == "done"));
}

#[cfg(not(target_os = "macos"))]
#[test]
fn a_metal_job_off_a_mac_trains_on_mujoco_and_says_why() {
    let dir = folder("metal-elsewhere", &hull_robot(), &job_json("metal"));
    let said = statuses(&train(&dir));

    assert!(said.iter().any(|s| s.contains("needs a Mac")), "{said:?}");
}
