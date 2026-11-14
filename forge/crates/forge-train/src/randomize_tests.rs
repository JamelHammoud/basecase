use super::{randomize, SERVO_RANGE};
use crate::physics::{Engine, Physics};
use crate::rng::Rng;
use forge_mujoco::Model;
use forge_sim::rowmap::RowMap;
use std::fs;

const ENVS: usize = 4;
const KP: f64 = 3.0;
const KV: f64 = 0.2;

const MODEL: &str = r#"<mujoco model="two-servos">
  <worldbody>
    <body name="base" pos="0 0 0.12">
      <freejoint name="root"/>
      <geom type="box" size="0.08 0.05 0.02" mass="0.6"/>
      <body pos="0.06 0 0">
        <joint name="front" type="hinge" axis="1 0 0" range="-1 1"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.09" size="0.012" mass="0.05"/>
      </body>
      <body pos="-0.06 0 0">
        <joint name="back" type="hinge" axis="1 0 0" range="-1 1"/>
        <geom type="capsule" fromto="0 0 0 0 0 -0.09" size="0.012" mass="0.05"/>
      </body>
    </body>
  </worldbody>
  <actuator>
    <position name="front" joint="front" kp="3" kv="0.2" ctrlrange="-1 1"/>
    <position name="back" joint="back" kp="3" kv="0.2" ctrlrange="-1 1"/>
  </actuator>
</mujoco>"#;

fn model() -> Model {
    let folder = std::env::temp_dir().join(format!("forge-randomize-{:?}", std::thread::current().id()));

    fs::create_dir_all(&folder).expect("folder");
    fs::write(folder.join("model.xml"), MODEL).expect("model");
    Model::load(&folder.join("model.xml")).expect("model loads")
}

fn randomized(gains: &[Vec<Option<f64>>]) -> Result<Vec<[f64; 3]>, String> {
    let model = model();
    let layout = RowMap::new(&model)?.offsets();
    let mut physics = Physics::new(&model, &Engine::Mujoco { refusal: None }, &layout, (ENVS, 1))?;
    let mut rngs: Vec<Rng> = (0..ENVS).map(|i| Rng::new(9, i as u64)).collect();

    randomize(&mut physics, 2, gains, &mut rngs)?;

    let gain = physics.expand("actuator_gainprm")?.0.to_vec();
    let bias = physics.expand("actuator_biasprm")?.0.to_vec();

    Ok(gain
        .chunks_exact(Model::gain_width())
        .zip(bias.chunks_exact(Model::bias_width()))
        .map(|(g, b)| [g[0] / KP, -b[1] / KP, -b[2] / KV])
        .collect())
}

fn same_scale([gain, stiffness, damping]: [f64; 3]) -> bool {
    (gain - stiffness).abs() < 1e-12 && (gain - damping).abs() < 1e-12
}

fn uniform(k: f64) -> bool {
    (SERVO_RANGE.0..SERVO_RANGE.1).contains(&k)
}

#[test]
fn a_measured_gain_lands_on_its_servos_stiffness_and_damping() {
    let servos = randomized(&[vec![Some(1.4), None]]).expect("randomizes");

    assert_eq!(servos.len(), ENVS * 2);
    assert!(servos.iter().all(|s| same_scale(*s)));

    for pair in servos.as_chunks::<2>().0 {
        assert!((pair[0][0] - 1.4).abs() < 1e-12);
        assert!(uniform(pair[1][0]));
    }
}

#[test]
fn no_servo_gains_keep_the_uniform_draw_and_a_short_row_is_refused() {
    let servos = randomized(&[]).expect("randomizes");

    assert!(servos.iter().all(|s| same_scale(*s) && uniform(s[0])));
    assert!(randomized(&[vec![Some(1.0)]])
        .expect_err("one gain for two servos")
        .contains("servoGains[0] has 1 gains; each row needs 2"));
}
