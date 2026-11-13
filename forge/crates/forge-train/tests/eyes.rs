use forge_mujoco::Model;
use forge_train::envs::Envs;
use forge_train::gpu_loop;
use forge_train::job::{self, Backend, Job};
use forge_train::robot::Robot;
use serde_json::{json, Value};
use std::path::PathBuf;

const MODEL: &str = r#"<mujoco model="eyes">
  <option timestep="0.002"/>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 0.05"/>
    <geom name="wall" type="box" pos="0 -1.1 0.5" size="1 0.1 0.5"/>
    <geom name="marker" type="sphere" pos="0.4 0 0.1" size="0.05" group="3" contype="0" conaffinity="0"/>
    <body name="base" pos="0 0 0.05">
      <freejoint name="root"/>
      <geom type="box" size="0.1 0.1 0.05" mass="1"/>
      <body name="arm" pos="0 0.08 0.05">
        <joint name="tilt" type="hinge" axis="1 0 0" range="-0.5 0.5" damping="0.1"/>
        <geom type="box" size="0.01 0.01 0.01" mass="0.01" contype="0" conaffinity="0"/>
      </body>
    </body>
  </worldbody>
  <actuator>
    <position name="tilt" joint="tilt" kp="2" ctrlrange="-0.5 0.5"/>
  </actuator>
</mujoco>"#;

const RANGE_M: f64 = 3.0;

fn model() -> Model {
    let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("eyes-model.xml");

    std::fs::write(&path, MODEL).expect("model");
    Model::load(&path).expect("model loads")
}

fn eye() -> Value {
    json!({
        "part": "cam-1", "body": "base", "pos": [0, 0, 0.05], "cols": 5, "rows": 1, "rangeM": RANGE_M,
        "dirs": [0, -1, 0,  0, 0, -1,  0, 0, 1,  0, 0, 0,  1, 0, 0]
    })
}

fn job(extra: Value) -> Job {
    let mut root = json!({
        "task": "stand", "minutes": 1, "command": [0, 0, 0], "root": "root", "robotName": "Eyes",
        "joints": [{"id": "tilt", "name": "tilt"}], "defaultPose": [0], "ctrlDefault": [0],
        "initialJoints": {"tilt": 0}, "rootOffset": [0, 0, 0], "actionScale": 0.25, "controlDt": 0.02
    });

    root.as_object_mut()
        .expect("object")
        .extend(extra.as_object().expect("object").clone());
    job::parse(&root).expect("job parses")
}

fn robot(extra: Value) -> Robot {
    Robot::load(model(), job(extra)).expect("robot loads")
}

fn first_observation(robot: &Robot) -> Vec<f32> {
    let mut envs = Envs::new(robot, 2, 3, false).expect("envs");
    let mut obs = vec![0.0; 2 * robot.nobs()];

    envs.place_at_start_exactly(0);
    envs.observe(&mut obs);
    obs.truncate(robot.nobs());
    obs
}

#[test]
fn an_eye_reads_the_wall_the_floor_and_nothing() {
    let seeing = robot(json!({ "eyes": [eye()] }));
    let obs = first_observation(&seeing);
    let rays = &obs[12 + 3..];
    let eye_height = 0.10;

    assert_eq!(seeing.nobs(), 12 + 3 + 5);
    assert!(
        (rays[0] as f64 - 1.0 / RANGE_M).abs() < 2e-3,
        "wall at 1 m reads {}",
        rays[0]
    );
    assert!(
        (rays[1] as f64 - eye_height / RANGE_M).abs() < 2e-3,
        "floor reads {}",
        rays[1]
    );
    assert_eq!(
        &rays[2..],
        &[1.0, 1.0, 1.0],
        "sky, no ray, and a hidden marker read the full range"
    );
}

#[test]
fn a_blind_job_observes_exactly_what_it_did() {
    let blind = robot(json!({}));
    let seeing = robot(json!({ "eyes": [eye(), eye()] }));
    let plain = first_observation(&blind);
    let with_eyes = first_observation(&seeing);

    assert_eq!(blind.nobs(), 12 + 3);
    assert_eq!(seeing.nobs(), 12 + 3 + 10);
    assert_eq!(&with_eyes[..blind.nobs()], plain.as_slice());
    assert_eq!(&with_eyes[15..20], &with_eyes[20..25]);
}

#[test]
fn a_missing_eye_body_fails_with_its_name() {
    let mut lost = eye();

    lost["body"] = json!("nowhere");

    let why = Robot::load(model(), job(json!({ "eyes": [lost] })))
        .err()
        .expect("must fail");

    assert!(why.contains("nowhere") && why.contains("cam-1"), "{why}");
}

#[test]
fn forge_engines_and_the_gpu_loop_refuse_eyes_with_a_reason() {
    let seeing = Robot::load(
        model(),
        Job {
            backend: Backend::Simd,
            ..job(json!({ "eyes": [eye()] }))
        },
    )
    .expect("robot loads");
    let status = seeing.engine.status().expect("a status line");
    let gpu = gpu_loop::task::lower(&seeing).expect_err("refused");

    assert!(
        status.contains("can't cast eye rays") && status.contains("C MuJoCo"),
        "{status}"
    );
    assert!(gpu.contains("can't cast eye rays"), "{gpu}");
}

#[test]
fn a_start_area_moves_every_reset_and_the_gpu_loop_refuses_it() {
    let area = json!({ "startArea": { "forwardM": [1, 1], "sideM": [-0.5, -0.5] } });
    let moved = robot(area);
    let blind = robot(json!({}));
    let mut envs = Envs::new(&moved, 1, 3, false).expect("envs");
    let mut still = Envs::new(&blind, 1, 3, false).expect("envs");
    let (at, home) = (envs.root_xy(0), still.root_xy(0));

    assert!((at[0] - home[0] - 1.0).abs() < 1e-12 && (at[1] - home[1] + 0.5).abs() < 1e-12);
    envs.reset(0);
    still.reset(0);
    assert!((envs.root_xy(0)[0] - still.root_xy(0)[0] - 1.0).abs() < 1e-12);
    assert!(gpu_loop::task::lower(&moved)
        .expect_err("refused")
        .contains("start area"));
}
