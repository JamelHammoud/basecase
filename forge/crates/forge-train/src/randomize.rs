use crate::options::TaskOptions;
use crate::physics::Physics;
use crate::rng::Rng;
use crate::robot::ModelRef;
use crate::servo_gains;

const SERVO_RANGE: (f64, f64) = (0.85, 1.15);

pub const RANDOMIZED_FIELDS: [&str; 4] = ["geom_friction", "body_mass", "actuator_gainprm", "actuator_biasprm"];
pub const RETHREADED_FIELDS: [&str; 5] = [
    "geom_friction",
    "body_mass",
    "actuator_gainprm",
    "actuator_biasprm",
    "actuator_forcerange",
];

fn servo_draw(nu: usize, gains: &[Vec<Option<f64>>], rng: &mut Rng) -> Vec<f64> {
    let row = (!gains.is_empty()).then(|| &gains[rng.below(gains.len())]);

    (0..nu)
        .map(|a| {
            row.and_then(|r| r[a])
                .unwrap_or_else(|| rng.uniform(SERVO_RANGE.0, SERVO_RANGE.1))
        })
        .collect()
}

pub fn servo_scales(nu: usize, gains: &[Vec<Option<f64>>], rngs: &mut [Rng]) -> Vec<f64> {
    rngs.iter_mut().flat_map(|rng| servo_draw(nu, gains, rng)).collect()
}

fn scale_friction(batch: &mut Physics, [low, high]: [f64; 2], rngs: &mut [Rng]) -> Result<(), String> {
    let (friction, width) = batch.expand("geom_friction")?;

    for (row, rng) in friction.chunks_exact_mut(width).zip(rngs.iter_mut()) {
        let scale = rng.uniform(low, high);

        row.iter_mut().step_by(3).for_each(|f| *f *= scale);
    }

    Ok(())
}

fn scale_mass(batch: &mut Physics, [low, high]: [f64; 2], rngs: &mut [Rng]) -> Result<(), String> {
    let (mass, width) = batch.expand("body_mass")?;

    for (row, rng) in mass.chunks_exact_mut(width).zip(rngs.iter_mut()) {
        row[1..].iter_mut().for_each(|m| *m *= rng.uniform(low, high));
    }

    Ok(())
}

fn scale_servos(batch: &mut Physics, nu: usize, gains: &[Vec<Option<f64>>], rngs: &mut [Rng]) -> Result<(), String> {
    let servo = servo_scales(nu, gains, rngs);
    let per_sim = nu.max(1);
    let (gain, width) = batch.expand("actuator_gainprm")?;
    let gain_width = ModelRef::gain_width();

    for (row, stiffness) in gain.chunks_exact_mut(width).zip(servo.chunks_exact(per_sim)) {
        row.chunks_exact_mut(gain_width)
            .zip(stiffness)
            .for_each(|(params, k)| params[0] *= k);
    }

    let (bias, width) = batch.expand("actuator_biasprm")?;
    let bias_width = ModelRef::bias_width();

    for (row, stiffness) in bias.chunks_exact_mut(width).zip(servo.chunks_exact(per_sim)) {
        for (params, k) in row.chunks_exact_mut(bias_width).zip(stiffness) {
            params[1] *= k;
            params[2] *= k;
        }
    }

    Ok(())
}

fn scale_strength(batch: &mut Physics, [low, high]: [f64; 2], rngs: &mut [Rng]) -> Result<(), String> {
    let (range, width) = batch.expand("actuator_forcerange")?;

    for (row, rng) in range.chunks_exact_mut(width.max(1)).zip(rngs.iter_mut()) {
        let scale = rng.uniform(low, high);

        row.iter_mut().for_each(|f| *f *= scale);
    }

    Ok(())
}

pub fn randomize(batch: &mut Physics, nu: usize, options: &TaskOptions, rngs: &mut [Rng]) -> Result<(), String> {
    servo_gains::check(&options.servo_gains, nu)?;

    let ranges = &options.physics;

    scale_friction(batch, ranges.friction, rngs)?;
    scale_mass(batch, ranges.mass, rngs)?;
    scale_servos(batch, nu, &options.servo_gains, rngs)?;

    match ranges.strength {
        Some(strength) => scale_strength(batch, strength, rngs),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::{servo_scales, SERVO_RANGE};
    use crate::rng::Rng;

    const NU: usize = 3;

    fn streams(seed: u64) -> Vec<Rng> {
        (0..6).map(|i| Rng::new(seed, i)).collect()
    }

    fn inside(k: f64) -> bool {
        (SERVO_RANGE.0..SERVO_RANGE.1).contains(&k)
    }

    #[test]
    fn without_servo_gains_the_draw_is_the_uniform_one() {
        for seed in [0, 4, 11] {
            let mut rngs = streams(seed);
            let mut expected = streams(seed);
            let uniform: Vec<f64> = expected
                .iter_mut()
                .flat_map(|rng| {
                    (0..NU)
                        .map(|_| rng.uniform(SERVO_RANGE.0, SERVO_RANGE.1))
                        .collect::<Vec<_>>()
                })
                .collect();

            assert_eq!(servo_scales(NU, &[], &mut rngs), uniform);
            assert!(rngs
                .iter_mut()
                .zip(&mut expected)
                .all(|(a, b)| a.next_u64() == b.next_u64()));
        }
    }

    #[test]
    fn each_robot_takes_one_measured_row_and_draws_its_unmeasured_servos() {
        let gains = vec![vec![Some(0.5), None, Some(2.0)], vec![Some(3.0), None, Some(0.25)]];
        let scales = servo_scales(NU, &gains, &mut streams(7));
        let (rows, rest) = scales.as_chunks::<NU>();

        assert_eq!((rows.len(), rest.len()), (6, 0));
        assert!(rows.iter().all(|r| inside(r[1])));
        assert!(rows
            .iter()
            .all(|r| [r[0], r[2]] == [0.5, 2.0] || [r[0], r[2]] == [3.0, 0.25]));
        assert!(rows.iter().any(|r| r[0] == 0.5) && rows.iter().any(|r| r[0] == 3.0));
    }
}

#[cfg(all(test, feature = "native"))]
#[path = "randomize_tests.rs"]
mod physics_tests;
