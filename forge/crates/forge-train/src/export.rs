use crate::deployed::Deployed;
use crate::evaluate::CheckSample;
use crate::mlp::Mlp;
use crate::normalizer::Normalizer;
use crate::onnx;
use crate::robot::Robot;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const POLICY_FORMAT: &str = "basecase-policy";
const POLICY_VERSION: u32 = 1;
const ROUND_SCALE: f64 = 1e7;

pub fn rounded(value: f32) -> f64 {
    (value as f64 * ROUND_SCALE).round() / ROUND_SCALE
}

fn layer_json(actor: &Mlp, params: &[f32]) -> Value {
    let layers: Vec<Value> = actor
        .layers
        .iter()
        .map(|layer| {
            let weights: Vec<f64> = actor
                .weights_by_output(params, layer)
                .iter()
                .map(|v| rounded(*v))
                .collect();
            let bias: Vec<f64> = params[layer.bias_at..layer.bias_at + layer.outs]
                .iter()
                .map(|v| rounded(*v))
                .collect();

            json!({ "in": layer.ins, "out": layer.outs, "w": weights, "b": bias })
        })
        .collect();

    Value::Array(layers)
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era = (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);

    (year, month, day)
}

fn timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64);
    let (year, month, day) = civil_from_days(seconds.div_euclid(86_400));
    let in_day = seconds.rem_euclid(86_400);

    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}",
        in_day / 3600,
        in_day % 3600 / 60,
        in_day % 60
    )
}

pub fn write_atomically(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let staging = path.with_extension("tmp");

    fs::write(&staging, bytes).map_err(|e| format!("Couldn't write {}: {e}", staging.display()))?;
    fs::rename(&staging, path).map_err(|e| format!("Couldn't save {}: {e}", path.display()))
}

pub struct Trained<'a> {
    pub robot: &'a Robot,
    pub policy: &'a Deployed,
    pub norm: &'a Normalizer,
}

pub fn write_policy(path: &Path, run: &Trained, steps: u64) -> Result<(), String> {
    let spec = policy_json(run, steps, timestamp());

    write_atomically(path, spec.to_string().as_bytes())
}

pub fn policy_json(run: &Trained, steps: u64, created_at: String) -> Value {
    let job = &run.robot.job;
    let mut spec = json!({
        "format": POLICY_FORMAT,
        "version": POLICY_VERSION,
        "task": job.task_name,
        "robot": job.robot_name,
        "joints": job.joints.iter().map(|j| j.id.clone()).collect::<Vec<String>>(),
        "defaultPose": job.default_pose,
        "actionScale": job.action_scale,
        "controlDt": job.control_dt,
        "command": job.command,
        "obsMean": run.norm.mean,
        "obsStd": run.norm.std(),
        "layers": layer_json(&run.policy.net, &run.policy.params),
        "activation": "elu",
        "trainedSteps": steps,
        "mujoco": run.robot.mujoco,
        "createdAt": created_at,
    });

    if let (Some(name), Value::Object(fields)) = (run.policy.squash.name(), &mut spec) {
        fields.insert("squash".to_owned(), json!(name));
    }

    spec
}

pub fn write_onnx(path: &Path, run: &Trained) -> Result<(), String> {
    let mean: Vec<f32> = run.norm.mean.iter().map(|v| *v as f32).collect();
    let std: Vec<f32> = run.norm.std().iter().map(|v| *v as f32).collect();
    let model = onnx::Policy {
        actor: &run.policy.net,
        params: &run.policy.params,
        mean: &mean,
        std: &std,
        squash: run.policy.squash,
    };

    write_atomically(path, &onnx::encode(&model))
}

pub fn write_check(path: &Path, samples: &[CheckSample]) -> Result<(), String> {
    let list: Vec<Value> = samples
        .iter()
        .map(|s| json!({ "obs": s.obs, "action": s.action }))
        .collect();

    write_atomically(path, json!({ "samples": list }).to_string().as_bytes())
}

#[cfg(test)]
mod tests {
    use super::civil_from_days;

    #[test]
    fn calendar_dates() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(20_764), (2026, 11, 7));
        assert_eq!(civil_from_days(11_016), (2000, 2, 29));
    }
}
