use serde_json::Value;

pub const MAX_EYES: usize = 4;
pub const MAX_RAYS: usize = 32 * 24;
pub const RANGE_M: [f64; 2] = [0.2, 10.0];
pub const RAY_GROUPS: [u8; 6] = [1, 1, 1, 0, 1, 1];
pub const EYES_REFUSAL: &str = "Forge's engines can't cast eye rays yet";
const UNIT_TOLERANCE: f64 = 1e-3;

#[derive(Clone, Debug, PartialEq)]
pub struct EyeSpec {
    pub part: String,
    pub body: String,
    pub pos: [f64; 3],
    pub dirs: Vec<f64>,
    pub cols: usize,
    pub rows: usize,
    pub range_m: f64,
}

impl EyeSpec {
    pub fn rays(&self) -> usize {
        self.cols * self.rows
    }

    pub fn name(&self) -> &str {
        if self.part.is_empty() {
            &self.body
        } else {
            &self.part
        }
    }
}

pub fn width(eyes: &[EyeSpec]) -> usize {
    eyes.iter().map(EyeSpec::rays).sum()
}

pub fn ray_value(dist: f64, range_m: f64) -> f32 {
    if dist < 0.0 || dist > range_m {
        1.0
    } else {
        (dist / range_m) as f32
    }
}

fn finite_numbers(value: Option<&Value>, key: &str) -> Result<Vec<f64>, String> {
    let list = value
        .and_then(Value::as_array)
        .ok_or_else(|| format!("each eye needs a list of numbers in {key}"))?;

    list.iter()
        .map(|v| v.as_f64().filter(|n| n.is_finite()))
        .collect::<Option<Vec<f64>>>()
        .ok_or_else(|| format!("an eye has a non-number in {key}"))
}

fn count(eye: &Value, key: &str) -> Result<usize, String> {
    eye.get(key)
        .and_then(Value::as_u64)
        .filter(|n| *n > 0)
        .map(|n| n as usize)
        .ok_or_else(|| format!("each eye needs a whole number of at least 1 in {key}"))
}

fn checked_dirs(dirs: Vec<f64>, rays: usize) -> Result<Vec<f64>, String> {
    if dirs.len() != 3 * rays {
        return Err(format!(
            "an eye of {rays} rays needs {} numbers in dirs, and has {}",
            3 * rays,
            dirs.len()
        ));
    }

    let unit_or_zero = |d: &[f64; 3]| {
        let length = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();

        length == 0.0 || (length - 1.0).abs() <= UNIT_TOLERANCE
    };

    match dirs.as_chunks::<3>().0.iter().position(|d| !unit_or_zero(d)) {
        Some(ray) => Err(format!("an eye's ray {ray} is neither a unit direction nor [0, 0, 0]")),
        None => Ok(dirs),
    }
}

fn eye(value: &Value) -> Result<EyeSpec, String> {
    let body = value
        .get("body")
        .and_then(Value::as_str)
        .filter(|b| !b.is_empty())
        .ok_or("each eye needs the name of the body it's mounted on")?;
    let pos: [f64; 3] = finite_numbers(value.get("pos"), "pos")?
        .try_into()
        .map_err(|_| "each eye needs three numbers in pos".to_owned())?;
    let (cols, rows) = (count(value, "cols")?, count(value, "rows")?);
    let range_m = value.get("rangeM").and_then(Value::as_f64).unwrap_or(f64::NAN);

    if cols * rows > MAX_RAYS {
        return Err(format!(
            "an eye casts at most {MAX_RAYS} rays, and this one asks for {}",
            cols * rows
        ));
    }

    if !(RANGE_M[0]..=RANGE_M[1]).contains(&range_m) {
        return Err(format!("an eye's rangeM runs from {} to {} m", RANGE_M[0], RANGE_M[1]));
    }

    Ok(EyeSpec {
        part: value.get("part").and_then(Value::as_str).unwrap_or_default().to_owned(),
        body: body.to_owned(),
        pos,
        dirs: checked_dirs(finite_numbers(value.get("dirs"), "dirs")?, cols * rows)?,
        cols,
        rows,
        range_m,
    })
}

pub fn parse(root: &Value) -> Result<Vec<EyeSpec>, String> {
    let Some(value) = root.get("eyes").filter(|v| !v.is_null()) else {
        return Ok(Vec::new());
    };
    let list = value.as_array().ok_or("job.json has a non-list eyes")?;

    if list.len() > MAX_EYES {
        return Err(format!(
            "a policy sees through at most {MAX_EYES} eyes, and this job has {}",
            list.len()
        ));
    }

    list.iter().map(eye).collect()
}

#[cfg(test)]
mod tests {
    use super::{parse, ray_value, width};
    use serde_json::{json, Value};

    fn job(eye: Value) -> Value {
        json!({ "eyes": [eye] })
    }

    fn sample() -> Value {
        json!({ "part": "cam-1", "body": "head", "pos": [0, 0, 0.05], "dirs": [0, -1, 0, 0, 0, 0], "cols": 2, "rows": 1, "rangeM": 3 })
    }

    #[test]
    fn a_blind_job_has_no_eyes() {
        assert!(parse(&json!({})).expect("parses").is_empty());
    }

    #[test]
    fn reads_an_eye_and_counts_its_rays() {
        let eyes = parse(&job(sample())).expect("parses");

        assert_eq!(eyes[0].body, "head");
        assert_eq!(eyes[0].pos, [0.0, 0.0, 0.05]);
        assert_eq!(width(&eyes), 2);
    }

    #[test]
    fn refuses_eyes_outside_the_contract() {
        let mut far = sample();
        let mut wide = sample();
        let mut short = sample();
        let mut bent = sample();

        far["rangeM"] = json!(12);
        wide["cols"] = json!(1000);
        short["dirs"] = json!([0, -1, 0]);
        bent["dirs"] = json!([0, -2, 0, 0, 0, 0]);

        assert!(parse(&job(far)).expect_err("range").contains("rangeM"));
        assert!(parse(&job(wide)).expect_err("rays").contains("768"));
        assert!(parse(&job(short)).expect_err("dirs").contains("dirs"));
        assert!(parse(&job(bent)).expect_err("unit").contains("unit"));
        assert!(
            parse(&json!({ "eyes": [sample(), sample(), sample(), sample(), sample()] }))
                .expect_err("count")
                .contains("at most 4")
        );
    }

    #[test]
    fn a_ray_reads_its_share_of_the_range_and_one_past_it() {
        assert_eq!(ray_value(1.5, 3.0), 0.5);
        assert_eq!(ray_value(-1.0, 3.0), 1.0);
        assert_eq!(ray_value(3.5, 3.0), 1.0);
    }
}
