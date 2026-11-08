use crate::args::Args;
use crate::drive::{controls, start_pose, DECIMATION};
use crate::parity::{rollout_ctrl, single, REPORT_EVERY};
use forge_mujoco::{Data, Model};
use forge_sim::{MetalBatch, Plan, Snapshot};
use serde_json::{json, Value};

const WORLDS: usize = 37;
const CROWD: usize = 300;
const ROUNDS: usize = 40;

pub fn parity(args: &Args) -> Result<Value, String> {
    let (model, kernel) = forge_ir::load(&args.xml).map_err(|r| r.to_string())?;
    let nu = kernel.nu;
    let mut batch = MetalBatch::new(&model, kernel, 1)?;
    let o = batch.offsets();
    let (fields, ncon) = batch.forward_fields(0, &["XPOS", "CINERT", "QBIAS", "QACC"])?;
    let row = batch.row(0).to_vec();
    let first = single(&Snapshot {
        qpos: row[o.qpos..o.qvel].to_vec(),
        qvel: Vec::new(),
        xpos: fields[0].clone(),
        cinert: fields[1].clone(),
        qfrc_bias: fields[2].clone(),
        qacc: fields[3].clone(),
        ncon,
    });
    let nq = o.qvel - o.qpos;
    let nv = fields[2].len();
    let mut rollout = Vec::new();

    for i in 0..args.steps {
        batch.row(0)[o.ctrl..o.ctrl + nu].fill(rollout_ctrl(i));

        if batch.step(1) > 0 {
            return Err(batch.first_error().unwrap_or_default());
        }

        if (i + 1).is_multiple_of(REPORT_EVERY) {
            let row = batch.row(0);

            rollout.push(json!({
                "step": i + 1,
                "qpos": row[o.qpos..o.qpos + nq].to_vec(),
                "qvel": row[o.qvel..o.qvel + nv].to_vec(),
            }));
        }
    }

    Ok(json!({ "backend": "metal", "device": batch.device(), "single": first, "rollout": rollout }))
}

fn start_row(model: &Model, plan: &Plan, world: usize, out: &mut [f64]) {
    let mut data = Data::new(model);

    data.qpos().copy_from_slice(&start_pose(plan, world));
    data.get_state(model, out, forge_mujoco::integration_state());
}

fn bits(batch: &mut MetalBatch, sim: usize) -> Vec<u64> {
    let o = batch.offsets();
    let nv = batch.plan().kernel.nv;
    let row = batch.row(sim);

    row[o.qpos..o.qvel]
        .iter()
        .chain(&row[o.qvel..o.qvel + nv])
        .chain(&row[o.warm..o.warm + nv])
        .map(|v| v.to_bits())
        .collect()
}

fn run(model: &Model, batch: &mut MetalBatch, worlds: &[usize]) -> Result<(), String> {
    let plan = batch.plan().kernel.clone();
    let plan = Plan::new(plan);
    let o = batch.offsets();

    for (sim, &w) in worlds.iter().enumerate() {
        start_row(model, &plan, w, batch.row(sim));
    }

    for round in 0..ROUNDS {
        for (sim, &w) in worlds.iter().enumerate() {
            let ctrl = controls(&plan, w, round);

            batch.row(sim)[o.ctrl..o.ctrl + ctrl.len()].copy_from_slice(&ctrl);
        }

        if batch.step(DECIMATION) > 0 {
            return Err(batch.first_error().unwrap_or_default());
        }
    }

    Ok(())
}

pub fn identity(args: &Args) -> Result<Value, String> {
    let (model, kernel) = forge_ir::load(&args.xml).map_err(|r| r.to_string())?;
    let mut alone = MetalBatch::new(&model, kernel.clone(), 1)?;
    let mut singles = Vec::with_capacity(WORLDS);

    for w in 0..WORLDS {
        run(&model, &mut alone, &[w])?;
        singles.push(bits(&mut alone, 0));
    }

    let mut mismatches = Vec::new();
    let mut together = MetalBatch::new(&model, kernel.clone(), WORLDS)?;

    run(&model, &mut together, &(0..WORLDS).collect::<Vec<_>>())?;

    for (w, s) in singles.iter().enumerate() {
        if &bits(&mut together, w) != s {
            mismatches.push(format!("world {w} in a batch of {WORLDS}"));
        }
    }

    let mut crowd = MetalBatch::new(&model, kernel, CROWD)?;
    let order: Vec<usize> = (0..CROWD).map(|s| (s * 7 + 3) % CROWD).collect();

    run(&model, &mut crowd, &order)?;

    for (sim, &w) in order.iter().enumerate() {
        if w < WORLDS && bits(&mut crowd, sim) != singles[w] {
            mismatches.push(format!("world {w} in a crowd of {CROWD}"));
        }
    }

    Ok(json!({
        "identical": mismatches.is_empty(),
        "backend": "metal",
        "worlds": WORLDS,
        "crowd": CROWD,
        "steps": ROUNDS * DECIMATION,
        "mismatches": mismatches,
    }))
}
