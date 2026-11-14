use crate::physics::Physics;
use crate::rng::Rng;
use crate::robot::ModelRef;
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

fn range(value: Option<&Value>, key: &str, (fallback, [least, most]): ([f64; 2], [f64; 2])) -> Result<[f64; 2], String> {
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

pub fn randomize(batch: &mut Physics, (nu, ranges): (usize, &Ranges), rngs: &mut [Rng]) -> Result<(), String> {
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
                .map(|_| rng.uniform(ranges.strength[0], ranges.strength[1]))
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
mod tests {
    use super::{parse, Ranges};
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
}
