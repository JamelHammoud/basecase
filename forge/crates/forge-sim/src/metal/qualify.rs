use super::batch::MetalBatch;
use super::engine::refusal;
use crate::plan::Plan;
use forge_ir::Kernel;
use forge_mujoco::{Batch, Model};

const WORLDS: usize = 8;
const ROUNDS: usize = 12;
const SUBSTEPS: usize = 10;
const TOLERANCE: f64 = 1e-5;

struct Miss {
    error: f64,
    world: usize,
    index: usize,
    round: usize,
}

fn centre_and_reach(model: &Model, actuator: usize) -> (f64, f64) {
    if !model.ctrl_limited(actuator) {
        return (0.0, 0.3);
    }

    let (low, high) = model.ctrl_range(actuator);

    (0.5 * (low + high), 0.3 * (high - low))
}

fn control(model: &Model, world: usize, actuator: usize, round: usize) -> f64 {
    let (centre, reach) = centre_and_reach(model, actuator);

    centre + reach * (round as f64 * 0.37 + (world * 5 + actuator) as f64 * 0.9).sin()
}

fn drive(model: &Model, metal: &mut MetalBatch, c: &mut Batch) -> Result<Miss, String> {
    let o = metal.offsets();
    let motion = o.qpos..o.qvel + model.nv();
    let mut worst = Miss {
        error: 0.0,
        world: 0,
        index: 0,
        round: 0,
    };

    for world in 0..WORLDS {
        let start = metal.row(world).to_vec();

        c.row(world).copy_from_slice(&start);
    }

    for round in 0..ROUNDS {
        for world in 0..WORLDS {
            for a in 0..model.nu() {
                let value = control(model, world, a, round);

                metal.row(world)[o.ctrl + a] = value;
                c.row(world)[o.ctrl + a] = value;
            }
        }

        if metal.step(SUBSTEPS) > 0 || c.step(SUBSTEPS) > 0 {
            return Err(metal.first_error().unwrap_or_else(|| "C MuJoCo failed".to_owned()));
        }

        for world in 0..WORLDS {
            let ours = metal.row(world)[motion.clone()].to_vec();
            let theirs = &c.row(world)[motion.clone()];

            for (index, (x, y)) in ours.iter().zip(theirs).enumerate() {
                let off = (x - y).abs() / y.abs().max(1.0);
                let error = if off.is_nan() { f64::INFINITY } else { off };

                if error > worst.error {
                    worst = Miss {
                        error,
                        world,
                        index,
                        round: round + 1,
                    };
                }
            }
        }
    }

    Ok(worst)
}

fn describe(miss: &Miss, nq: usize) -> String {
    let (field, index) = if miss.index < nq {
        ("qpos", miss.index)
    } else {
        ("qvel", miss.index - nq)
    };

    format!(
        "{field}[{index}] of robot {} is off from C MuJoCo by {:.1e} after {} control steps, and qualification allows {TOLERANCE:.0e}",
        miss.world, miss.error, miss.round
    )
}

pub fn physics(model: &Model, metal: &mut MetalBatch) -> Result<(), String> {
    let mut c = Batch::new(model, WORLDS, 1)?;
    let miss = drive(model, metal, &mut c)?;

    if miss.error > TOLERANCE {
        return Err(describe(&miss, model.nq()));
    }

    Ok(())
}

pub enum Admission {
    Metal { device: String },
    Mujoco { reason: String },
}

pub fn admission(model: &Model, kernel: &Kernel) -> Admission {
    match admit(model, kernel) {
        Ok(device) => Admission::Metal { device },
        Err(why) => Admission::Mujoco {
            reason: format!("Forge's Metal engine can't step this job: {why}"),
        },
    }
}

pub fn admit(model: &Model, kernel: &Kernel) -> Result<String, String> {
    if let Some(why) = refusal(&Plan::new(kernel.clone())) {
        return Err(why);
    }

    let mut metal = MetalBatch::new(model, kernel.clone(), WORLDS)?;

    metal
        .qualify_arithmetic()
        .map_err(|why| format!("{} failed its qualification vectors: {why}", metal.device()))?;
    physics(model, &mut metal).map_err(|why| format!("{} failed its qualification vectors: {why}", metal.device()))?;

    Ok(metal.device())
}
