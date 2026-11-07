use forge_mujoco::{integration_state, Data, Model};
use forge_train::job;
use forge_train::robot::Robot;
use serde_json::json;
use std::fs;
use std::path::PathBuf;

const HELD: f64 = 0.6;
const DELAY: &str = r#" delay="0.02" nsample="11" interp="linear""#;

const MODEL: &str = r#"<mujoco model="delayed">
  <option timestep="0.002"/>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 0.05"/>
    <body name="base" pos="0 0 0.115">
      <freejoint name="root"/>
      <geom type="box" size="0.08 0.05 0.02" mass="0.6"/>
      <body pos="0.07 0 0">
        <joint name="leg" type="hinge" axis="1 0 0" range="-1 1" damping="0.04" armature="0.007"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.1" size="0.012" mass="0.05"/>
      </body>
    </body>
  </worldbody>
  <actuator>
    <position name="leg" joint="leg" kp="20" kv="0" ctrlrange="-1 1" delay="0.02" nsample="11" interp="linear"/>
  </actuator>
</mujoco>"#;

fn load(name: &str, xml: &str) -> Model {
    let folder = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);

    fs::create_dir_all(&folder).expect("folder");
    fs::write(folder.join("model.xml"), xml).expect("model");

    Model::load(&folder.join("model.xml")).expect("loads")
}

fn joint_after_one_control_step(model: &Model, data: &mut Data) -> f64 {
    data.ctrl().fill(HELD);
    (0..10).for_each(|_| data.step(model));
    data.qpos()[7]
}

fn start_from(model: &Model, qpos: &[f64]) -> Data {
    let mut data = Data::new(model);

    data.qpos().copy_from_slice(qpos);
    data.ctrl().fill(HELD);
    data.forward(model);

    data
}

#[test]
fn a_reset_to_the_start_row_does_not_kick_delayed_servos() {
    let job = job::parse(&json!({
        "task": "walk", "minutes": 1, "command": [0.2, 0, 0], "root": "root",
        "joints": [{"id": "leg", "name": "leg"}],
        "defaultPose": [HELD], "ctrlDefault": [HELD],
        "initialJoints": {"leg": HELD}, "rootOffset": [0, 0, 0],
        "actionScale": 0.25, "controlDt": 0.02
    }))
    .expect("job");
    let robot = Robot::load(load("delayed-servo", MODEL), job).expect("robot");
    let instant = load("instant-servo", &MODEL.replace(DELAY, ""));

    assert!(
        !robot.holds_pose,
        "the fixture should tip over, so its start row comes from a reset"
    );

    let mut primed = Data::new(&robot.model);

    primed.set_state(&robot.model, &robot.start_row, integration_state());

    let qpos = primed.qpos().to_vec();
    let reference = joint_after_one_control_step(&instant, &mut start_from(&instant, &qpos));
    let unprimed = joint_after_one_control_step(&robot.model, &mut start_from(&robot.model, &qpos));
    let held = joint_after_one_control_step(&robot.model, &mut primed);

    assert!(
        (unprimed - reference).abs() > 0.05,
        "an empty history should kick the joint: {unprimed} against {reference}"
    );
    assert!(
        (held - reference).abs() < 1e-3,
        "the start row kicked the joint: {held} against {reference}"
    );
}
