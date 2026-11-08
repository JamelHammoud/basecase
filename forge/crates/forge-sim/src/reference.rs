use crate::args::Args;
use crate::parity::{rollout_ctrl, single, REPORT_EVERY};
use forge_mujoco::{Data, Model};
use forge_sim::Snapshot;
use serde_json::{json, Value};

fn values(data: &Data, model: &Model, name: &str) -> Vec<f64> {
    data.array(model, name)
        .and_then(|a| a.f64s())
        .map(<[f64]>::to_vec)
        .unwrap_or_default()
}

pub fn snapshot(model: &Model, data: &mut Data) -> Snapshot {
    Snapshot {
        qpos: data.qpos().to_vec(),
        qvel: data.qvel().to_vec(),
        xpos: values(data, model, "xpos"),
        cinert: values(data, model, "cinert"),
        qfrc_bias: values(data, model, "qfrc_bias"),
        qacc: values(data, model, "qacc"),
        ncon: data.ncon(),
    }
}

pub fn parity(args: &Args) -> Result<Value, String> {
    let model = Model::load(&args.xml)?;
    let mut data = Data::new(&model);

    data.forward(&model);

    let first = single(&snapshot(&model, &mut data));
    let mut rollout = Vec::new();

    for i in 0..args.steps {
        data.ctrl().fill(rollout_ctrl(i));
        data.step(&model);

        if (i + 1).is_multiple_of(REPORT_EVERY) {
            rollout.push(json!({ "step": i + 1, "qpos": data.qpos().to_vec(), "qvel": data.qvel().to_vec() }));
        }
    }

    Ok(json!({ "backend": "mujoco", "version": forge_mujoco::version(), "single": first, "rollout": rollout }))
}
