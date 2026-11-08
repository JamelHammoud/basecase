use forge_sim::lanes::LANES;
use forge_sim::{actuation, collide, constraint, inertia, integrate, kinematics, newton, velocity};
use forge_sim::{Plan, State, Workspace};
use std::path::Path;
use std::time::Instant;

const STAGES: [&str; 12] = [
    "kinematics",
    "com_pos",
    "crb",
    "factor_m",
    "collide",
    "assemble",
    "com_vel+passive",
    "rne",
    "actuation",
    "smooth",
    "newton",
    "implicit",
];

fn wave(world: usize, actuator: usize, round: usize, range: Option<[f64; 2]>) -> f64 {
    let phase = (world * 7 + actuator * 13) as f64 * 0.37;
    let w = (round as f64 * 0.02 * (1.5 + 0.1 * (world % 5) as f64) * std::f64::consts::TAU + phase).sin();

    range.map_or(0.3 * w, |[lo, hi]| {
        0.5 * (lo + hi) + 0.05 * (world % 4) as f64 * (hi - lo) * w
    })
}

fn start_pose(plan: &Plan, world: usize) -> Vec<f64> {
    let mut qpos = plan.kernel.qpos0.clone();

    for (j, joint) in plan.kernel.joints.iter().enumerate().skip(1) {
        qpos[joint.qposadr] += 0.02 * ((world * 31 + j * 17) as f64).sin();
    }

    qpos
}

fn timed(t: &mut [f64; 12], stage: usize, f: impl FnOnce()) {
    let start = Instant::now();

    f();
    t[stage] += start.elapsed().as_secs_f64();
}

fn step(plan: &Plan, state: &mut State, w: &mut Workspace, t: &mut [f64; 12]) {
    state.swap(&mut w.block);

    let b = &mut w.block;

    timed(t, 0, || kinematics::kinematics(plan, b));
    timed(t, 1, || kinematics::com_pos(plan, b));
    timed(t, 2, || inertia::crb(plan, b));
    timed(t, 3, || inertia::factor_m(plan, b));
    timed(t, 4, || collide::collide(plan, b));
    timed(t, 5, || constraint::assemble(plan, b, &mut w.points));
    timed(t, 6, || {
        velocity::com_vel(plan, b);
        velocity::passive(plan, b);
    });
    timed(t, 7, || velocity::rne(plan, b, &mut w.cacc, &mut w.cfrc));
    timed(t, 8, || actuation::actuation(plan, b, &mut w.ctrl));
    timed(t, 9, || {
        for i in 0..plan.kernel.nv {
            b.qfrc_smooth[i] = b.qfrc_passive[i] - b.qfrc_bias[i] + b.qfrc_actuator[i];
        }

        b.qacc_smooth.copy_from_slice(&b.qfrc_smooth);
        inertia::solve(plan, &b.ld, &b.ld_inv, &mut b.qacc_smooth);
    });
    timed(t, 10, || newton::solve_constraints(plan, b, &mut w.solver));
    timed(t, 11, || integrate::implicit_step(plan, b, &mut w.implicit));
    state.swap(&mut w.block);
}

fn report(t: &[f64; 12], steps: usize, contacts: f64, w: &Workspace) {
    let total: f64 = t.iter().sum();

    println!(
        "{steps} world-steps, {:.3} us per world-step, {:.0} world-steps/s, {:.2} contacts per world",
        total / steps as f64 * 1e6,
        steps as f64 / total,
        contacts / steps as f64
    );

    for (name, s) in STAGES.iter().zip(t) {
        println!(
            "{name:>16} {:7.3} us/world-step {:5.1}%",
            s / steps as f64 * 1e6,
            s / total * 100.0
        );
    }

    let st = w.solver.stats;

    println!(
        "solver: {} solves, {:.2} hessians and {:.2} iterations per solve",
        st.solves,
        st.hessians as f64 / st.solves.max(1) as f64,
        st.iterations as f64 / st.solves.max(1) as f64
    );
}

fn main() {
    let path = std::env::args().nth(1).expect("model path");
    let rounds: usize = std::env::args().nth(2).and_then(|s| s.parse().ok()).unwrap_or(200);
    let (_, kernel) = forge_ir::load(Path::new(&path)).expect("model in the subset");
    let plan = Plan::new(kernel);
    let mut states: Vec<State> = (0..64).map(|_| State::new(&plan)).collect();
    let mut w = Workspace::new(&plan);
    let mut t = [0.0; 12];
    let (mut steps, mut contacts) = (0, 0.0);

    for round in 0..rounds {
        for (bi, s) in states.iter_mut().enumerate() {
            for lane in 0..LANES {
                let world = if std::env::var("SORTED").is_ok() {
                    lane * 64 + bi
                } else {
                    bi * LANES + lane
                };

                if round % 100 == 0 {
                    s.reset(&plan, lane, &start_pose(&plan, world));
                }

                let ctrl: Vec<f64> = plan
                    .kernel
                    .actuators
                    .iter()
                    .enumerate()
                    .map(|(a, act)| wave(world, a, round, act.ctrl_range))
                    .collect();

                s.set_ctrl(lane, &ctrl);
            }

            for _ in 0..10 {
                step(&plan, s, &mut w, &mut t);
                steps += LANES;
                contacts += w.block.ncon.0.iter().sum::<f64>();
            }
        }
    }

    report(&t, steps, contacts, &w);
}
