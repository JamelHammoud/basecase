use serde_json::Value;

const MOST_ROWS: usize = 256;
const LOWEST_GAIN: f64 = 0.25;
const HIGHEST_GAIN: f64 = 4.0;

pub type ServoGains = Vec<Vec<Option<f64>>>;

fn gain(value: &Value, index: usize) -> Result<Option<f64>, String> {
    if value.is_null() {
        return Ok(None);
    }

    value
        .as_f64()
        .filter(|k| k.is_finite() && (LOWEST_GAIN..=HIGHEST_GAIN).contains(k))
        .map(Some)
        .ok_or_else(|| {
            format!(
                "servoGains[{index}] needs numbers from {LOWEST_GAIN} to {HIGHEST_GAIN}, or null for no measurement"
            )
        })
}

fn row(value: &Value, index: usize) -> Result<Vec<Option<f64>>, String> {
    value
        .as_array()
        .ok_or_else(|| format!("servoGains[{index}] needs a list with one gain per actuator"))?
        .iter()
        .map(|item| gain(item, index))
        .collect()
}

pub fn parse(root: &Value) -> Result<ServoGains, String> {
    let Some(value) = root.get("servoGains") else {
        return Ok(Vec::new());
    };
    let list = value
        .as_array()
        .filter(|l| (1..=MOST_ROWS).contains(&l.len()))
        .ok_or_else(|| format!("job.json needs 1 to {MOST_ROWS} rows in servoGains"))?;

    list.iter().enumerate().map(|(index, item)| row(item, index)).collect()
}

pub fn check(rows: &[Vec<Option<f64>>], nu: usize) -> Result<(), String> {
    match rows.iter().position(|r| r.len() != nu) {
        None => Ok(()),
        Some(index) => Err(format!(
            "servoGains[{index}] has {} gains; each row needs {nu}, one per actuator in the model's order",
            rows[index].len()
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::{check, parse};
    use serde_json::{json, Value};

    fn refused(rows: Value) -> String {
        parse(&json!({ "servoGains": rows })).expect_err("refused")
    }

    #[test]
    fn reads_rows_of_gains_with_nulls_for_unmeasured_servos() {
        let rows = parse(&json!({ "servoGains": [[1.04, null, 0.25], [4, 0.93, null]] })).expect("parses");

        assert_eq!(
            rows,
            vec![vec![Some(1.04), None, Some(0.25)], vec![Some(4.0), Some(0.93), None]]
        );
        assert!(parse(&json!({})).expect("parses").is_empty());
        assert!(check(&rows, 3).is_ok());
        assert!(check(&[], 3).is_ok());
        assert!(check(&rows, 2)
            .expect_err("one actuator short")
            .contains("servoGains[0] has 3 gains; each row needs 2"));
    }

    #[test]
    fn refuses_gains_out_of_range_or_not_numbers() {
        assert!(refused(json!([])).contains("1 to 256"));
        assert!(refused(json!(vec![json!([1.0]); 257])).contains("1 to 256"));
        assert!(refused(json!({ "a": [1.0] })).contains("1 to 256"));
        assert!(refused(json!([[1.0], 1.0])).contains("servoGains[1] needs a list"));
        assert!(refused(json!([[1.0, 0.2]])).contains("servoGains[0] needs numbers from 0.25 to 4"));
        assert!(refused(json!([[1.0], [4.5]])).contains("servoGains[1] needs numbers"));
        assert!(refused(json!([[-1.0]])).contains("needs numbers"));
        assert!(refused(json!([["fast"]])).contains("needs numbers"));
        assert!(refused(json!([[true]])).contains("needs numbers"));
        assert!(parse(&json!({ "servoGains": vec![json!([1.0, null]); 256] })).is_ok());
    }

    #[test]
    fn refuses_numbers_json_cannot_hold() {
        let text = r#"{ "servoGains": [[1e400]] }"#;

        assert!(serde_json::from_str::<Value>(text).map_or(true, |root| parse(&root).is_err()));
    }
}
