use forge_mujoco::{Data, Model};
use forge_sim::MetalBatch;
use std::path::Path;

const STAGES: [&str; 9] = [
    "kinematics+com_pos",
    "crb+factor_m",
    "collide+assemble",
    "rne+actuation+smooth",
    "warmstart",
    "start",
    "first hessian",
    "newton iterations",
    "implicit",
];
const SUBSTEPS: usize = 10;
const RUNS: usize = 15;

fn wave(world: usize, actuator: usize, round: usize, range: Option<[f64; 2]>) -> f64 {
    let phase = (world * 7 + actuator * 13) as f64 * 0.37;
    let w = (round as f64 * 0.02 * (1.5 + 0.1 * (world % 5) as f64) * std::f64::consts::TAU + phase).sin();

    range.map_or(0.3 * w, |[lo, hi]| {
        0.5 * (lo + hi) + 0.05 * (world % 4) as f64 * (hi - lo) * w
    })
}

fn settle(model: &Model, batch: &mut MetalBatch, envs: usize) -> Result<(), String> {
    let o = batch.offsets();
    let kernel = batch.plan().kernel.clone();

    for w in 0..envs {
        let mut data = Data::new(model);
        let qpos = data.qpos();

        for (j, joint) in kernel.joints.iter().enumerate().skip(1) {
            qpos[joint.qposadr] += 0.02 * ((w * 31 + j * 17) as f64).sin();
        }

        data.get_state(model, batch.row(w), forge_mujoco::integration_state());
    }

    for round in 0..20 {
        for w in 0..envs {
            for (a, act) in kernel.actuators.iter().enumerate() {
                batch.row(w)[o.ctrl + a] = wave(w, a, round, act.ctrl_range);
            }
        }

        if batch.step(SUBSTEPS) > 0 {
            return Err(batch.first_error().unwrap_or_default());
        }
    }

    Ok(())
}

fn per_substep(batch: &mut MetalBatch, upto: usize) -> Result<Vec<f64>, String> {
    let mut runs = (0..RUNS)
        .map(|_| batch.profile(SUBSTEPS, upto).map(|s| s * 1e3 / SUBSTEPS as f64))
        .collect::<Result<Vec<_>, _>>()?;

    runs.sort_by(f64::total_cmp);
    Ok(runs)
}

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let xml = args.get(1).ok_or("Usage: metal_stages <model.xml> [envs] [total]")?;
    let envs = args.get(2).and_then(|e| e.parse().ok()).unwrap_or(4096);
    let (model, kernel) = forge_ir::load(Path::new(xml)).map_err(|r| r.to_string())?;
    let mut batch = MetalBatch::new(&model, kernel, envs)?;

    settle(&model, &mut batch, envs)?;

    if args.get(3).is_some() {
        let runs = per_substep(&mut batch, STAGES.len())?;

        println!(
            "total min {:.3} ms median {:.3} ms per substep",
            runs[0],
            runs[RUNS / 2]
        );
        return Ok(());
    }

    let iterations = (0..envs).map(|w| batch.work(w)).sum::<f64>() / (envs * SUBSTEPS) as f64;
    let contacts = (0..envs).map(|w| batch.contacts(w)).sum::<f64>() / envs as f64;
    let mut last = 0.0;

    println!("{envs} envs on {}, GPU time per substep", batch.device());
    println!("{contacts:.2} contacts and {iterations:.2} Newton iterations per world-substep");

    for (i, name) in STAGES.iter().enumerate() {
        let best = per_substep(&mut batch, i + 1)?[0];

        println!("{name:>22}: {:7.3} ms  (cumulative {best:7.3} ms)", best - last);
        last = best;
    }

    println!("substeps/s at this cost: {:.0}", envs as f64 * 1e3 / last);
    Ok(())
}
