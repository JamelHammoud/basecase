#![cfg(target_os = "macos")]

mod gradcommon;

use forge_sim::grad::{step_with_jacobian, surrogate, Jacobian, Smooth, Spec, Wrt};
use forge_sim::lanes::LANES;
use forge_sim::{Plan, State, Workspace};
use gradcommon::{
    all_directions, column_errors, exact_steps, finite_differences, fixture, joint_sample, load, quantiles, read_lane,
    worst, Fd, Rng, ROBOTS,
};

const OFF_CONTACT_BLOCKS: usize = 4;
const ON_CONTACT_STATES: usize = 16;
const CONTROL_SUBSTEPS: usize = 10;
const OFF_CONTACT_BOUND: f64 = 0.01;
const ON_CONTACT_BOUND: f64 = 0.10;
const SMOOTHING: Smooth = Smooth { force: 0.05 };
const SOLVER_TOLERANCE: f64 = 1e-12;

fn explicitly_named(test: &str) -> bool {
    std::env::args().any(|arg| arg == test)
}

fn plan(robot: &str) -> Plan {
    let (_, mut kernel) = fixture(robot);

    kernel.options.tolerance = SOLVER_TOLERANCE;
    Plan::new(kernel)
}

fn contacts(plan: &Plan, state: &State, w: &mut Workspace) -> [f64; LANES] {
    let mut probe = state.clone();

    forge_sim::forward(plan, &mut probe, w);
    w.block.ncon.0
}

fn airborne_block(plan: &Plan, rng: &mut Rng, w: &mut Workspace) -> State {
    let mut state = State::new(plan);

    for lane in 0..LANES {
        load(plan, &mut state, lane, &joint_sample(&plan.kernel, rng, (1.0, 0.05)));
    }

    assert_eq!(
        contacts(plan, &state, w),
        [0.0; LANES],
        "airborne samples must be off contact"
    );
    state
}

#[derive(Default)]
struct Errors {
    worst: Vec<f64>,
    kinks: usize,
    columns: usize,
}

impl Errors {
    fn check(&mut self, analytic: &Jacobian, fd: &Fd, bound: f64) -> Result<(), String> {
        let columns = column_errors(analytic, fd, bound);
        let w = worst(&columns);

        self.worst.push(w);
        self.kinks += columns.iter().filter(|c| c.kink).count();
        self.columns += columns.len();

        match columns.iter().position(|c| c.error > bound) {
            Some(at) => {
                for r in 0..analytic.rows {
                    let (a, c, f, b) = (
                        analytic.at(r, at),
                        fd.central.at(r, at),
                        fd.forward.at(r, at),
                        fd.backward.at(r, at),
                    );

                    if (a - c).abs() > 1e-3 * c.abs().max(1e-3) {
                        eprintln!("row {r}: analytic {a:.6e} central {c:.6e} forward {f:.6e} backward {b:.6e}");
                    }
                }

                Err(format!("column {at} is off by {:.2}%", columns[at].error * 100.0))
            }
            None => Ok(()),
        }
    }

    fn report(&mut self) -> String {
        format!(
            "{}; {} of {} columns straddle a kink and are judged one-sided",
            quantiles(&mut self.worst),
            self.kinks,
            self.columns
        )
    }
}

fn fd_lane(plan: &Plan, state: &State, wrt: &[Wrt], (lane, substeps): (usize, usize)) -> Fd {
    let mut w = Workspace::new(plan);

    finite_differences(state, lane, wrt, exact_steps(plan, &mut w, (lane, substeps)))
}

fn off_contact(robot: &str, plant: impl Fn(&mut Jacobian)) -> Result<Errors, String> {
    let plan = plan(robot);
    let wrt = all_directions(&plan.kernel, true);
    let mut w = Workspace::new(&plan);
    let mut rng = Rng::new(0xF7 + robot.len() as u64);
    let mut errors = Errors::default();

    for _ in 0..OFF_CONTACT_BLOCKS {
        let start = airborne_block(&plan, &mut rng, &mut w);
        let spec = Spec {
            wrt: &wrt,
            substeps: CONTROL_SUBSTEPS,
            smoothing: SMOOTHING,
            lanes: LANES,
        };
        let mut analytic = step_with_jacobian(&plan, &mut start.clone(), &mut w, &spec)?;

        analytic.iter_mut().for_each(&plant);

        for (lane, a) in analytic.iter().enumerate() {
            let fd = fd_lane(&plan, &start, &wrt, (lane, CONTROL_SUBSTEPS));

            errors
                .check(a, &fd, OFF_CONTACT_BOUND)
                .map_err(|e| format!("{robot}, {} inputs, lane {lane}: {e}", wrt.len()))?;
        }
    }

    Ok(errors)
}

fn walking_block(plan: &Plan, rng: &mut Rng, w: &mut Workspace) -> State {
    let k = &plan.kernel;
    let mut state = State::new(plan);

    for lane in 0..LANES {
        let mut sample = joint_sample(k, rng, (0.0, 0.0));

        sample.qpos = k.qpos0.clone();
        sample.qvel.iter_mut().for_each(|v| *v *= 0.1);

        for j in k.joints.iter().filter(|j| j.limit.is_some()) {
            sample.qpos[j.qposadr] += rng.uniform(-0.15, 0.15);
        }

        load(plan, &mut state, lane, &sample);
    }

    for _ in 0..10 + rng.next() % 40 {
        for lane in 0..LANES {
            let ctrl: Vec<f64> = k
                .actuators
                .iter()
                .map(|a| a.ctrl_range.map_or(0.0, |r| 0.4 * rng.uniform(r[0], r[1])))
                .collect();

            state.set_ctrl(lane, &ctrl);
        }

        for _ in 0..CONTROL_SUBSTEPS {
            forge_sim::step(plan, &mut state, w);
        }
    }

    state
}

fn surrogate_lane(plan: &Plan, state: &State, wrt: &[Wrt], lane: usize) -> Fd {
    let mut w = Workspace::new(plan);

    finite_differences(state, lane, wrt, |s| {
        let next = surrogate(plan, s, &mut w, (lane, SMOOTHING)).expect("the surrogate steps");

        next.qpos.iter().chain(&next.qvel).copied().collect()
    })
}

fn on_contact(robot: &str) -> Result<(Errors, Errors), String> {
    let plan = plan(robot);
    let wrt = all_directions(&plan.kernel, true);
    let mut w = Workspace::new(&plan);
    let mut rng = Rng::new(0xC0 + robot.len() as u64);
    let (mut smoothed_errors, mut exact_errors) = (Errors::default(), Errors::default());

    while smoothed_errors.worst.len() < ON_CONTACT_STATES {
        let start = walking_block(&plan, &mut rng, &mut w);
        let touching = contacts(&plan, &start, &mut w);
        let spec = |smoothing| Spec {
            wrt: &wrt,
            substeps: 1,
            smoothing,
            lanes: LANES,
        };
        let smoothed = step_with_jacobian(&plan, &mut start.clone(), &mut w, &spec(SMOOTHING))?;
        let hard = step_with_jacobian(&plan, &mut start.clone(), &mut w, &spec(Smooth::EXACT))?;

        for lane in (0..LANES).filter(|l| touching[*l] > 0.0) {
            smoothed_errors
                .check(
                    &smoothed[lane],
                    &surrogate_lane(&plan, &start, &wrt, lane),
                    ON_CONTACT_BOUND,
                )
                .map_err(|e| format!("{robot} on contact, lane {lane}: {e}"))?;

            let _ = exact_errors.check(&hard[lane], &fd_lane(&plan, &start, &wrt, (lane, 1)), ON_CONTACT_BOUND);
        }
    }

    Ok((smoothed_errors, exact_errors))
}

#[test]
fn gradient_matches_fd_off_contact() {
    for robot in ROBOTS {
        let mut errors = off_contact(robot, |_| {}).unwrap_or_else(|e| panic!("{e}"));

        eprintln!(
            "{robot} off contact, control step, worst column error per state: {}",
            errors.report()
        );
    }
}

#[test]
fn gradient_matches_fd_on_contact() {
    for robot in ROBOTS {
        let (mut smoothed, mut exact) = on_contact(robot).unwrap_or_else(|e| panic!("{e}"));

        eprintln!(
            "{robot} on contact, physics step, smoothed gradient against the smoothed step's differences: {}",
            smoothed.report()
        );
        eprintln!(
            "{robot} on contact, physics step, unsmoothed gradient against the exact step's differences: {}",
            exact.report()
        );
    }
}

#[test]
fn canary_wrong_gradient_fails() {
    if !explicitly_named("canary_wrong_gradient_fails") {
        return;
    }

    let plan = plan(ROBOTS[0]);
    let qvel = plan.kernel.nq..plan.kernel.nq + plan.kernel.nv;
    let wrt = all_directions(&plan.kernel, true);
    let skew = |j: &mut Jacobian| {
        for r in 0..j.rows {
            for c in qvel.clone() {
                j.values[r * j.cols + c] *= 1.02;
            }
        }
    };

    assert!(wrt[qvel.start] == Wrt::Qvel(0));
    off_contact(ROBOTS[0], skew).unwrap_or_else(|e| panic!("{e}"));
}

fn bits(state: &State) -> Vec<u64> {
    state
        .qpos
        .iter()
        .chain(&state.qvel)
        .chain(&state.warm)
        .chain(std::iter::once(&state.time))
        .flat_map(|v| v.0.map(f64::to_bits))
        .collect()
}

#[test]
fn forward_stays_exact_with_gradients() {
    for robot in ROBOTS {
        let plan = plan(robot);
        let wrt = all_directions(&plan.kernel, true);
        let (mut w, mut plain_w) = (Workspace::new(&plan), Workspace::new(&plan));
        let mut rng = Rng::new(0xE4 + robot.len() as u64);
        let spec = Spec {
            wrt: &wrt,
            substeps: CONTROL_SUBSTEPS,
            smoothing: SMOOTHING,
            lanes: LANES,
        };

        for _ in 0..2 {
            let mut traced = walking_block(&plan, &mut rng, &mut w);
            let mut plain = traced.clone();

            for round in 0..20 {
                for lane in 0..LANES {
                    let ctrl: Vec<f64> = (0..plan.kernel.nu).map(|_| rng.uniform(-0.5, 0.5)).collect();

                    traced.set_ctrl(lane, &ctrl);
                    plain.set_ctrl(lane, &ctrl);
                }

                step_with_jacobian(&plan, &mut traced, &mut w, &spec).expect("steps with gradients");

                for _ in 0..CONTROL_SUBSTEPS {
                    forge_sim::step(&plan, &mut plain, &mut plain_w);
                }

                assert!(bits(&traced) == bits(&plain), "{robot}: control step {round} differs");
            }
        }
    }
}

#[test]
fn forward_stays_exact_in_the_surrogate_off_contact() {
    for robot in ROBOTS {
        let plan = plan(robot);
        let mut w = Workspace::new(&plan);
        let mut rng = Rng::new(0x5EED);
        let state = airborne_block(&plan, &mut rng, &mut w);
        let mut exact = state.clone();

        forge_sim::step(&plan, &mut exact, &mut w);

        for lane in 0..LANES {
            let next = surrogate(&plan, &state, &mut w, (lane, SMOOTHING)).expect("steps");
            let ours: Vec<f64> = next.qpos.iter().chain(&next.qvel).copied().collect();
            let theirs = read_lane(&exact, lane);
            let off = ours.iter().zip(&theirs).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);

            assert!(
                off < 1e-9,
                "{robot} lane {lane}: the surrogate's step is off by {off:.2e}"
            );
        }
    }
}
