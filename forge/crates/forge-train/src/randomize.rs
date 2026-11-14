use crate::physics::Physics;
use crate::rng::Rng;
use crate::robot::ModelRef;
use crate::servo_gains;
use serde_json::Value;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ranges {
    pub friction: [f64; 2],
    pub mass: [f64; 2],
    pub strength: [f64; 2],
}

impl Default for Ranges {
    fn default() -> Self {
        Self {
            friction: [0.6, 1.3],
            mass: [0.85, 1.15],
            strength: [0.85, 1.15],
        }
    }
}

const LIMITS: Ranges = Ranges {
    friction: [0.05, 3.0],
    mass: [0.25, 4.0],
    strength: [0.2, 2.0],
};

fn range(
    value: Option<&Value>,
    key: &str,
    (fallback, [least, most]): ([f64; 2], [f64; 2]),
) -> Result<[f64; 2], String> {
    let Some(value) = value else {
        return Ok(fallback);
    };
    let pair = value
        .as_array()
        .filter(|l| l.len() == 2)
        .and_then(|l| Some([l[0].as_f64()?, l[1].as_f64()?]))
        .ok_or_else(|| format!("job.json needs two numbers in randomization.{key}"))?;

    if pair[0] >= least && pair[1] <= most && pair[0] <= pair[1] {
        return Ok(pair);
    }

    Err(format!(
        "randomization.{key} needs a low and a high, in order, from {least} to {most}"
    ))
}

pub fn parse(root: &Value) -> Result<Ranges, String> {
    let Some(value) = root.get("randomization") else {
        return Ok(Ranges::default());
    };
    let base = Ranges::default();

    Ok(Ranges {
        friction: range(value.get("friction"), "friction", (base.friction, LIMITS.friction))?,
        mass: range(value.get("mass"), "mass", (base.mass, LIMITS.mass))?,
        strength: range(value.get("strength"), "strength", (base.strength, LIMITS.strength))?,
    })
}

pub const RANDOMIZED_FIELDS: [&str; 4] = ["geom_friction", "body_mass", "actuator_gainprm", "actuator_biasprm"];

fn servo_draw(nu: usize, (strength, gains): ([f64; 2], &[Vec<Option<f64>>]), rng: &mut Rng) -> Vec<f64> {
    let row = (!gains.is_empty()).then(|| &gains[rng.below(gains.len())]);

    (0..nu)
        .map(|a| {
            row.and_then(|r| r[a])
                .unwrap_or_else(|| rng.uniform(strength[0], strength[1]))
        })
        .collect()
}

pub fn servo_scales(nu: usize, strength: [f64; 2], gains: &[Vec<Option<f64>>], rngs: &mut [Rng]) -> Vec<f64> {
    rngs.iter_mut()
        .flat_map(|rng| servo_draw(nu, (strength, gains), rng))
        .collect()
}

pub fn randomize(
    batch: &mut Physics,
    (nu, ranges): (usize, &Ranges),
    gains: &[Vec<Option<f64>>],
    rngs: &mut [Rng],
) -> Result<(), String> {
    servo_gains::check(gains, nu)?;

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

    let servo = servo_scales(nu, ranges.strength, gains, rngs);
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
mod tests {
    use super::{parse, servo_scales, Ranges};
    use crate::rng::Rng;
    use serde_json::json;

    #[test]
    fn no_randomization_keeps_the_trainer_ranges() {
        assert_eq!(parse(&json!({})).expect("parses"), Ranges::default());
    }

    #[test]
    fn reads_wider_ranges_and_keeps_the_rest() {
        let ranges = parse(&json!({ "randomization": { "friction": [0.2, 1.3] } })).expect("parses");

        assert_eq!(ranges.friction, [0.2, 1.3]);
        assert_eq!(ranges.mass, Ranges::default().mass);
    }

    #[test]
    fn refuses_ranges_out_of_order_or_past_the_limits() {
        assert!(parse(&json!({ "randomization": { "mass": [1.2, 0.9] } })).is_err());
        assert!(parse(&json!({ "randomization": { "strength": [0.1, 1.0] } })).is_err());
        assert!(parse(&json!({ "randomization": { "friction": [0.5] } })).is_err());
    }

    const NU: usize = 3;

    fn streams(seed: u64) -> Vec<Rng> {
        (0..6).map(|i| Rng::new(seed, i)).collect()
    }

    fn strength() -> [f64; 2] {
        Ranges::default().strength
    }

    fn inside(k: f64) -> bool {
        (strength()[0]..strength()[1]).contains(&k)
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
                        .map(|_| rng.uniform(strength()[0], strength()[1]))
                        .collect::<Vec<_>>()
                })
                .collect();

            assert_eq!(servo_scales(NU, strength(), &[], &mut rngs), uniform);
            assert!(rngs
                .iter_mut()
                .zip(&mut expected)
                .all(|(a, b)| a.next_u64() == b.next_u64()));
        }
    }

    #[test]
    fn each_robot_takes_one_measured_row_and_draws_its_unmeasured_servos() {
        let gains = vec![vec![Some(0.5), None, Some(2.0)], vec![Some(3.0), None, Some(0.25)]];
        let scales = servo_scales(NU, strength(), &gains, &mut streams(7));
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
