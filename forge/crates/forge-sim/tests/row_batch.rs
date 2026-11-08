mod common;

use common::{ctrl, quadruped, write, Servo, HULL_FOOT, PRISM_FOOT};
use forge_mujoco::{Batch, Model};
use forge_sim::RowBatch;

const NSIM: usize = 7;
const ROUNDS: usize = 60;
const DECIMATION: usize = 10;

trait Rows {
    fn row(&mut self, sim: usize) -> &mut [f64];
    fn expand(&mut self, field: &str) -> (&mut [f64], usize);
    fn advance(&mut self, nstep: usize) -> usize;
}

impl Rows for Batch {
    fn row(&mut self, sim: usize) -> &mut [f64] {
        Batch::row(self, sim)
    }

    fn expand(&mut self, field: &str) -> (&mut [f64], usize) {
        Batch::expand(self, field).expect("expand")
    }

    fn advance(&mut self, nstep: usize) -> usize {
        self.step(nstep)
    }
}

impl Rows for RowBatch {
    fn row(&mut self, sim: usize) -> &mut [f64] {
        RowBatch::row(self, sim)
    }

    fn expand(&mut self, field: &str) -> (&mut [f64], usize) {
        RowBatch::expand(self, field).expect("expand")
    }

    fn advance(&mut self, nstep: usize) -> usize {
        self.step(nstep)
    }
}

fn randomize(rows: &mut dyn Rows) {
    let (friction, width) = rows.expand("geom_friction");

    for (sim, row) in friction.chunks_exact_mut(width).enumerate() {
        row.iter_mut().step_by(3).for_each(|f| *f *= 0.7 + 0.08 * sim as f64);
    }

    let (mass, width) = rows.expand("body_mass");

    for (sim, row) in mass.chunks_exact_mut(width).enumerate() {
        row[1..]
            .iter_mut()
            .enumerate()
            .for_each(|(b, m)| *m *= 0.9 + 0.02 * ((sim + b) % 7) as f64);
    }

    let (gain, width) = rows.expand("actuator_gainprm");

    for (sim, row) in gain.chunks_exact_mut(width).enumerate() {
        row.as_chunks_mut::<10>()
            .0
            .iter_mut()
            .for_each(|p| p[0] *= 0.9 + 0.03 * sim as f64);
    }

    let (bias, width) = rows.expand("actuator_biasprm");

    for (sim, row) in bias.chunks_exact_mut(width).enumerate() {
        row.as_chunks_mut::<10>().0.iter_mut().for_each(|p| {
            p[1] *= 0.9 + 0.03 * sim as f64;
            p[2] *= 0.9 + 0.03 * sim as f64;
        });
    }
}

fn run(rows: &mut dyn Rows, model: &Model) -> Vec<Vec<f64>> {
    let layout = Batch::new(model, 1, 1).expect("layout").layout();
    let nu = model.nu();

    randomize(rows);

    for round in 0..ROUNDS {
        for sim in 0..NSIM {
            let row = rows.row(sim);

            for a in 0..nu {
                row[layout.ctrl + a] = ctrl(sim, a, round);
            }
        }

        assert_eq!(rows.advance(DECIMATION), 0);
    }

    (0..NSIM).map(|s| rows.row(s).to_vec()).collect()
}

fn compare(servo: &Servo) -> f64 {
    let path = write(&quadruped(servo));
    let (model, kernel) = forge_ir::load(&path).expect("the test robot is in the subset");
    let mut c = Batch::new(&model, NSIM, 2).expect("C batch");
    let mut simd = RowBatch::new(&model, kernel, NSIM, 3).expect("SIMD batch");
    let ours = run(&mut simd, &model);
    let reference = run(&mut c, &model);

    ours.iter()
        .zip(&reference)
        .flat_map(|(a, b)| a.iter().zip(b).map(|(x, y)| (x - y).abs()))
        .fold(0.0, f64::max)
}

#[test]
fn rows_match_the_c_batch_with_randomized_tables() {
    let worst = compare(&Servo {
        attrs: r#"kp="11" dampratio="1" forcerange="-1.9 1.9""#,
        foot: HULL_FOOT,
    });

    assert!(worst < 1e-8, "worst row difference {worst:e}");
}

#[test]
fn delayed_servos_match_the_c_batch() {
    let worst = compare(&Servo {
        attrs: r#"kp="11" kv="0.05" forcerange="-1.9 1.9" delay="0.007" nsample="6" interp="linear""#,
        foot: HULL_FOOT,
    });

    assert!(worst < 1e-8, "worst row difference {worst:e}");
}

#[test]
fn held_delays_match_the_c_batch() {
    let worst = compare(&Servo {
        attrs: r#"kp="9" kv="0.02" delay="0.004" nsample="4" interp="zoh""#,
        foot: HULL_FOOT,
    });

    assert!(worst < 1e-8, "worst row difference {worst:e}");
}

#[test]
fn primitive_feet_match_the_c_batch() {
    let feet = [
        r#"type="sphere" size="0.012" pos="0 0 -0.058""#,
        r#"type="capsule" fromto="0 0 0 0.01 0 -0.058" size="0.01""#,
        r#"type="box" size="0.012 0.01 0.03" pos="0 0 -0.035" euler="0.2 0.1 0""#,
        r#"type="cylinder" size="0.012 0.03" pos="0 0 -0.035" euler="0.4 0 0""#,
        PRISM_FOOT,
    ];

    for foot in feet {
        let worst = compare(&Servo {
            attrs: r#"kp="11" dampratio="1" forcerange="-1.9 1.9""#,
            foot,
        });

        assert!(worst < 1e-8, "{foot}: worst row difference {worst:e}");
    }
}

fn drive_alone(model: &Model, kernel: &forge_ir::Kernel, sim: usize) -> Vec<f64> {
    let layout = Batch::new(model, 1, 1).expect("layout").layout();
    let mut one = RowBatch::new(model, kernel.clone(), 1, 1).expect("SIMD batch");

    for round in 0..ROUNDS {
        for a in 0..model.nu() {
            one.row(0)[layout.ctrl + a] = ctrl(sim, a, round);
        }

        one.step(DECIMATION);
    }

    one.row(0).to_vec()
}

#[test]
fn a_robot_steps_the_same_alone_as_regrouped_in_a_batch() {
    let path = write(&quadruped(&Servo {
        attrs: r#"kp="11" dampratio="1" forcerange="-1.9 1.9""#,
        foot: HULL_FOOT,
    }));
    let (model, kernel) = forge_ir::load(&path).expect("in the subset");
    let layout = Batch::new(&model, 1, 1).expect("layout").layout();
    let mut batch = RowBatch::new(&model, kernel.clone(), NSIM, 3).expect("SIMD batch");

    for round in 0..ROUNDS {
        for sim in 0..NSIM {
            for a in 0..model.nu() {
                batch.row(sim)[layout.ctrl + a] = ctrl(sim, a, round);
            }
        }

        batch.step(DECIMATION);
    }

    for sim in 0..NSIM {
        let alone = drive_alone(&model, &kernel, sim);
        let same = alone
            .iter()
            .zip(batch.row(sim).iter())
            .all(|(a, b)| a.to_bits() == b.to_bits());

        assert!(same, "robot {sim} stepped differently in the batch");
    }
}
