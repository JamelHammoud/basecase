use crate::args::Args;
use crate::drive::{controls, start_pose, DECIMATION, EPISODE_ROUNDS};
use crate::meter::{Meter, Windows};
use forge_mujoco::{Batch, Data, Model};
use forge_sim::Plan;
use std::sync::atomic::{AtomicBool, Ordering};

fn start_rows(model: &Model, plan: &Plan, envs: usize) -> Vec<Vec<f64>> {
    let signature = forge_mujoco::integration_state();

    (0..envs)
        .map(|w| {
            let mut data = Data::new(model);
            let pose = start_pose(plan, w);

            data.qpos().copy_from_slice(&pose);

            let mut row = vec![0.0; model.state_size(signature)];

            data.get_state(model, &mut row, signature);
            row
        })
        .collect()
}

fn round(batch: &mut Batch, plan: &Plan, starts: &[Vec<f64>], r: usize) {
    let layout = batch.layout();
    let nu = plan.kernel.nu;

    for (w, start) in starts.iter().enumerate() {
        let row = batch.row(w);

        if r.is_multiple_of(EPISODE_ROUNDS) {
            row.copy_from_slice(start);
        }

        row[layout.ctrl..layout.ctrl + nu].copy_from_slice(&controls(plan, w, r));
    }

    batch.step(DECIMATION);
}

pub fn run(args: &Args, threads: usize) -> Result<Windows, String> {
    let (model, kernel) = forge_ir::load(&args.xml).map_err(|r| r.to_string())?;
    let plan = Plan::new(kernel);
    let starts = start_rows(&model, &plan, args.envs);
    let mut batch = Batch::new(&model, args.envs, threads)?;
    let meter = Meter::default();
    let stop = AtomicBool::new(false);

    Ok(std::thread::scope(|scope| {
        scope.spawn(|| {
            let mut r = 0;

            while !stop.load(Ordering::SeqCst) {
                round(&mut batch, &plan, &starts, r);
                meter.add(args.envs * DECIMATION);
                r += 1;
            }
        });

        let windows = meter.watch(args.seconds);

        stop.store(true, Ordering::SeqCst);
        windows
    }))
}
