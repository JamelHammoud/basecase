#![cfg(target_os = "macos")]

mod gradcommon;

use forge_sim::grad::{Smooth, Tracer, Wrt, WIDTH};
use forge_sim::lanes::LANES;
use forge_sim::{Plan, State, Workspace};
use gradcommon::{all_directions, fixture_path, perturb, read_lane, step_size, ROBOTS};

const CONTROL_STEPS: usize = 200;
const SUBSTEPS: usize = 10;
const BOUND: f64 = 0.01;

fn hoisted(robot: &str) -> Plan {
    let xml = std::fs::read_to_string(fixture_path(robot)).expect("the fixture");
    let lifted = xml.replace(r#"<freejoint name="root_0"/>"#, "").replace(
        r#"<geom name="floor" type="plane""#,
        r#"<geom name="floor" type="plane" pos="0 0 -2""#,
    );

    assert_ne!(lifted, xml, "the fixture's root changed shape");

    let path = std::env::temp_dir().join(format!("forge-hoisted-{robot}-{}.xml", std::process::id()));

    std::fs::write(&path, lifted).expect("write the hoisted robot");

    let model = forge_mujoco::Model::load(&path).expect("the hoisted robot compiles");

    Plan::new(forge_ir::lower(&model).expect("the hoisted robot is in Forge's subset"))
}

fn ctrl(plan: &Plan, step: usize) -> Vec<f64> {
    let t = step as f64 * 0.02;

    plan.kernel
        .actuators
        .iter()
        .enumerate()
        .map(|(a, act)| {
            let reach = act.ctrl_range.map_or(0.5, |r| 0.3 * r[1].min(-r[0]));

            reach * (std::f64::consts::TAU * (0.3 + 0.07 * a as f64) * t).sin()
        })
        .collect()
}

fn drive(plan: &Plan, state: &mut State, step: usize) {
    for lane in 0..LANES {
        state.set_ctrl(lane, &ctrl(plan, step));
    }
}

fn rollout(plan: &Plan, mut state: State) -> Vec<f64> {
    let mut w = Workspace::new(plan);

    for step in 0..CONTROL_STEPS {
        drive(plan, &mut state, step);

        for _ in 0..SUBSTEPS {
            forge_sim::step(plan, &mut state, &mut w);
        }
    }

    read_lane(&state, 0)
}

fn traced(plan: &Plan, chunk: &[Wrt]) -> Vec<Vec<f64>> {
    let mut state = State::new(plan);
    let mut w = Workspace::new(plan);
    let mut tracer = Tracer::new(&state, 1, chunk);

    for step in 0..CONTROL_STEPS {
        drive(plan, &mut state, step);
        tracer
            .advance(plan, &mut state, (&mut w, SUBSTEPS, Smooth::EXACT))
            .expect("traces");
    }

    (0..chunk.len())
        .map(|c| {
            (0..plan.kernel.nq)
                .map(|i| tracer.qpos(0, i)[c])
                .chain((0..plan.kernel.nv).map(|i| tracer.qvel(0, i)[c]))
                .collect()
        })
        .collect()
}

fn norm(v: &[f64]) -> f64 {
    v.iter().map(|a| a * a).sum::<f64>().sqrt()
}

fn worst_error(plan: &Plan, wrt: &[Wrt]) -> f64 {
    let start = State::new(plan);
    let mut pairs = Vec::new();

    for chunk in wrt.chunks(WIDTH) {
        for (w, analytic) in chunk.iter().zip(traced(plan, chunk)) {
            let h = step_size(&start, 0, *w);
            let (mut plus, mut minus) = (start.clone(), start.clone());

            perturb(&mut plus, 0, *w, h);
            perturb(&mut minus, 0, *w, -h);

            let (p, m) = (rollout(plan, plus), rollout(plan, minus));
            let fd: Vec<f64> = p.iter().zip(&m).map(|(a, b)| (a - b) / (2.0 * h)).collect();
            let diff: Vec<f64> = fd.iter().zip(&analytic).map(|(a, b)| a - b).collect();

            pairs.push((norm(&fd), norm(&diff)));
        }
    }

    let mut norms: Vec<f64> = pairs.iter().map(|p| p.0).collect();

    norms.sort_by(f64::total_cmp);

    let floor = 1e-3 * norms[norms.len() / 2];

    pairs.iter().map(|(n, d)| d / n.max(floor)).fold(0.0, f64::max)
}

#[test]
fn gradient_matches_fd_along_a_trajectory() {
    for robot in ROBOTS {
        let plan = hoisted(robot);
        let wrt: Vec<Wrt> = all_directions(&plan.kernel, true)
            .into_iter()
            .filter(|w| !matches!(w, Wrt::Qpos(_) | Wrt::Qvel(_) | Wrt::Ctrl(_)))
            .collect();
        let worst = worst_error(&plan, &wrt);

        eprintln!(
            "{robot}: {} parameter sensitivities over {CONTROL_STEPS} control steps, worst {worst:.2e}",
            wrt.len()
        );
        assert!(worst <= BOUND, "{robot}: a sensitivity is off by {:.2}%", worst * 100.0);
    }
}
