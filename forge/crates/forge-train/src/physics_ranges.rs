use serde_json::{Map, Value};

pub const FRICTION_RANGE: [f64; 2] = [0.6, 1.3];
pub const MASS_RANGE: [f64; 2] = [0.85, 1.15];
pub const STRENGTH_REFUSAL: &str = "Forge's engines can't vary servo strength";
const FIELDS: [&str; 3] = ["friction", "mass", "strength"];

#[derive(Clone, Debug, PartialEq)]
pub struct PhysicsRanges {
    pub friction: [f64; 2],
    pub mass: [f64; 2],
    pub strength: Option<[f64; 2]>,
}

impl Default for PhysicsRanges {
    fn default() -> Self {
        Self {
            friction: FRICTION_RANGE,
            mass: MASS_RANGE,
            strength: None,
        }
    }
}

fn range(value: &Value, key: &str) -> Result<[f64; 2], String> {
    let bounds = value
        .as_array()
        .filter(|l| l.len() == 2)
        .map(|l| (l[0].as_f64(), l[1].as_f64()));

    match bounds {
        Some((Some(low), Some(high))) if low.is_finite() && high.is_finite() && low > 0.0 && low <= high => {
            Ok([low, high])
        }
        _ => Err(format!(
            "physicsRanges.{key} needs two numbers, a low above 0 and a high at least as large"
        )),
    }
}

fn field(object: &Map<String, Value>, key: &str) -> Result<Option<[f64; 2]>, String> {
    object.get(key).map(|v| range(v, key)).transpose()
}

pub fn parse(root: &Value) -> Result<PhysicsRanges, String> {
    let Some(value) = root.get("physicsRanges") else {
        return Ok(PhysicsRanges::default());
    };
    let object = value
        .as_object()
        .ok_or("physicsRanges needs an object with friction, mass or strength")?;

    if let Some(key) = object.keys().find(|k| !FIELDS.contains(&k.as_str())) {
        return Err(format!(
            "physicsRanges has no field {key}; it takes friction, mass and strength"
        ));
    }

    Ok(PhysicsRanges {
        friction: field(object, "friction")?.unwrap_or(FRICTION_RANGE),
        mass: field(object, "mass")?.unwrap_or(MASS_RANGE),
        strength: field(object, "strength")?,
    })
}

#[cfg(test)]
mod tests {
    use super::{parse, PhysicsRanges, FRICTION_RANGE, MASS_RANGE};
    use serde_json::json;

    fn refused(ranges: serde_json::Value) -> String {
        parse(&json!({ "physicsRanges": ranges })).expect_err("refused")
    }

    #[test]
    fn no_field_keeps_todays_ranges() {
        assert_eq!(parse(&json!({})).expect("parses"), PhysicsRanges::default());
        assert_eq!(PhysicsRanges::default().friction, FRICTION_RANGE);
        assert_eq!(PhysicsRanges::default().mass, MASS_RANGE);
    }

    #[test]
    fn reads_each_range_and_keeps_the_rest() {
        let ranges =
            parse(&json!({ "physicsRanges": { "friction": [0.2, 1.5], "strength": [0.4, 1] } })).expect("parses");

        assert_eq!(ranges.friction, [0.2, 1.5]);
        assert_eq!(ranges.mass, MASS_RANGE);
        assert_eq!(ranges.strength, Some([0.4, 1.0]));
    }

    #[test]
    fn refuses_ranges_that_cant_scale() {
        assert!(refused(json!({ "friction": [0, 1] })).contains("physicsRanges.friction"));
        assert!(refused(json!({ "mass": [1.2, 0.9] })).contains("physicsRanges.mass"));
        assert!(refused(json!({ "strength": [0.5] })).contains("physicsRanges.strength"));
        assert!(refused(json!({ "strength": ["a", 1] })).contains("physicsRanges.strength"));
        assert!(refused(json!({ "gravity": [1, 2] })).contains("no field gravity"));
        assert!(refused(json!([0.5, 1])).contains("needs an object"));
    }
}
