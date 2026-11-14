use super::{randomize, SERVO_RANGE};
use crate::job::Backend;
use crate::options::TaskOptions;
use crate::physics::{Engine, Physics};
use crate::physics_ranges::{PhysicsRanges, FRICTION_RANGE, MASS_RANGE, STRENGTH_REFUSAL};
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
    <position name="front" joint="front" kp="3" kv="0.2" ctrlrange="-1 1" forcerange="-0.5 0.5"/>
    <position name="back" joint="back" kp="3" kv="0.2" ctrlrange="-1 1" forcerange="-0.5 0.5"/>
  </actuator>
</mujoco>"#;

fn model() -> Model {
    let folder = std::env::temp_dir().join(format!("forge-randomize-{:?}", std::thread::current().id()));

    fs::create_dir_all(&folder).expect("folder");
    fs::write(folder.join("model.xml"), MODEL).expect("model");
    Model::load(&folder.join("model.xml")).expect("model loads")
}

const SEED: u64 = 9;

fn physics() -> Result<Physics, String> {
    let model = model();
    let layout = RowMap::new(&model)?.offsets();

    Physics::new(&model, &Engine::Mujoco { refusal: None }, &layout, (ENVS, 1))
}

fn streams() -> Vec<Rng> {
    (0..ENVS).map(|i| Rng::new(SEED, i as u64)).collect()
}

fn options(gains: &[Vec<Option<f64>>], physics: PhysicsRanges) -> TaskOptions {
    TaskOptions {
        servo_gains: gains.to_vec(),
        physics,
        ..TaskOptions::default()
    }
}

fn field(physics: &mut Physics, name: &str) -> Result<(Vec<f64>, usize), String> {
    let (values, width) = physics.expand(name)?;

    Ok((values.to_vec(), width))
}

fn scales(options: &TaskOptions, name: &str) -> Result<(Vec<f64>, usize), String> {
    let (nominal, width) = field(&mut physics()?, name)?;
    let mut drawn = physics()?;

    randomize(&mut drawn, 2, options, &mut streams())?;

    let (values, _) = field(&mut drawn, name)?;
    let ratios = values
        .iter()
        .zip(nominal.iter().cycle())
        .map(|(v, n)| if *n == 0.0 { 1.0 } else { v / n })
        .collect();

    Ok((ratios, width))
}

fn randomized(gains: &[Vec<Option<f64>>]) -> Result<Vec<[f64; 3]>, String> {
    let mut physics = physics()?;

    randomize(
        &mut physics,
        2,
        &options(gains, PhysicsRanges::default()),
        &mut streams(),
    )?;

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

fn todays_draws(geoms: usize, bodies: usize) -> (Vec<f64>, Vec<f64>) {
    let mut friction = Vec::new();
    let mut mass = Vec::new();

    for mut rng in streams() {
        let scale = rng.uniform(FRICTION_RANGE[0], FRICTION_RANGE[1]);

        friction.extend((0..geoms).map(|_| scale));
        mass.push(1.0);
        mass.extend((1..bodies).map(|_| rng.uniform(MASS_RANGE[0], MASS_RANGE[1])));
    }

    (friction, mass)
}

fn sliding(ratios: &[f64]) -> Vec<f64> {
    ratios.iter().step_by(3).copied().collect()
}

#[test]
fn without_physics_ranges_friction_and_mass_draw_as_before() {
    let plain = options(&[], PhysicsRanges::default());
    let (friction, width) = scales(&plain, "geom_friction").expect("friction");
    let (mass, bodies) = scales(&plain, "body_mass").expect("mass");
    let (expected_friction, expected_mass) = todays_draws(width / 3, bodies);

    assert_eq!(sliding(&friction).len(), expected_friction.len());

    for (got, want) in sliding(&friction).iter().zip(&expected_friction) {
        assert!((got - want).abs() < 1e-12);
    }

    for (got, want) in mass.iter().zip(&expected_mass) {
        assert!((got - want).abs() < 1e-12);
    }
}

#[test]
fn friction_and_mass_draw_inside_the_jobs_ranges() {
    let wide = options(
        &[],
        PhysicsRanges {
            friction: [0.2, 0.3],
            mass: [1.8, 2.0],
            strength: None,
        },
    );
    let (friction, _) = scales(&wide, "geom_friction").expect("friction");
    let (mass, bodies) = scales(&wide, "body_mass").expect("mass");

    assert!(sliding(&friction).iter().all(|k| (0.2..=0.3).contains(k)));

    for row in mass.chunks_exact(bodies) {
        assert!(row[1..].iter().all(|k| (1.8..=2.0).contains(k)));
    }
}

#[test]
fn a_strength_range_scales_each_robots_servo_limits() {
    let weak = options(
        &[],
        PhysicsRanges {
            strength: Some([0.4, 0.6]),
            ..PhysicsRanges::default()
        },
    );
    let (strength, width) = scales(&weak, "actuator_forcerange").expect("forcerange");

    assert_eq!(strength.len(), ENVS * width);

    for row in strength.chunks_exact(width) {
        assert!((0.4..=0.6).contains(&row[0]));
        assert!(row.iter().all(|k| (k - row[0]).abs() < 1e-12));
    }
}

#[test]
fn a_strength_range_steps_on_c_mujoco_and_says_why() {
    let engine = Engine::choose(&model(), Backend::Metal, Some(STRENGTH_REFUSAL));

    assert!(matches!(engine, Engine::Mujoco { .. }));
    assert_eq!(
        engine.status().as_deref(),
        Some("Forge's engines can't vary servo strength. Stepping physics on C MuJoCo")
    );
}
