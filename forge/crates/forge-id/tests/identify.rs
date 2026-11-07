use forge_id::{identify, simulate, Experiment, Fit, Options, Param, ParamSpec, Recording};
use forge_mujoco::Model;
use std::f64::consts::TAU;
use std::path::PathBuf;

const ENCODER_STEP: f64 = TAU / 4096.0;
const SAMPLE_HZ: f64 = 50.0;
const SECONDS: f64 = 12.0;
const TOLERANCE: f64 = 0.03;

#[derive(Clone, Copy)]
struct Servo {
    armature: f64,
    damping: f64,
    friction: f64,
    kp: f64,
}

const NOMINAL: Servo = Servo {
    armature: 0.0076,
    damping: 0.038,
    friction: 0.019,
    kp: 4.0,
};
const SHOULDER: Servo = Servo {
    armature: 0.0091,
    damping: 0.031,
    friction: 0.023,
    kp: 3.4,
};
const ELBOW: Servo = Servo {
    armature: 0.0064,
    damping: 0.045,
    friction: 0.016,
    kp: 4.6,
};

fn joint(name: &str, s: Servo) -> String {
    format!(
        r#"<joint name="{name}" type="hinge" axis="0 1 0" damping="{}" armature="{}" frictionloss="{}"/>"#,
        s.damping, s.armature, s.friction
    )
}

fn arm_xml(shoulder: Servo, elbow: Servo) -> String {
    format!(
        r#"<mujoco model="servo-arm">
  <option timestep="0.002" integrator="implicitfast"/>
  <worldbody>
    <body name="upper" pos="0 0 0.5">
      {}
      <geom type="capsule" fromto="0 0 0 0.12 0 0" size="0.015" mass="0.12" contype="0" conaffinity="0"/>
      <body name="lower" pos="0.12 0 0">
        {}
        <geom type="capsule" fromto="0 0 0 0.1 0 0" size="0.012" mass="0.08" contype="0" conaffinity="0"/>
      </body>
    </body>
    <body name="idle" pos="0.6 0 0.5">
      {}
      <geom type="capsule" fromto="0 0 0 0 0 -0.1" size="0.012" mass="0.08" contype="0" conaffinity="0"/>
    </body>
  </worldbody>
  <actuator>
    <position name="shoulder" joint="shoulder" kp="{}"/>
    <position name="elbow" joint="elbow" kp="{}"/>
    <position name="idle" joint="idle" kp="{}"/>
  </actuator>
</mujoco>"#,
        joint("shoulder", shoulder),
        joint("elbow", elbow),
        joint("idle", NOMINAL),
        shoulder.kp,
        elbow.kp,
        NOMINAL.kp
    )
}

fn load(name: &str, xml: &str) -> Model {
    let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(format!("{name}-{}.xml", std::process::id()));

    std::fs::write(&path, xml).expect("write the arm model");

    Model::load(&path).expect("the arm model compiles")
}

fn excitation() -> Experiment {
    let samples = (SECONDS * SAMPLE_HZ) as usize;
    let wave = |t: f64, parts: &[(f64, f64)]| parts.iter().map(|(amp, hz)| amp * (TAU * hz * t).sin()).sum::<f64>();
    let controls = (0..samples)
        .flat_map(|k| {
            let t = k as f64 / SAMPLE_HZ;

            [
                wave(t, &[(0.5, 0.4), (0.25, 1.3), (0.12, 3.1)]),
                wave(t, &[(0.6, 0.7), (0.2, 1.9), (0.1, 4.3)]),
                0.0,
            ]
        })
        .collect();

    Experiment {
        qpos0: vec![0.0; 3],
        qvel0: vec![0.0; 3],
        controls,
        substeps: 10,
        observed: vec![0, 1, 2],
    }
}

fn encoder_reading(model: &Model, experiment: &Experiment) -> Recording {
    let truth = simulate(model, &[], &[Vec::new()], experiment)
        .expect("simulates")
        .remove(0);
    let samples = truth
        .samples
        .iter()
        .map(|q| (q / ENCODER_STEP).round() * ENCODER_STEP)
        .collect();

    Recording { samples }
}

fn servo_specs(prefix: &str, dof: usize, actuator: usize) -> Vec<ParamSpec> {
    vec![
        ParamSpec::around(&format!("{prefix} armature"), Param::Armature { dof }, NOMINAL.armature),
        ParamSpec::around(&format!("{prefix} damping"), Param::Damping { dof }, NOMINAL.damping),
        ParamSpec::around(
            &format!("{prefix} friction"),
            Param::FrictionLoss { dof },
            NOMINAL.friction,
        ),
        ParamSpec::around(
            &format!("{prefix} stiffness"),
            Param::Stiffness { actuator },
            NOMINAL.kp,
        ),
    ]
}

fn planted_values() -> Vec<f64> {
    [SHOULDER, ELBOW]
        .iter()
        .flat_map(|s| [s.armature, s.damping, s.friction, s.kp])
        .collect()
}

struct Case {
    model: Model,
    data: Vec<(Experiment, Recording)>,
}

fn case() -> Case {
    let planted = load("planted", &arm_xml(SHOULDER, ELBOW));
    let experiment = excitation();
    let recording = encoder_reading(&planted, &experiment);

    Case {
        model: load("nominal", &arm_xml(NOMINAL, NOMINAL)),
        data: vec![(experiment, recording)],
    }
}

fn check_recovery(fit: &Fit, specs: &[ParamSpec], planted: &[f64]) {
    for ((spec, truth), (value, spread)) in specs.iter().zip(planted).zip(fit.values.iter().zip(&fit.relative_std)) {
        eprintln!("{}: {value:.5} planted {truth:.5} spread {spread:.4}", spec.name);
    }

    eprintln!("cost {} iterations {}", fit.cost, fit.iterations);

    for ((spec, truth), (value, identified)) in specs.iter().zip(planted).zip(fit.values.iter().zip(&fit.identified)) {
        let error = (value - truth).abs() / truth;

        assert!(*identified, "{} was not identified", spec.name);
        assert!(
            error <= TOLERANCE,
            "{}: fit {value:.5}, planted {truth:.5}, {:.1}% off",
            spec.name,
            error * 100.0
        );
    }
}

fn noop_identifier(specs: &[ParamSpec]) -> Fit {
    Fit {
        values: specs.iter().map(|s| s.nominal).collect(),
        identified: vec![true; specs.len()],
        relative_std: vec![0.0; specs.len()],
        cost: 0.0,
        iterations: 0,
    }
}

fn encoder_options() -> Options {
    Options {
        noise: ENCODER_STEP / 12f64.sqrt(),
        ..Options::default()
    }
}

fn explicitly_named(test: &str) -> bool {
    std::env::args().any(|arg| arg == test)
}

#[test]
fn recovers_planted() {
    let case = case();
    let specs: Vec<ParamSpec> = [servo_specs("shoulder", 0, 0), servo_specs("elbow", 1, 1)].concat();
    let fit = identify(&case.model, &specs, &case.data, encoder_options()).expect("identifies");

    check_recovery(&fit, &specs, &planted_values());
}

#[test]
fn flags_unidentified() {
    let case = case();
    let mut specs: Vec<ParamSpec> = [servo_specs("shoulder", 0, 0), servo_specs("elbow", 1, 1)].concat();

    specs.push(ParamSpec::around(
        "idle damping",
        Param::Damping { dof: 2 },
        NOMINAL.damping,
    ));
    specs.push(ParamSpec::around(
        "idle armature",
        Param::Armature { dof: 2 },
        NOMINAL.armature,
    ));

    let fit = identify(&case.model, &specs, &case.data, encoder_options()).expect("identifies");
    let moving = Fit {
        values: fit.values[..8].to_vec(),
        identified: fit.identified[..8].to_vec(),
        relative_std: fit.relative_std[..8].to_vec(),
        cost: fit.cost,
        iterations: fit.iterations,
    };

    check_recovery(&moving, &specs[..8], &planted_values());

    let idle = specs.iter().zip(fit.identified.iter().zip(&fit.values)).skip(8);

    for (spec, (identified, value)) in idle {
        assert!(!identified, "{} should be flagged", spec.name);
        assert_eq!(*value, spec.nominal, "{} must keep its preset", spec.name);
    }
}

#[test]
fn canary_noop_identifier_fails() {
    if !explicitly_named("canary_noop_identifier_fails") {
        return;
    }

    let specs: Vec<ParamSpec> = [servo_specs("shoulder", 0, 0), servo_specs("elbow", 1, 1)].concat();

    check_recovery(&noop_identifier(&specs), &specs, &planted_values());
}
