use crate::export::write_atomically;
use crate::mlp::Mlp;
use crate::normalizer::Normalizer;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

const RESUME_FORMAT: &str = "basecase-resume";
const RESUME_VERSION: u64 = 1;
const STD_EPSILON: f64 = 1e-8;

#[derive(Clone, Debug, PartialEq)]
pub struct Net {
    pub sizes: Vec<usize>,
    pub params: Vec<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Snapshot {
    pub algo: String,
    pub actor: Net,
    pub critic: Net,
    pub log_std: Vec<f32>,
    pub learn_rate: Option<f32>,
    pub log_alpha: Option<f32>,
}

pub struct WarmStart {
    pub norm: Normalizer,
    pub state: Snapshot,
}

fn dashed(sizes: &[usize]) -> String {
    sizes.iter().map(usize::to_string).collect::<Vec<_>>().join("-")
}

impl Net {
    pub fn of(net: &Mlp, params: &[f32]) -> Self {
        Self {
            sizes: net.sizes(),
            params: params[net.first_param..net.param_end()].to_vec(),
        }
    }

    pub fn empty() -> Self {
        Self {
            sizes: Vec::new(),
            params: Vec::new(),
        }
    }

    fn fits(&self, wanted: &[usize], head: usize) -> bool {
        let depth = wanted.len();
        let last = self.sizes.last().copied().unwrap_or(0);

        self.sizes.len() == depth
            && depth >= 2
            && self.sizes[..depth - 1] == wanted[..depth - 1]
            && (last == wanted[depth - 1] || last == head)
    }

    pub fn load_into(&self, net: &Mlp, params: &mut [f32], head: usize) -> Result<(), String> {
        let wanted = net.sizes();

        if !self.fits(&wanted, head) {
            return Err(format!(
                "The warm start doesn't fit: its network is {} and this job's is {}. Start from a policy trained on the same joints.",
                dashed(&self.sizes),
                dashed(&wanted)
            ));
        }

        let source = Mlp::plan(&self.sizes, 0);

        for (from, to) in source.layers.iter().zip(&net.layers) {
            for input in 0..from.ins {
                let row = &self.params[from.weights_at + input * from.outs..][..from.outs];

                params[to.weights_at + input * to.outs..][..from.outs].copy_from_slice(row);
            }

            params[to.bias_at..to.bias_at + from.outs].copy_from_slice(&self.params[from.bias_at..][..from.outs]);
        }

        Ok(())
    }
}

fn read_json(path: &Path) -> Result<Value, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("Couldn't read the warm start {}: {e}", path.display()))?;

    serde_json::from_str(&text).map_err(|e| format!("Couldn't parse the warm start {}: {e}", path.display()))
}

fn floats(value: &Value, key: &str) -> Result<Vec<f32>, String> {
    let list = value[key]
        .as_array()
        .ok_or_else(|| format!("The warm start has no {key}"))?;

    list.iter()
        .map(|v| v.as_f64().filter(|x| x.is_finite()).map(|x| x as f32))
        .collect::<Option<Vec<f32>>>()
        .ok_or_else(|| format!("The warm start has a non-number in {key}"))
}

fn wide(value: &Value, key: &str) -> Result<Vec<f64>, String> {
    let list = value[key]
        .as_array()
        .ok_or_else(|| format!("The warm start has no {key}"))?;

    list.iter()
        .map(|v| v.as_f64().filter(|x| x.is_finite()))
        .collect::<Option<Vec<f64>>>()
        .ok_or_else(|| format!("The warm start has a non-number in {key}"))
}

fn count(value: &Value, key: &str) -> Result<usize, String> {
    value[key]
        .as_u64()
        .map(|v| v as usize)
        .ok_or_else(|| format!("The warm start has no {key}"))
}

fn policy_layer(layer: &Value, net: &mut Net) -> Result<(), String> {
    let (ins, outs) = (count(layer, "in")?, count(layer, "out")?);
    let (weights, bias) = (floats(layer, "w")?, floats(layer, "b")?);
    let joined = net.sizes.last().is_none_or(|&last| last == ins);

    if weights.len() != ins * outs || bias.len() != outs || !joined {
        return Err(format!(
            "The warm start policy has a broken layer {}",
            net.sizes.len().max(1)
        ));
    }

    if net.sizes.is_empty() {
        net.sizes.push(ins);
    }

    net.sizes.push(outs);
    net.params.extend(
        (0..ins)
            .flat_map(|i| (0..outs).map(move |o| (i, o)))
            .map(|(i, o)| weights[o * ins + i]),
    );
    net.params.extend_from_slice(&bias);

    Ok(())
}

fn checked_norm(norm: Normalizer, actor: &Net) -> Result<Normalizer, String> {
    if norm.mean.len() != actor.sizes[0] || norm.var.len() != actor.sizes[0] {
        return Err("The warm start's normalizer doesn't match its network".to_owned());
    }

    Ok(norm)
}

fn from_policy(policy: &Value) -> Result<WarmStart, String> {
    let mut actor = Net::empty();

    for layer in policy["layers"]
        .as_array()
        .ok_or("The warm start policy has no layers")?
    {
        policy_layer(layer, &mut actor)?;
    }

    if actor.sizes.len() < 2 {
        return Err("The warm start policy has no layers".to_owned());
    }

    let mean = wide(policy, "obsMean")?;
    let var = wide(policy, "obsStd")?
        .iter()
        .map(|s| (s * s - STD_EPSILON).max(0.0))
        .collect();
    let seen = policy["trainedSteps"].as_f64().unwrap_or(1.0);
    let norm = checked_norm(Normalizer::restored(mean, var, seen), &actor)?;
    let state = Snapshot {
        algo: String::new(),
        actor,
        critic: Net::empty(),
        log_std: Vec::new(),
        learn_rate: None,
        log_alpha: None,
    };

    Ok(WarmStart { norm, state })
}

fn net(value: &Value, key: &str) -> Result<Net, String> {
    let part = &value[key];
    let sizes = part["sizes"]
        .as_array()
        .and_then(|l| {
            l.iter()
                .map(|v| v.as_u64().map(|s| s as usize))
                .collect::<Option<Vec<_>>>()
        })
        .ok_or_else(|| format!("The warm start has no {key} sizes"))?;

    Ok(Net {
        sizes,
        params: floats(part, "params")?,
    })
}

fn optional(value: &Value, key: &str) -> Option<f32> {
    value[key].as_f64().filter(|x| x.is_finite()).map(|x| x as f32)
}

fn from_resume(resume: &Value) -> Result<WarmStart, String> {
    if resume["format"] != RESUME_FORMAT || resume["version"] != RESUME_VERSION {
        return Err("The warm start's resume.json is from another version of Forge".to_owned());
    }

    let actor = net(resume, "actor")?;
    let planned = Mlp::plan(&actor.sizes, 0);

    if actor.sizes.len() < 2 || planned.param_end() != actor.params.len() {
        return Err("The warm start's actor doesn't match its sizes".to_owned());
    }

    let seen = resume["obsCount"].as_f64().unwrap_or(1.0);
    let norm = Normalizer::restored(wide(resume, "obsMean")?, wide(resume, "obsVar")?, seen);
    let state = Snapshot {
        algo: resume["algo"].as_str().unwrap_or_default().to_owned(),
        critic: net(resume, "critic")?,
        log_std: floats(resume, "logStd").unwrap_or_default(),
        learn_rate: optional(resume, "learnRate"),
        log_alpha: optional(resume, "logAlpha"),
        actor,
    };

    Ok(WarmStart {
        norm: checked_norm(norm, &state.actor)?,
        state,
    })
}

pub fn load(path: &Path) -> Result<WarmStart, String> {
    if !path.is_dir() {
        return from_policy(&read_json(path)?);
    }

    let resume = path.join("resume.json");

    if resume.exists() {
        return from_resume(&read_json(&resume)?);
    }

    from_policy(&read_json(&path.join("policy.json"))?)
}

fn net_json(net: &Net) -> Result<String, String> {
    let sizes = serde_json::to_string(&net.sizes).map_err(|e| e.to_string())?;
    let params = serde_json::to_string(&net.params).map_err(|e| e.to_string())?;

    Ok(format!(r#"{{"sizes":{sizes},"params":{params}}}"#))
}

pub fn from_text(text: &str) -> Result<WarmStart, String> {
    let value: Value = serde_json::from_str(text).map_err(|e| format!("The warm start isn't JSON: {e}"))?;

    if value["format"] == RESUME_FORMAT {
        return from_resume(&value);
    }

    from_policy(&value)
}

pub fn write_resume(path: &Path, state: &Snapshot, norm: &Normalizer, steps: u64) -> Result<(), String> {
    write_atomically(path, resume_text(state, norm, steps)?.as_bytes())
}

pub fn resume_text(state: &Snapshot, norm: &Normalizer, steps: u64) -> Result<String, String> {
    let header = json!({
        "format": RESUME_FORMAT,
        "version": RESUME_VERSION,
        "algo": state.algo,
        "trainedSteps": steps,
        "obsMean": norm.mean,
        "obsVar": norm.var,
        "obsCount": norm.count(),
        "logStd": state.log_std,
        "learnRate": state.learn_rate,
        "logAlpha": state.log_alpha,
    })
    .to_string();
    Ok(format!(
        r#"{},"actor":{},"critic":{}}}"#,
        &header[..header.len() - 1],
        net_json(&state.actor)?,
        net_json(&state.critic)?
    ))
}

#[cfg(test)]
#[path = "warm_tests.rs"]
mod tests;
