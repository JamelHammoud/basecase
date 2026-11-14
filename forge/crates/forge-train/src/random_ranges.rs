use crate::options::pair;
use serde_json::Value;

const FRICTION_RANGE: [f64; 2] = [0.6, 1.3];
const MASS_RANGE: [f64; 2] = [0.85, 1.15];
const FRICTION_LIMITS: [f64; 2] = [0.05, 5.0];
const MASS_LIMITS: [f64; 2] = [0.1, 10.0];

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RandomRanges {
    pub friction: [f64; 2],
    pub mass: [f64; 2],
}

impl Default for RandomRanges {
    fn default() -> Self {
        Self {
            friction: FRICTION_RANGE,
            mass: MASS_RANGE,
        }
    }
}

fn range(value: &Value, key: &str, [lowest, highest]: [f64; 2], fallback: [f64; 2]) -> Result<[f64; 2], String> {
    let field = format!("randomRanges.{key}");
    let Some(given) = value.get(key) else {
        return Ok(fallback);
    };
    let [low, high] = pair(given, &field)?;

    if low < lowest || high > highest {
        return Err(format!("{field} runs from {lowest} to {highest}"));
    }

    Ok([low, high])
}

pub fn parse(root: &Value) -> Result<RandomRanges, String> {
    let Some(value) = root.get("randomRanges") else {
        return Ok(RandomRanges::default());
    };

    if !value.is_object() {
        return Err("job.json needs randomRanges as { friction: [lo, hi], mass: [lo, hi] }".to_owned());
    }

    Ok(RandomRanges {
        friction: range(value, "friction", FRICTION_LIMITS, FRICTION_RANGE)?,
        mass: range(value, "mass", MASS_LIMITS, MASS_RANGE)?,
    })
}

#[cfg(test)]
mod tests {
    use super::{parse, RandomRanges};
    use serde_json::{json, Value};

    fn refused(ranges: Value) -> String {
        parse(&json!({ "randomRanges": ranges })).expect_err("refused")
    }

    #[test]
    fn a_job_without_ranges_keeps_the_default_draws() {
        let defaults = RandomRanges::default();

        assert_eq!(defaults.friction, [0.6, 1.3]);
        assert_eq!(defaults.mass, [0.85, 1.15]);
        assert_eq!(parse(&json!({})).expect("parses"), defaults);
        assert_eq!(parse(&json!({ "randomRanges": {} })).expect("parses"), defaults);
    }

    #[test]
    fn reads_each_range_and_keeps_the_default_for_a_missing_one() {
        let friction = parse(&json!({ "randomRanges": { "friction": [0.3, 0.4] } })).expect("parses");
        let both = parse(&json!({ "randomRanges": { "friction": [0.05, 5], "mass": [0.1, 10] } })).expect("parses");
        let fixed = parse(&json!({ "randomRanges": { "mass": [2, 2] } })).expect("parses");

        assert_eq!(friction.friction, [0.3, 0.4]);
        assert_eq!(friction.mass, [0.85, 1.15]);
        assert_eq!((both.friction, both.mass), ([0.05, 5.0], [0.1, 10.0]));
        assert_eq!((fixed.friction, fixed.mass), ([0.6, 1.3], [2.0, 2.0]));
    }

    #[test]
    fn refuses_ranges_out_of_limits_order_or_shape() {
        assert!(refused(json!({ "friction": [0.01, 1] })).contains("randomRanges.friction runs from 0.05 to 5"));
        assert!(refused(json!({ "friction": [1, 6] })).contains("randomRanges.friction runs from 0.05 to 5"));
        assert!(refused(json!({ "mass": [0.05, 1] })).contains("randomRanges.mass runs from 0.1 to 10"));
        assert!(refused(json!({ "mass": [1, 11] })).contains("randomRanges.mass runs from 0.1 to 10"));
        assert!(refused(json!({ "mass": [1.2, 0.9] })).contains("randomRanges.mass needs a low and a high, in order"));
        assert!(refused(json!({ "friction": [1] })).contains("two numbers in randomRanges.friction"));
        assert!(refused(json!({ "friction": null })).contains("two numbers in randomRanges.friction"));
        assert!(refused(json!({ "friction": [1, "high"] })).contains("randomRanges.friction has a non-number"));
        assert!(refused(json!([0.6, 1.3])).contains("randomRanges as"));
    }
}
