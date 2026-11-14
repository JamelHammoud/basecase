use super::randomize;
use crate::job::parse;
use crate::options::Randomization;
use crate::physics::Physics;
use crate::rng::Rng;
use crate::robot::{ModelRef, Robot};
use forge_mujoco::Model;
use serde_json::{json, Value};
use std::fs;

const ENVS: usize = 16;

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

fn robot(randomization: Value) -> Robot {
    let folder = std::env::temp_dir().join("forge-randomize-widened");
    let job = json!({
        "task": "walk", "minutes": 1, "command": [0.2, 0, 0], "root": "root", "robotName": "Tiny",
        "joints": [{"id": "front", "name": "front"}, {"id": "back", "name": "back"}],
        "defaultPose": [0, 0], "ctrlDefault": [0, 0], "initialJoints": {"front": 0, "back": 0},
        "rootOffset": [0, 0, 0], "actionScale": 0.25, "controlDt": 0.02, "envs": ENVS, "seed": 3,
        "randomization": randomization
    });

    fs::create_dir_all(&folder).expect("folder");
    fs::write(folder.join("model.xml"), MODEL).expect("model");

    let model = Model::load(&folder.join("model.xml")).expect("model loads");

    Robot::load(model, parse(&job).expect("job parses")).expect("robot loads")
}

fn table(physics: &mut Physics, field: &str) -> Vec<f64> {
    physics.expand(field).expect(field).0.to_vec()
}

fn scales(before: &[f64], after: &[f64], stride: usize) -> Vec<f64> {
    before
        .iter()
        .zip(after)
        .step_by(stride)
        .filter(|(b, _)| **b != 0.0)
        .map(|(b, a)| a / b)
        .collect()
}

fn assert_widened(found: &[f64], [low, high]: [f64; 2], old_high: f64) {
    assert!(!found.is_empty());
    assert!(
        found.iter().all(|s| (low..=high).contains(s) && *s > old_high),
        "{found:?} outside {low}..{high}"
    );
}

#[test]
fn widened_ranges_draw_outside_the_default_ones() {
    let robot = robot(json!({ "friction": [2, 3], "mass": [2, 4], "servo": [1.5, 2] }));
    let mut physics = Physics::new(&robot.model, &robot.engine, &robot.layout, (ENVS, 1)).expect("physics");
    let friction = table(&mut physics, "geom_friction");
    let mass = table(&mut physics, "body_mass");
    let gain = table(&mut physics, "actuator_gainprm");
    let mut rngs: Vec<Rng> = (0..ENVS).map(|i| Rng::new(3, i as u64)).collect();

    randomize(&mut physics, &robot, &mut rngs).expect("randomizes");

    let defaults = Randomization::default();

    assert_widened(
        &scales(&friction, &table(&mut physics, "geom_friction"), 3),
        [2.0, 3.0],
        defaults.friction[1],
    );
    assert_widened(
        &scales(&mass, &table(&mut physics, "body_mass"), 1),
        [2.0, 4.0],
        defaults.mass[1],
    );
    assert_widened(
        &scales(&gain, &table(&mut physics, "actuator_gainprm"), ModelRef::gain_width()),
        [1.5, 2.0],
        defaults.servo[1],
    );
}
