#![cfg(target_os = "macos")]

mod gradcommon;

use forge_mujoco::{Batch, Model};
use forge_sim::{MetalBatch, RowBatch, WgslBatch};
use gradcommon::{fixture, Rng, ROBOTS};

const WORLDS: usize = 12;
const ROUNDS: usize = 6;
const DECIMATION: usize = 10;
const SIMD_TOLERANCE: f64 = 1e-8;
const METAL_TOLERANCE: f64 = 1e-5;
const GEAR_WIDTH: usize = 6;

#[derive(Clone, Debug)]
struct Design {
    mass: Vec<f64>,
    gear: Vec<f64>,
}

trait Rows {
    fn row(&mut self, sim: usize) -> &mut [f64];
    fn expand(&mut self, field: &str) -> (&mut [f64], usize);
    fn advance(&mut self, nstep: usize) -> usize;
}

macro_rules! rows {
    ($t:ty) => {
        impl Rows for $t {
            fn row(&mut self, sim: usize) -> &mut [f64] {
                <$t>::row(self, sim)
            }

            fn expand(&mut self, field: &str) -> (&mut [f64], usize) {
                <$t>::expand(self, field).expect("expand")
            }

            fn advance(&mut self, nstep: usize) -> usize {
                self.step(nstep)
            }
        }
    };
}

rows!(Batch);
rows!(RowBatch);
rows!(MetalBatch);
rows!(WgslBatch);

fn designs(model: &Model, robot: &str) -> Vec<Design> {
    let mut rng = Rng::new(0xD5 + robot.len() as u64);
    let base = Batch::new(model, 1, 1).expect("batch");
    let mut probe = base;
    let mass = probe.expand("body_mass").expect("mass").0.to_vec();
    let gear: Vec<f64> = probe
        .expand("actuator_gear")
        .expect("gear")
        .0
        .iter()
        .step_by(GEAR_WIDTH)
        .copied()
        .collect();

    (0..WORLDS)
        .map(|_| Design {
            mass: mass
                .iter()
                .enumerate()
                .map(|(b, m)| if b == 0 { *m } else { m * rng.uniform(0.7, 1.4) })
                .collect(),
            gear: gear.iter().map(|g| g * rng.uniform(0.6, 1.5)).collect(),
        })
        .collect()
}

fn apply(rows: &mut dyn Rows, designs: &[&Design]) {
    let (mass, width) = rows.expand("body_mass");

    for (row, d) in mass.chunks_exact_mut(width).zip(designs) {
        row.copy_from_slice(&d.mass);
    }

    let (gear, width) = rows.expand("actuator_gear");

    for (row, d) in gear.chunks_exact_mut(width).zip(designs) {
        for (a, g) in d.gear.iter().enumerate() {
            row[GEAR_WIDTH * a] = *g;
        }
    }
}

fn ctrl(a: usize, round: usize) -> f64 {
    0.35 * ((round as f64) * 0.13 + a as f64 * 0.61).sin()
}

fn drive(rows: &mut dyn Rows, model: &Model, worlds: usize) -> Vec<Vec<f64>> {
    let layout = Batch::new(model, 1, 1).expect("layout").layout();

    for round in 0..ROUNDS {
        for slot in 0..worlds {
            let row = rows.row(slot);

            for a in 0..model.nu() {
                row[layout.ctrl + a] = ctrl(a, round);
            }
        }

        assert_eq!(rows.advance(DECIMATION), 0, "the batch diverged");
    }

    (0..worlds).map(|s| rows.row(s).to_vec()).collect()
}

fn alone(model: &Model, design: &Design) -> Vec<f64> {
    let mut c = Batch::new(model, 1, 1).expect("single-world C batch");

    apply(&mut c, &[design]);
    drive(&mut c, model, 1).remove(0)
}

fn relative(a: &[f64], b: &[f64]) -> f64 {
    a.iter()
        .zip(b)
        .map(|(x, y)| (x - y).abs() / y.abs().max(1.0))
        .fold(0.0, f64::max)
}

fn sweep(robot: &str) {
    let (model, kernel) = fixture(robot);
    let designs = designs(&model, robot);
    let all: Vec<&Design> = designs.iter().collect();
    let mut simd = RowBatch::new(&model, kernel.clone(), WORLDS, 4).expect("SIMD batch");
    let mut metal = MetalBatch::new(&model, kernel.clone(), WORLDS).expect("Metal batch");
    let mut wgsl = WgslBatch::new(&model, kernel.clone(), WORLDS).expect("WGSL batch");

    apply(&mut simd, &all);
    apply(&mut metal, &all);
    apply(&mut wgsl, &all);

    let simd_rows = drive(&mut simd, &model, WORLDS);
    let metal_rows = drive(&mut metal, &model, WORLDS);
    let wgsl_rows = drive(&mut wgsl, &model, WORLDS);
    let o = simd.offsets();
    let motion = o.qpos..o.qvel + model.nv();
    let mut spread = 0.0f64;

    for (sim, design) in designs.iter().enumerate() {
        let reference = alone(&model, design);
        let (s, m) = (&simd_rows[sim][motion.clone()], &metal_rows[sim][motion.clone()]);
        let mut single = RowBatch::new(&model, kernel.clone(), 1, 1).expect("single-world SIMD batch");

        apply(&mut single, &[design]);

        let forge_alone = drive(&mut single, &model, 1).remove(0);

        spread = spread.max(relative(s, &simd_rows[0][motion.clone()]));
        assert!(
            relative(s, &reference[motion.clone()]) < SIMD_TOLERANCE,
            "{robot} world {sim} on SIMD"
        );
        assert!(
            relative(m, &reference[motion.clone()]) < METAL_TOLERANCE,
            "{robot} world {sim} on Metal"
        );
        assert!(
            relative(&wgsl_rows[sim][motion.clone()], &reference[motion.clone()]) < METAL_TOLERANCE,
            "{robot} world {sim} on WGSL"
        );
        assert_eq!(
            s,
            &forge_alone[motion.clone()],
            "{robot} world {sim} steps differently alone"
        );
    }

    assert!(spread > 1e-3, "{robot}: the designs barely differ ({spread:e})");
    eprintln!("{robot}: {WORLDS} designs in one batch match their single-world runs; spread {spread:.3}");
}

#[test]
fn design_sweep_varies_mass_and_gear_per_world() {
    for robot in ROBOTS {
        sweep(robot);
    }
}
