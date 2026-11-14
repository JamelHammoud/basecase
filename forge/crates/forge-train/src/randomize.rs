use crate::physics::Physics;
use crate::rng::Rng;
use crate::robot::{ModelRef, Robot};

pub const RANDOMIZED_FIELDS: [&str; 4] = ["geom_friction", "body_mass", "actuator_gainprm", "actuator_biasprm"];

pub fn randomize(batch: &mut Physics, robot: &Robot, rngs: &mut [Rng]) -> Result<(), String> {
    let nu = robot.nu;
    let ranges = robot.job.options.randomization;
    let (friction, width) = batch.expand("geom_friction")?;

    for (row, rng) in friction.chunks_exact_mut(width).zip(rngs.iter_mut()) {
        let scale = rng.uniform(ranges.friction[0], ranges.friction[1]);

        row.iter_mut().step_by(3).for_each(|f| *f *= scale);
    }

    let (mass, width) = batch.expand("body_mass")?;

    for (row, rng) in mass.chunks_exact_mut(width).zip(rngs.iter_mut()) {
        row[1..]
            .iter_mut()
            .for_each(|m| *m *= rng.uniform(ranges.mass[0], ranges.mass[1]));
    }

    let servo: Vec<f64> = rngs
        .iter_mut()
        .flat_map(|rng| {
            (0..nu)
                .map(|_| rng.uniform(ranges.servo[0], ranges.servo[1]))
                .collect::<Vec<f64>>()
        })
        .collect();
    let per_sim = nu;
    let (gain, width) = batch.expand("actuator_gainprm")?;
    let gain_width = ModelRef::gain_width();

    for (row, stiffness) in gain.chunks_exact_mut(width).zip(servo.chunks_exact(per_sim.max(1))) {
        row.chunks_exact_mut(gain_width)
            .zip(stiffness)
            .for_each(|(params, k)| params[0] *= k);
    }

    let (bias, width) = batch.expand("actuator_biasprm")?;
    let bias_width = ModelRef::bias_width();

    for (row, stiffness) in bias.chunks_exact_mut(width).zip(servo.chunks_exact(per_sim.max(1))) {
        for (params, k) in row.chunks_exact_mut(bias_width).zip(stiffness) {
            params[1] *= k;
            params[2] *= k;
        }
    }

    Ok(())
}

#[cfg(test)]
#[path = "randomize_tests.rs"]
mod tests;
