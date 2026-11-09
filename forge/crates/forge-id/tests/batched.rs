use forge_id::{identify_worlds, Experiment, Fit, Options, Recording, Unknown, Worlds};
use forge_mujoco::{integration_state, Batch, Data, Model};
use forge_sim::grad::Wrt;
use forge_sim::Plan;
use std::f64::consts::TAU;
use std::path::PathBuf;

const ROBOT: &str = "quad-servo";
const WORLDS: usize = 16;
const ENCODER_STEP: f64 = TAU / 4096.0;
const SAMPLE_HZ: f64 = 500.0;
const CONTROL_HZ: f64 = 50.0;
const SECONDS: f64 = 24.0;
const TOLERANCE: f64 = 0.03;
const GAIN_WIDTH: usize = 10;

struct Rng(u64);

impl Rng {
    fn uniform(&mut self, lo: f64, hi: f64) -> f64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);

        let mut z = self.0;

        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        lo + (hi - lo) * (((z ^ (z >> 31)) >> 11) as f64 / (1u64 << 53) as f64)
    }

    fn planted(&mut self, nominal: f64) -> f64 {
        let off = self.uniform(0.15, 0.25);

        nominal
            * if self.uniform(0.0, 1.0) < 0.5 {
                1.0 - off
            } else {
                1.0 + off
            }
    }
}

fn hoisted() -> (Model, Plan) {
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../verify/out/fixtures")
        .join(ROBOT)
        .join("model.xml");
    let xml = std::fs::read_to_string(&source)
        .unwrap_or_else(|_| panic!("{} is missing: the s0 gate emits the fixture robots", source.display()));
    let lifted = xml.replace(r#"<freejoint name="root_0"/>"#, "").replace(
        r#"<body name="root_0" pos="0 0 0.13">"#,
        r#"<body name="root_0" pos="0 0 0.6">"#,
    );

    assert_ne!(lifted, xml, "the fixture's root changed shape");

    let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(format!("hoisted-{}.xml", std::process::id()));

    std::fs::write(&path, lifted).expect("write the hoisted robot");

    let model = Model::load(&path).expect("the hoisted robot compiles");
    let kernel = forge_ir::lower(&model).expect("the hoisted robot is in Forge's subset");

    (model, Plan::new(kernel))
}

fn unknowns(plan: &Plan) -> Vec<Unknown> {
    let k = &plan.kernel;

    k.actuators
        .iter()
        .enumerate()
        .flat_map(|(a, act)| {
            let friction = k.dofs[act.dof]
                .friction
                .as_ref()
                .expect("catalog servos carry friction");

            [
                Unknown::around(&format!("servo {a} stiffness"), Wrt::Kp(a), act.gain),
                Unknown::around(&format!("servo {a} damping gain"), Wrt::Kv(a), -act.bias[2]),
                Unknown::around(
                    &format!("servo {a} friction"),
                    Wrt::FrictionLoss(act.dof),
                    friction.loss,
                ),
            ]
        })
        .collect()
}

fn excitation(plan: &Plan) -> Experiment {
    let k = &plan.kernel;
    let samples = (SECONDS * SAMPLE_HZ) as usize;
    let hold = (SAMPLE_HZ / CONTROL_HZ) as usize;
    let controls = (0..samples)
        .flat_map(|s| {
            let t = (s / hold) as f64 / CONTROL_HZ;

            k.actuators.iter().enumerate().map(move |(a, act)| {
                let reach = act.ctrl_range.map_or(0.5, |r| 0.7 * r[1].min(-r[0]));
                let phase = a as f64 * 1.7;

                reach
                    * [(0.5, 0.15), (0.3, 0.45), (0.15, 1.3), (0.1, 2.7), (0.05, 5.3)]
                        .iter()
                        .enumerate()
                        .map(|(i, (amp, hz))| amp * (TAU * hz * (1.0 + 0.05 * a as f64) * t + phase * i as f64).sin())
                        .sum::<f64>()
            })
        })
        .collect();

    Experiment {
        qpos0: k.qpos0.clone(),
        qvel0: vec![0.0; k.nv],
        controls,
        substeps: (1.0 / (SAMPLE_HZ * plan.kernel.options.timestep)).round() as usize,
        observed: k.actuators.iter().map(|a| a.qposadr).collect(),
    }
}

fn plant(batch: &mut Batch, unknowns: &[Unknown], planted: &[Vec<f64>]) {
    for (u, unknown) in unknowns.iter().enumerate() {
        let (field, offset, sign) = match unknown.wrt {
            Wrt::Kp(a) => ("actuator_gainprm", a * GAIN_WIDTH, 1.0),
            Wrt::Kv(a) => ("actuator_biasprm", a * GAIN_WIDTH + 2, -1.0),
            Wrt::Damping(d) => ("dof_damping", d, 1.0),
            Wrt::Armature(d) => ("dof_armature", d, 1.0),
            Wrt::Mass(b) => ("body_mass", b, 1.0),
            Wrt::FrictionLoss(d) => ("dof_frictionloss", d, 1.0),
            other => panic!("no field for {other:?}"),
        };
        let (values, width) = batch.expand(field).expect("expand");

        for (row, set) in values.chunks_exact_mut(width).zip(planted) {
            row[offset] = sign * set[u];
        }

        if let Wrt::Kp(a) = unknown.wrt {
            let (bias, width) = batch.expand("actuator_biasprm").expect("expand");

            for (row, set) in bias.chunks_exact_mut(width).zip(planted) {
                row[a * GAIN_WIDTH + 1] = -set[u];
            }
        }
    }
}

fn record(model: &Model, experiment: &Experiment, (unknowns, planted): (&[Unknown], &[Vec<f64>])) -> Vec<Recording> {
    let mut batch = Batch::new(model, planted.len(), 4).expect("C batch");
    let layout = batch.layout();
    let nu = model.nu();
    let mut data = Data::new(model);
    let mut start = vec![0.0; layout.nstate];

    data.qpos().copy_from_slice(&experiment.qpos0);
    data.ctrl().copy_from_slice(&experiment.controls[..nu]);
    data.get_state(model, &mut start, integration_state());
    plant(&mut batch, unknowns, planted);

    let mut out = vec![Vec::new(); planted.len()];

    for sim in 0..planted.len() {
        batch.row(sim).copy_from_slice(&start);
    }

    for k in 0..experiment.controls.len() / nu {
        for sim in 0..planted.len() {
            batch.row(sim)[layout.ctrl..layout.ctrl + nu].copy_from_slice(&experiment.controls[k * nu..(k + 1) * nu]);
        }

        assert_eq!(batch.step(experiment.substeps), 0, "MuJoCo diverged");

        for (sim, samples) in out.iter_mut().enumerate() {
            let row = batch.row(sim);

            samples.extend(
                experiment
                    .observed
                    .iter()
                    .map(|i| (row[layout.qpos + i] / ENCODER_STEP).round() * ENCODER_STEP),
            );
        }
    }

    out.into_iter().map(|samples| Recording { samples }).collect()
}

fn kind(name: &str) -> &str {
    name.split_once(' ')
        .map_or(name, |(_, rest)| rest.split_once(' ').map_or(rest, |(_, kind)| kind))
}

fn summary(fits: &[Fit], unknowns: &[Unknown], planted: &[Vec<f64>]) {
    let kinds: Vec<&str> = unknowns.iter().map(|u| kind(&u.name)).collect();
    let mut seen: Vec<&str> = kinds.clone();

    seen.sort_unstable();
    seen.dedup();

    for k in &seen {
        let mut errors = Vec::new();
        let mut spreads = Vec::new();
        let mut missing = 0;

        for (fit, truth) in fits.iter().zip(planted) {
            for (i, _) in kinds.iter().enumerate().filter(|(_, n)| *n == k) {
                errors.push((fit.values[i] - truth[i]).abs() / truth[i]);
                spreads.push(fit.relative_std[i]);
                missing += usize::from(!fit.identified[i]);
            }
        }

        errors.sort_by(f64::total_cmp);
        eprintln!(
            "{k}: median error {:.2}%, worst {:.2}%, largest spread {:.2}%, {missing} not identified",
            errors[errors.len() / 2] * 100.0,
            errors[errors.len() - 1] * 100.0,
            spreads.iter().copied().fold(0.0, f64::max) * 100.0
        );
    }
}

fn check_shapes(fits: &[Fit], unknowns: &[Unknown], planted: &[Vec<f64>], seed: u64) {
    assert!(!unknowns.is_empty(), "seed {seed:#x}: no unknowns to identify");
    assert_eq!(planted.len(), WORLDS, "seed {seed:#x}: planted worlds");
    assert_eq!(fits.len(), planted.len(), "seed {seed:#x}: one fit per planted world");

    for (world, (fit, truth)) in fits.iter().zip(planted).enumerate() {
        assert_eq!(
            truth.len(),
            unknowns.len(),
            "seed {seed:#x}: world {world} planted values"
        );
        assert_eq!(
            fit.values.len(),
            unknowns.len(),
            "seed {seed:#x}: world {world} fit values"
        );
        assert_eq!(
            fit.identified.len(),
            unknowns.len(),
            "seed {seed:#x}: world {world} identified flags"
        );
        assert!(
            fit.values.iter().all(|v| v.is_finite()),
            "seed {seed:#x}: world {world} has a non-finite fit"
        );
    }
}

fn check(fits: &[Fit], unknowns: &[Unknown], planted: &[Vec<f64>], seed: u64) {
    let mut worst = (0.0f64, String::new());

    check_shapes(fits, unknowns, planted, seed);
    summary(fits, unknowns, planted);

    for (world, (fit, truth)) in fits.iter().zip(planted).enumerate() {
        let worst = fit
            .values
            .iter()
            .zip(truth)
            .map(|(v, t)| (v - t).abs() / t)
            .fold(0.0, f64::max);

        eprintln!(
            "world {world}: {} iterations, cost {:.0}, worst {:.2}%",
            fit.iterations,
            fit.cost,
            worst * 100.0
        );
    }

    for (world, (fit, truth)) in fits.iter().zip(planted).enumerate() {
        for ((u, value), (t, identified)) in unknowns.iter().zip(&fit.values).zip(truth.iter().zip(&fit.identified)) {
            let error = (value - t).abs() / t;

            assert!(
                *identified,
                "seed {seed:#x}: world {world}: {} was not identified",
                u.name
            );

            if error > worst.0 {
                worst = (
                    error,
                    format!("world {world}: {} fit {value:.5}, planted {t:.5}", u.name),
                );
            }
        }
    }

    eprintln!(
        "{} parameters on {} worlds; worst {:.2}% ({})",
        unknowns.len(),
        fits.len(),
        worst.0 * 100.0,
        worst.1
    );
    assert!(
        worst.0 <= TOLERANCE,
        "seed {seed:#x}: a fit is off by more than 3%: {}",
        worst.1
    );
}

fn fresh_seed() -> u64 {
    if let Some(seed) = std::env::var("FORGE_SYSID_SEED")
        .ok()
        .and_then(|s| u64::from_str_radix(s.trim_start_matches("0x"), 16).ok())
    {
        return seed;
    }

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos() as u64);

    nanos ^ u64::from(std::process::id()).rotate_left(32)
}

fn planted_worlds(unknowns: &[Unknown], seed: u64) -> Vec<Vec<f64>> {
    let mut rng = Rng(seed);

    (0..WORLDS)
        .map(|_| unknowns.iter().map(|u| rng.planted(u.nominal)).collect())
        .collect()
}

fn honest_fits(planted: &[Vec<f64>]) -> Vec<Fit> {
    planted
        .iter()
        .map(|truth| Fit {
            values: truth.clone(),
            identified: vec![true; truth.len()],
            relative_std: vec![0.0; truth.len()],
            cost: 0.0,
            iterations: 1,
        })
        .collect()
}

fn explicitly_named(test: &str) -> bool {
    std::env::args().any(|arg| arg == test)
}

#[test]
fn canary_sysid_one_parameter_off_passes() {
    if !explicitly_named("canary_sysid_one_parameter_off_passes") {
        return;
    }

    let (_, plan) = hoisted();
    let unknowns = unknowns(&plan);
    let seed = fresh_seed();
    let planted = planted_worlds(&unknowns, seed);
    let mut fits = honest_fits(&planted);

    check(&fits, &unknowns, &planted, seed);
    fits[WORLDS / 2].values[unknowns.len() / 2] *= 1.0 + TOLERANCE + 0.005;
    println!("canary reached the planted fit");
    check(&fits, &unknowns, &planted, seed);
}

#[test]
fn canary_sysid_no_worlds_passes() {
    if !explicitly_named("canary_sysid_no_worlds_passes") {
        return;
    }

    let (_, plan) = hoisted();
    let unknowns = unknowns(&plan);
    let seed = fresh_seed();

    println!("canary reached the empty fit");
    check(&[], &unknowns, &planted_worlds(&unknowns, seed), seed);
}

#[test]
fn batched_recovers_planted() {
    let (model, plan) = hoisted();
    let unknowns = unknowns(&plan);
    let experiment = excitation(&plan);
    let seed = fresh_seed();
    let planted = planted_worlds(&unknowns, seed);
    let recordings = record(&model, &experiment, (&unknowns, &planted));
    let started = std::time::Instant::now();
    let fits = identify_worlds(
        &Worlds {
            plan: &plan,
            unknowns: &unknowns,
            experiment: &experiment,
            recordings: &recordings,
        },
        Options {
            noise: ENCODER_STEP / 12f64.sqrt(),
            ..Options::default()
        },
    )
    .expect("identifies");

    eprintln!(
        "identified in {:.1} s, {} iterations at most",
        started.elapsed().as_secs_f64(),
        fits.iter().map(|f| f.iterations).max().unwrap_or(0)
    );
    check(&fits, &unknowns, &planted, seed);
}
