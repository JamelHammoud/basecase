use forge_sim::grad::{step_with_jacobian, Spec, Wrt};
use forge_sim::lanes::LANES;
use forge_sim::{Plan, State, Workspace};
use std::time::Instant;

fn main() {
    let path = std::env::args().nth(1).expect("usage: grad_bench <model.xml>");
    let (_, kernel) = forge_ir::load(std::path::Path::new(&path)).expect("the model is in Forge's subset");
    let plan = Plan::new(kernel);
    let k = &plan.kernel;
    let wrt: Vec<Wrt> = (0..k.nq)
        .map(Wrt::Qpos)
        .chain((0..k.nv).map(Wrt::Qvel))
        .chain((0..k.nu).map(Wrt::Ctrl))
        .collect();
    let mut state = State::new(&plan);
    let mut w = Workspace::new(&plan);
    let rounds = 50;

    for _ in 0..rounds {
        forge_sim::step(&plan, &mut state, &mut w);
    }

    let started = Instant::now();

    for _ in 0..rounds {
        let spec = Spec {
            wrt: &wrt,
            substeps: 10,
            smoothing: forge_sim::grad::Smooth { force: 0.05 },
            lanes: LANES,
        };

        step_with_jacobian(&plan, &mut state, &mut w, &spec).expect("steps");
    }

    let per = started.elapsed().as_secs_f64() / (rounds * LANES) as f64;

    println!(
        "{} directions: {:.2} ms per robot per control step on one thread",
        wrt.len(),
        per * 1e3
    );
}
