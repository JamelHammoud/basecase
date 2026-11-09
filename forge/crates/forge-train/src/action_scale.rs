use serde_json::{json, Value};

#[derive(Clone, Debug, PartialEq)]
pub enum ActionScale {
    Shared(f64),
    PerJoint(Vec<f64>),
}

fn checked(scale: f64) -> Result<f64, String> {
    if scale.is_finite() && scale > 0.0 {
        return Ok(scale);
    }

    Err(format!("job.json has an action scale of {scale}; each must be above 0"))
}

impl ActionScale {
    pub fn parse(value: Option<&Value>, joints: usize) -> Result<Self, String> {
        let value = value.ok_or("job.json is missing actionScale")?;

        if let Some(scale) = value.as_f64() {
            return checked(scale).map(Self::Shared);
        }

        let list = value
            .as_array()
            .ok_or("job.json has an actionScale that is neither a number nor a list")?;

        if list.len() != joints {
            return Err(format!("job.json has {} action scales for {joints} joints", list.len()));
        }

        list.iter()
            .map(|v| v.as_f64().ok_or("job.json has a non-number in actionScale".to_owned()))
            .map(|scale| scale.and_then(checked))
            .collect::<Result<Vec<f64>, String>>()
            .map(Self::PerJoint)
    }

    pub fn of(&self, joint: usize) -> f64 {
        match self {
            Self::Shared(scale) => *scale,
            Self::PerJoint(scales) => scales[joint],
        }
    }

    pub fn to_json(&self) -> Value {
        match self {
            Self::Shared(scale) => json!(scale),
            Self::PerJoint(scales) => json!(scales),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ActionScale;
    use serde_json::json;

    #[test]
    fn reads_one_scale_or_one_per_joint() {
        let shared = ActionScale::parse(Some(&json!(0.5)), 3).expect("a number");
        let each = ActionScale::parse(Some(&json!([0.7, 1.5, 2.2])), 3).expect("a list");

        assert_eq!((shared.of(2), each.of(1)), (0.5, 1.5));
        assert_eq!(shared.to_json(), json!(0.5));
        assert_eq!(each.to_json(), json!([0.7, 1.5, 2.2]));
    }

    #[test]
    fn refuses_a_scale_per_joint_that_does_not_fit() {
        let short = ActionScale::parse(Some(&json!([0.7, 1.5])), 3).expect_err("too short");
        let zero = ActionScale::parse(Some(&json!([0.7, 0.0, 1.0])), 3).expect_err("zero");

        assert!(short.contains("2 action scales for 3 joints"));
        assert!(zero.contains("above 0"));
        assert!(ActionScale::parse(None, 3).is_err());
    }
}
