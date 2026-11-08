use forge_mujoco::Data;
use forge_sim::MetalBatch;
use std::path::Path;

const STAGES: [&str; 9] = [
    "kinematics+com_pos",
    "crb+factor_m",
    "collide+assemble",
    "rne+actuation+smooth",
    "warmstart",
    "start",
    "hessian",
    "iterate",
    "implicit",
];
const SUBSTEPS: usize = 10;

fn wave(world: usize, actuator: usize, round: usize, range: Option<[f64; 2]>) -> f64 {
    let phase = (world * 7 + actuator * 13) as f64 * 0.37;
    let w = (round as f64 * 0.02 * (1.5 + 0.1 * (world % 5) as f64) * std::f64::consts::TAU + phase).sin();

    range.map_or(0.3 * w, |[lo, hi]| {
        0.5 * (lo + hi) + 0.05 * (world % 4) as f64 * (hi - lo) * w
    })
}

fn settle(model: &forge_mujoco::Model, batch: &mut MetalBatch, envs: usize) {
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

        batch.step(SUBSTEPS);
    }
}

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let xml = args.get(1).ok_or("Usage: metal_stages <model.xml> [envs]")?;
    let envs = args.get(2).and_then(|e| e.parse().ok()).unwrap_or(4096);
    let (model, kernel) = forge_ir::load(Path::new(xml)).map_err(|r| r.to_string())?;
    let mut batch = MetalBatch::new(&model, kernel, envs)?;

    settle(&model, &mut batch, envs);

    if args.get(3).is_some() {
        let mut runs: Vec<f64> = (0..15)
            .map(|_| batch.profile(SUBSTEPS, STAGES.len()))
            .collect::<Result<Vec<_>, _>>()?;

        runs.sort_by(f64::total_cmp);
        println!(
            "total min {:.3} ms median {:.3} ms per substep",
            runs[0] * 1e3 / SUBSTEPS as f64,
            runs[7] * 1e3 / SUBSTEPS as f64
        );

        return Ok(());
    }

    let mut last = 0.0;
    let work: f64 = (0..envs).map(|w| batch.work(w)).sum::<f64>() / (envs * SUBSTEPS) as f64;
    let contacts: f64 = (0..envs).map(|w| batch.contacts(w)).sum::<f64>() / envs as f64;

    println!("{contacts:.2} contacts and {work:.2} Newton iterations per world-substep");
    let mut sums = [0.0; 3];
    for w in 0..envs {
        let v = batch.work(w) as u64;
        sums[0] += (v / 1_000_000) as f64;
        sums[1] += ((v / 1000) % 1000) as f64;
        sums[2] += (v % 1000) as f64;
    }
    let mut its: Vec<(f64, f64, f64)> = (0..envs).map(|w| { let v = batch.work(w) as u64; (batch.contacts(w), (v % 1000) as f64, ((v / 1000) % 1000) as f64) }).collect();
    its.sort_by(|a, b| (b.0 * 1000.0 + b.1).total_cmp(&(a.0 * 1000.0 + a.1)));
    let gmax: f64 = its.chunks(32).map(|c| c.iter().map(|x| x.1).fold(0.0, f64::max)).sum::<f64>() * 32.0 / (envs * SUBSTEPS) as f64;
    let emax: f64 = its.chunks(32).map(|c| c.iter().map(|x| x.2).fold(0.0, f64::max)).sum::<f64>() * 32.0 / (envs * SUBSTEPS) as f64;
    println!("group max iterations {gmax:.2} evals {emax:.2}");
    println!("factors {:.2} evals {:.2} iterations {:.2}", sums[0] / (envs * SUBSTEPS) as f64, sums[1] / (envs * SUBSTEPS) as f64, sums[2] / (envs * SUBSTEPS) as f64);

    println!("{} envs on {}, GPU time per substep", envs, batch.device());

    for (i, name) in STAGES.iter().enumerate() {
        let best = (0..3)
            .map(|_| batch.profile(SUBSTEPS, i + 1))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .fold(f64::INFINITY, f64::min)
            / SUBSTEPS as f64;

        println!("{name:>22}: {:7.3} ms  (cumulative {:7.3} ms)", (best - last) * 1e3, best * 1e3);
        last = best;
    }

    println!("substeps/s at this cost: {:.0}", envs as f64 / last);
    Ok(())
}
