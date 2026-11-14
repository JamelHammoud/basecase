use forge_mujoco::Model;
use forge_train::envs::Envs;
use forge_train::gpu_loop;
use forge_train::job::{self, Job};
use forge_train::robot::Robot;
use serde_json::{json, Value};
use std::path::PathBuf;

const MODEL: &str = r#"<mujoco model="handoff">
  <option timestep="0.002"/>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 0.05"/>
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

const NOISE: f64 = 0.05;

fn model() -> Model {
    let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("start-states-model.xml");

    std::fs::write(&path, MODEL).expect("model");
    Model::load(&path).expect("model loads")
}

fn job(extra: Value) -> Result<Job, String> {
    let mut root = json!({
        "task": "stand", "minutes": 1, "command": [0, 0, 0], "root": "root", "robotName": "Hand-off",
        "joints": [{"id": "tilt", "name": "tilt"}], "defaultPose": [0], "ctrlDefault": [0],
        "initialJoints": {"tilt": 0}, "rootOffset": [0, 0, 0], "actionScale": 0.25, "controlDt": 0.02,
        "resetNoise": NOISE
    });

    root.as_object_mut()
        .expect("object")
        .extend(extra.as_object().expect("object").clone());
    job::parse(&root)
}

fn mid_stride(joint: f64, joint_vel: f64, height: f64) -> Value {
    json!({
        "joints": [joint], "jointVels": [joint_vel], "height": height,
        "quat": [1, 0, 0, 0], "linear": [0.2, 0, 0.1], "angular": [0, 0, 0.7]
    })
}

#[test]
fn a_reset_lands_on_one_of_the_given_states_and_the_gpu_loop_refuses_them() {
    let states = [(0.3, 1.5, 0.4), (-0.3, -1.5, 0.5)];
    let list: Vec<Value> = states.iter().map(|&(q, v, h)| mid_stride(q, v, h)).collect();
    let robot = Robot::load(model(), job(json!({ "startStates": list })).expect("job parses")).expect("robot loads");
    let mut envs = Envs::new(&robot, 1, 5, false).expect("envs");
    let mut obs = vec![0.0; robot.nobs()];
    let mut seen = [false; 2];

    for _ in 0..24 {
        envs.reset(0);
        envs.observe(&mut obs);

        let height = envs.root_height(0);
        let which = states
            .iter()
            .position(|s| (s.2 - height).abs() < 1e-12)
            .expect("a given height");
        let (joint, joint_vel, _) = states[which];

        seen[which] = true;
        assert!((f64::from(obs[12]) - joint).abs() <= NOISE + 1e-6, "{obs:?}");
        assert!((f64::from(obs[13]) - joint_vel).abs() < 1e-6, "{obs:?}");
        assert!((f64::from(obs[5]) - 0.7).abs() < 1e-6, "{obs:?}");
        assert!(
            (f64::from(obs[6]) - 0.2).abs() < 1e-6 && f64::from(obs[7]).abs() < 1e-6,
            "{obs:?}"
        );
        assert!((f64::from(obs[8]) - 0.1).abs() < 1e-6, "{obs:?}");
    }

    assert_eq!(seen, [true, true]);
    assert!(gpu_loop::task::lower(&robot)
        .expect_err("refused")
        .contains("another skill's states"));
}

#[test]
fn start_states_need_one_number_per_joint() {
    let wrong = json!({ "startStates": [{
        "joints": [0, 0], "jointVels": [0], "height": 0.1,
        "quat": [1, 0, 0, 0], "linear": [0, 0, 0], "angular": [0, 0, 0]
    }] });
    let refused = job(wrong).expect_err("refused");

    assert!(
        refused.contains("has 2 numbers in joints and 1 in jointVels; each needs 1"),
        "{refused}"
    );
}
