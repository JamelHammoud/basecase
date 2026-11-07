use crate::rng::Rng;
use forge_mujoco::{Batch, Model};

const FRICTION_RANGE: (f64, f64) = (0.6, 1.3);
const MASS_RANGE: (f64, f64) = (0.85, 1.15);
const SERVO_RANGE: (f64, f64) = (0.85, 1.15);

pub const RANDOMIZED_FIELDS: [&str; 4] = ["geom_friction", "body_mass", "actuator_gainprm", "actuator_biasprm"];

pub fn randomize(batch: &mut Batch, model: &Model, rngs: &mut [Rng]) -> Result<(), String> {
    let (friction, width) = batch.expand("geom_friction")?;

    for (row, rng) in friction.chunks_exact_mut(width).zip(rngs.iter_mut()) {
        let scale = rng.uniform(FRICTION_RANGE.0, FRICTION_RANGE.1);

        row.iter_mut().step_by(3).for_each(|f| *f *= scale);
    }

    let (mass, width) = batch.expand("body_mass")?;

    for (row, rng) in mass.chunks_exact_mut(width).zip(rngs.iter_mut()) {
        row[1..]
            .iter_mut()
            .for_each(|m| *m *= rng.uniform(MASS_RANGE.0, MASS_RANGE.1));
    }

    let servo: Vec<f64> = rngs
        .iter_mut()
        .flat_map(|rng| {
            (0..model.nu())
                .map(|_| rng.uniform(SERVO_RANGE.0, SERVO_RANGE.1))
                .collect::<Vec<f64>>()
        })
        .collect();
    let per_sim = model.nu();
    let (gain, width) = batch.expand("actuator_gainprm")?;
    let gain_width = Model::gain_width();

    for (row, stiffness) in gain.chunks_exact_mut(width).zip(servo.chunks_exact(per_sim.max(1))) {
        row.chunks_exact_mut(gain_width)
            .zip(stiffness)
            .for_each(|(params, k)| params[0] *= k);
    }

    let (bias, width) = batch.expand("actuator_biasprm")?;
    let bias_width = Model::bias_width();

    for (row, stiffness) in bias.chunks_exact_mut(width).zip(servo.chunks_exact(per_sim.max(1))) {
        for (params, k) in row.chunks_exact_mut(bias_width).zip(stiffness) {
            params[1] *= k;
            params[2] *= k;
        }
    }

    Ok(())
}
