use super::{randomize, SERVO_RANGE};
use crate::options::TaskOptions;
use crate::physics::{Engine, Physics};
use crate::random_ranges::RandomRanges;
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

fn streams() -> Vec<Rng> {
    (0..ENVS).map(|i| Rng::new(9, i as u64)).collect()
}

fn batch() -> Result<Physics, String> {
    let model = model();
    let layout = RowMap::new(&model)?.offsets();

    Physics::new(&model, &Engine::Mujoco { refusal: None }, &layout, (ENVS, 1))
}

fn field(physics: &mut Physics, name: &str) -> Result<Vec<Vec<f64>>, String> {
    let (values, width) = physics.expand(name)?;

    Ok(values.chunks_exact(width).map(<[f64]>::to_vec).collect())
}

fn bodies(options: &TaskOptions) -> Result<[Vec<Vec<f64>>; 4], String> {
    let mut physics = batch()?;
    let friction = field(&mut physics, "geom_friction")?;
    let mass = field(&mut physics, "body_mass")?;

    randomize(&mut physics, 2, options, &mut streams())?;

    Ok([
        friction,
        mass,
        field(&mut physics, "geom_friction")?,
        field(&mut physics, "body_mass")?,
    ])
}

fn randomized(gains: &[Vec<Option<f64>>]) -> Result<Vec<[f64; 3]>, String> {
    let mut physics = batch()?;
    let options = TaskOptions {
        servo_gains: gains.to_vec(),
        ..TaskOptions::default()
    };

    randomize(&mut physics, 2, &options, &mut streams())?;

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

#[test]
fn a_job_without_random_ranges_draws_friction_and_mass_as_before() {
    let [friction, mass, drawn_friction, drawn_mass] = bodies(&TaskOptions::default()).expect("randomizes");
    let mut rngs = streams();

    for (sim, rng) in rngs.iter_mut().enumerate() {
        let scale = rng.uniform(0.6, 1.3);
        let geoms: Vec<f64> = friction[sim].iter().step_by(3).map(|f| f * scale).collect();
        let links: Vec<f64> = mass[sim][1..].iter().map(|m| m * rng.uniform(0.85, 1.15)).collect();

        assert_eq!(
            drawn_friction[sim].iter().step_by(3).copied().collect::<Vec<_>>(),
            geoms
        );
        assert_eq!(drawn_mass[sim][1..], links);
        assert_eq!(drawn_mass[sim][0], mass[sim][0]);
    }
}

fn within([low, high]: [f64; 2]) -> impl Fn(&f64) -> bool {
    move |k| (low - 1e-12..=high + 1e-12).contains(k)
}

#[test]
fn a_job_with_random_ranges_scales_every_robot_within_them() {
    let options = TaskOptions {
        random_ranges: RandomRanges {
            friction: [0.3, 0.4],
            mass: [2.0, 3.0],
        },
        ..TaskOptions::default()
    };
    let [friction, mass, drawn_friction, drawn_mass] = bodies(&options).expect("randomizes");

    for sim in 0..ENVS {
        let frictions: Vec<f64> = drawn_friction[sim]
            .iter()
            .zip(&friction[sim])
            .step_by(3)
            .map(|(after, before)| after / before)
            .collect();
        let masses: Vec<f64> = drawn_mass[sim][1..]
            .iter()
            .zip(&mass[sim][1..])
            .map(|(after, before)| after / before)
            .collect();

        assert_eq!((frictions.len(), masses.len()), (3, 3));
        assert!(frictions.iter().all(within([0.3, 0.4])));
        assert!(frictions.iter().all(|k| (k - frictions[0]).abs() < 1e-12));
        assert!(masses.iter().all(within([2.0, 3.0])));
    }
}
