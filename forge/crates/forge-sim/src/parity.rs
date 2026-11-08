use crate::args::{Args, Backend};
use crate::reference;
use forge_sim::{Sim, Snapshot};
use serde_json::{json, Value};

pub const REPORT_EVERY: usize = 25;

pub fn rollout_ctrl(i: usize) -> f64 {
    0.2 * (0.01 * i as f64).sin()
}

pub fn single(s: &Snapshot) -> Value {
    json!({
        "qpos": s.qpos,
        "xpos": s.xpos,
        "cinert": s.cinert,
        "qfrc_bias": s.qfrc_bias,
        "qacc": s.qacc,
        "ncon": s.ncon,
    })
}

fn simd(args: &Args) -> Result<Value, String> {
    let (_, kernel) = forge_ir::load(&args.xml).map_err(|r| r.to_string())?;
    let nu = kernel.nu;
    let mut sim = Sim::new(kernel, 1);

    let first = single(&sim.forward_snapshot(0));
    let mut rollout = Vec::new();

    for i in 0..args.steps {
        sim.set_ctrl(0, &vec![rollout_ctrl(i); nu]);
        sim.step();

        if (i + 1).is_multiple_of(REPORT_EVERY) {
            let s = sim.state(0);

            rollout.push(json!({ "step": i + 1, "qpos": s.qpos, "qvel": s.qvel }));
        }
    }

    Ok(json!({ "backend": "simd", "single": first, "rollout": rollout }))
}

pub fn run(args: &Args) -> Result<Value, String> {
    match args.backend {
        Backend::Simd => simd(args),
        Backend::Mujoco => reference::parity(args),
        Backend::Metal => crate::metal_runs::parity(args),
    }
}
