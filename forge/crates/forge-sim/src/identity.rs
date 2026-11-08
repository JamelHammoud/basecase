use crate::args::{Args, Backend};
use crate::drive::{controls, start_pose, DECIMATION};
use forge_ir::Kernel;
use forge_sim::{Sim, Snapshot};
use serde_json::{json, Value};

const WORLDS: usize = 37;
const ROUNDS: usize = 40;
const THREADS: [usize; 3] = [1, 3, 8];

fn prepare(kernel: &Kernel, worlds: usize, first: usize) -> Sim {
    let mut sim = Sim::new(kernel.clone(), worlds);

    for w in 0..worlds {
        let pose = start_pose(&sim.plan, first + w);

        sim.reset(w, &pose);
    }

    sim
}

fn run_batch(kernel: &Kernel, threads: usize) -> Vec<Snapshot> {
    let mut sim = prepare(kernel, WORLDS, 0);
    let mut spaces: Vec<_> = (0..threads).map(|_| sim.workspace()).collect();

    for round in 0..ROUNDS {
        for w in 0..WORLDS {
            let ctrl = controls(&sim.plan, w, round);

            sim.set_ctrl(w, &ctrl);
        }

        for _ in 0..DECIMATION {
            sim.step_parallel(&mut spaces);
        }
    }

    (0..WORLDS).map(|w| sim.state(w)).collect()
}

fn run_single(kernel: &Kernel, world: usize) -> Snapshot {
    let mut sim = prepare(kernel, 1, world);

    for round in 0..ROUNDS {
        let ctrl = controls(&sim.plan, world, round);

        sim.set_ctrl(0, &ctrl);

        for _ in 0..DECIMATION {
            sim.step();
        }
    }

    sim.state(0)
}

fn bits(s: &Snapshot) -> Vec<u64> {
    s.qpos
        .iter()
        .chain(&s.qvel)
        .chain(&s.qacc)
        .map(|v| v.to_bits())
        .collect()
}

pub fn run(args: &Args) -> Result<Value, String> {
    if args.backend != Backend::Simd {
        return Err("Batch identity checks the simd backend".into());
    }

    let (_, kernel) = forge_ir::load(&args.xml).map_err(|r| r.to_string())?;
    let singles: Vec<Snapshot> = (0..WORLDS).map(|w| run_single(&kernel, w)).collect();
    let mut mismatches = Vec::new();

    for threads in THREADS {
        let batch = run_batch(&kernel, threads);

        for (w, (s, b)) in singles.iter().zip(&batch).enumerate() {
            if bits(s) != bits(b) {
                mismatches.push(format!("world {w} at {threads} threads"));
            }
        }
    }

    let contacts: usize = singles.iter().map(|s| s.ncon).sum();

    Ok(json!({
        "identical": mismatches.is_empty(),
        "worlds": WORLDS,
        "steps": ROUNDS * DECIMATION,
        "lanes": forge_sim::lanes::LANES,
        "threads": THREADS,
        "contactsAtEnd": contacts,
        "mismatches": mismatches,
    }))
}
