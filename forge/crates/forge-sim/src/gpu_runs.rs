use crate::args::Args;
use crate::drive::{controls, start_pose, DECIMATION};
use crate::parity::{rollout_ctrl, single, REPORT_EVERY};
use forge_ir::Kernel;
use forge_mujoco::{Data, Model};
use forge_sim::{MetalBatch, Offsets, Plan, Snapshot, WgslBatch};
use serde_json::{json, Value};

const WORLDS: usize = 37;
const CROWD: usize = 300;
const ROUNDS: usize = 40;

pub trait GpuRows: Sized {
    const NAME: &'static str;

    fn open(model: &Model, kernel: Kernel, nsim: usize) -> Result<Self, String>;
    fn device(&self) -> String;
    fn plan(&self) -> &Plan;
    fn offsets(&self) -> Offsets;
    fn row(&mut self, sim: usize) -> &mut [f64];
    fn advance(&mut self, nstep: usize) -> usize;
    fn error(&self) -> Option<String>;
    fn fields(&mut self, sim: usize, names: &[&str]) -> Result<(Vec<Vec<f64>>, usize), String>;
}

macro_rules! gpu_rows {
    ($batch:ty, $name:literal) => {
        impl GpuRows for $batch {
            const NAME: &'static str = $name;

            fn open(model: &Model, kernel: Kernel, nsim: usize) -> Result<Self, String> {
                <$batch>::new(model, kernel, nsim)
            }

            fn device(&self) -> String {
                <$batch>::device(self)
            }

            fn plan(&self) -> &Plan {
                <$batch>::plan(self)
            }

            fn offsets(&self) -> Offsets {
                <$batch>::offsets(self)
            }

            fn row(&mut self, sim: usize) -> &mut [f64] {
                <$batch>::row(self, sim)
            }

            fn advance(&mut self, nstep: usize) -> usize {
                <$batch>::step(self, nstep)
            }

            fn error(&self) -> Option<String> {
                <$batch>::first_error(self)
            }

            fn fields(&mut self, sim: usize, names: &[&str]) -> Result<(Vec<Vec<f64>>, usize), String> {
                <$batch>::forward_fields(self, sim, names)
            }
        }
    };
}

gpu_rows!(MetalBatch, "metal");
gpu_rows!(WgslBatch, "wgpu");

pub fn parity<B: GpuRows>(args: &Args) -> Result<Value, String> {
    let (model, kernel) = forge_ir::load(&args.xml).map_err(|r| r.to_string())?;
    let nu = kernel.nu;
    let mut batch = B::open(&model, kernel, 1)?;
    let o = batch.offsets();
    let (fields, ncon) = batch.fields(0, &["XPOS", "CINERT", "QBIAS", "QACC"])?;
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

        if batch.advance(1) > 0 {
            return Err(batch.error().unwrap_or_default());
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

    Ok(json!({ "backend": B::NAME, "device": batch.device(), "single": first, "rollout": rollout }))
}

fn start_row(model: &Model, plan: &Plan, world: usize, out: &mut [f64]) {
    let mut data = Data::new(model);

    data.qpos().copy_from_slice(&start_pose(plan, world));
    data.get_state(model, out, forge_mujoco::integration_state());
}

fn bits<B: GpuRows>(batch: &mut B, sim: usize) -> Vec<u64> {
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

fn run<B: GpuRows>(model: &Model, batch: &mut B, worlds: &[usize]) -> Result<(), String> {
    let plan = Plan::new(batch.plan().kernel.clone());
    let o = batch.offsets();

    for (sim, &w) in worlds.iter().enumerate() {
        start_row(model, &plan, w, batch.row(sim));
    }

    for round in 0..ROUNDS {
        for (sim, &w) in worlds.iter().enumerate() {
            let ctrl = controls(&plan, w, round);

            batch.row(sim)[o.ctrl..o.ctrl + ctrl.len()].copy_from_slice(&ctrl);
        }

        if batch.advance(DECIMATION) > 0 {
            return Err(batch.error().unwrap_or_default());
        }
    }

    Ok(())
}

pub fn identity<B: GpuRows>(args: &Args) -> Result<Value, String> {
    let (model, kernel) = forge_ir::load(&args.xml).map_err(|r| r.to_string())?;
    let mut alone = B::open(&model, kernel.clone(), 1)?;
    let mut singles = Vec::with_capacity(WORLDS);

    for w in 0..WORLDS {
        run(&model, &mut alone, &[w])?;
        singles.push(bits(&mut alone, 0));
    }

    let mut mismatches = Vec::new();
    let mut together = B::open(&model, kernel.clone(), WORLDS)?;

    run(&model, &mut together, &(0..WORLDS).collect::<Vec<_>>())?;

    for (w, s) in singles.iter().enumerate() {
        if &bits(&mut together, w) != s {
            mismatches.push(format!("world {w} in a batch of {WORLDS}"));
        }
    }

    let mut crowd = B::open(&model, kernel, CROWD)?;
    let order: Vec<usize> = (0..CROWD).map(|s| (s * 7 + 3) % CROWD).collect();

    run(&model, &mut crowd, &order)?;

    for (sim, &w) in order.iter().enumerate() {
        if w < WORLDS && bits(&mut crowd, sim) != singles[w] {
            mismatches.push(format!("world {w} in a crowd of {CROWD}"));
        }
    }

    Ok(json!({
        "identical": mismatches.is_empty(),
        "backend": B::NAME,
        "worlds": WORLDS,
        "crowd": CROWD,
        "steps": ROUNDS * DECIMATION,
        "mismatches": mismatches,
    }))
}
