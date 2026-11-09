#![allow(dead_code)]

use forge_ir::JointKind;
use forge_mujoco::Model;
use forge_sim::grad::{Jacobian, Wrt};
use forge_sim::{Plan, State, Workspace};
use std::path::PathBuf;

pub const ROBOTS: [&str; 3] = ["quad-servo", "hexapod", "biped-servo"];

pub fn fixture_path(robot: &str) -> PathBuf {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../verify/out/fixtures")
        .join(robot)
        .join("model.xml");

    assert!(
        path.exists(),
        "{} is missing: the s0 gate emits the fixture robots",
        path.display()
    );
    path
}

pub fn fixture(robot: &str) -> (Model, forge_ir::Kernel) {
    let model = Model::load(&fixture_path(robot)).expect("the fixture compiles");
    let kernel = forge_ir::lower(&model).expect("the fixture is in Forge's subset");

    (model, kernel)
}

pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1)
    }

    pub fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);

        let mut z = self.0;

        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    pub fn uniform(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * ((self.next() >> 11) as f64 / (1u64 << 53) as f64)
    }

    pub fn normal(&mut self) -> f64 {
        let (u, v) = (self.uniform(1e-12, 1.0), self.uniform(0.0, std::f64::consts::TAU));

        (-2.0 * u.ln()).sqrt() * v.cos()
    }
}

#[derive(Clone, Debug)]
pub struct Sample {
    pub qpos: Vec<f64>,
    pub qvel: Vec<f64>,
    pub ctrl: Vec<f64>,
}

fn random_quat(rng: &mut Rng) -> [f64; 4] {
    let q = [rng.normal(), rng.normal(), rng.normal(), rng.normal()];
    let n = q.iter().map(|x| x * x).sum::<f64>().sqrt();

    q.map(|x| x / n)
}

pub fn joint_sample(k: &forge_ir::Kernel, rng: &mut Rng, (height, slack): (f64, f64)) -> Sample {
    let mut qpos = k.qpos0.clone();
    let mut qvel = vec![0.0; k.nv];

    for j in &k.joints {
        let (p, v) = (j.qposadr, j.dofadr);

        if j.kind == JointKind::Free {
            qpos[p..p + 3].copy_from_slice(&[rng.uniform(-1.0, 1.0), rng.uniform(-1.0, 1.0), height]);
            qpos[p + 3..p + 7].copy_from_slice(&random_quat(rng));

            for d in 0..6 {
                qvel[v + d] = rng.normal() * if d < 3 { 0.5 } else { 2.0 };
            }

            continue;
        }

        let [lo, hi] = j.limit.as_ref().map_or([-1.5, 1.5], |l| l.range);

        qpos[p] = rng.uniform(lo - slack, hi + slack);
        qvel[v] = rng.normal() * 3.0;
    }

    let ctrl = k
        .actuators
        .iter()
        .map(|a| {
            let [lo, hi] = a.ctrl_range.unwrap_or([-1.0, 1.0]);

            rng.uniform(lo, hi)
        })
        .collect();

    Sample { qpos, qvel, ctrl }
}

pub fn load(plan: &Plan, state: &mut State, lane: usize, s: &Sample) {
    state.reset(plan, lane, &s.qpos);
    state.set_qvel(lane, &s.qvel);
    state.set_ctrl(lane, &s.ctrl);
}

pub fn all_directions(k: &forge_ir::Kernel, params: bool) -> Vec<Wrt> {
    let mut out: Vec<Wrt> = (0..k.nq)
        .map(Wrt::Qpos)
        .chain((0..k.nv).map(Wrt::Qvel))
        .chain((0..k.nu).map(Wrt::Ctrl))
        .collect();

    if params {
        out.extend((1..k.bodies.len()).map(Wrt::Mass));
        out.extend((0..k.nu).flat_map(|a| [Wrt::Kp(a), Wrt::Kv(a), Wrt::Gear(a)]));
        out.extend((0..k.nv).flat_map(|d| [Wrt::Damping(d), Wrt::Armature(d)]));
        out.extend(
            (0..k.nv)
                .filter(|d| k.dofs[*d].friction.is_some())
                .map(Wrt::FrictionLoss),
        );
    }

    out
}

fn bump(v: &mut forge_sim::lanes::V, lane: usize, h: f64) {
    v.0[lane] += h;
}

pub fn perturb(state: &mut State, lane: usize, wrt: Wrt, h: f64) {
    let t = &mut state.tables;

    match wrt {
        Wrt::Qpos(i) => bump(&mut state.qpos[i], lane, h),
        Wrt::Qvel(i) => bump(&mut state.qvel[i], lane, h),
        Wrt::Ctrl(i) => bump(&mut state.ctrl[i], lane, h),
        Wrt::Mass(b) => bump(&mut t.mass[b], lane, h),
        Wrt::Kp(a) => {
            bump(&mut t.gain[a], lane, h);
            bump(&mut t.bias[a][1], lane, -h);
        }
        Wrt::Kv(a) => bump(&mut t.bias[a][2], lane, -h),
        Wrt::Gear(a) => bump(&mut t.gear[a], lane, h),
        Wrt::Damping(d) => bump(&mut t.damping[d], lane, h),
        Wrt::Armature(d) => bump(&mut t.armature[d], lane, h),
        Wrt::FrictionLoss(d) => bump(&mut t.floss[d], lane, h),
    }
}

pub fn step_size(state: &State, lane: usize, wrt: Wrt) -> f64 {
    let t = &state.tables;
    let relative = |v: f64| 1e-5 * v.abs().max(1e-3);

    match wrt {
        Wrt::Qpos(_) | Wrt::Qvel(_) | Wrt::Ctrl(_) => 1e-6,
        Wrt::Mass(b) => relative(t.mass[b].0[lane]),
        Wrt::Kp(a) => relative(t.gain[a].0[lane]),
        Wrt::Kv(a) => relative(t.bias[a][2].0[lane]),
        Wrt::Gear(a) => relative(t.gear[a].0[lane]),
        Wrt::Damping(d) => relative(t.damping[d].0[lane]),
        Wrt::Armature(d) => relative(t.armature[d].0[lane]),
        Wrt::FrictionLoss(d) => relative(t.floss[d].0[lane]),
    }
}

pub fn read_lane(state: &State, lane: usize) -> Vec<f64> {
    state.qpos.iter().chain(&state.qvel).map(|v| v.0[lane]).collect()
}

pub struct Fd {
    pub central: Jacobian,
    pub forward: Jacobian,
    pub backward: Jacobian,
}

fn empty(rows: usize, cols: usize) -> Jacobian {
    Jacobian {
        rows,
        cols,
        values: vec![0.0; rows * cols],
    }
}

pub fn finite_differences(state: &State, lane: usize, wrt: &[Wrt], mut step: impl FnMut(&State) -> Vec<f64>) -> Fd {
    let (rows, cols) = (state.qpos.len() + state.qvel.len(), wrt.len());
    let base = step(state);
    let mut fd = Fd {
        central: empty(rows, cols),
        forward: empty(rows, cols),
        backward: empty(rows, cols),
    };

    for (c, w) in wrt.iter().enumerate() {
        let h = step_size(state, lane, *w);
        let mut plus = state.clone();
        let mut minus = state.clone();

        perturb(&mut plus, lane, *w, h);
        perturb(&mut minus, lane, *w, -h);

        let (p, m) = (step(&plus), step(&minus));

        for r in 0..rows {
            fd.central.values[r * cols + c] = (p[r] - m[r]) / (2.0 * h);
            fd.forward.values[r * cols + c] = (p[r] - base[r]) / h;
            fd.backward.values[r * cols + c] = (base[r] - m[r]) / h;
        }
    }

    fd
}

pub fn exact_steps<'a>(
    plan: &'a Plan,
    w: &'a mut Workspace,
    (lane, substeps): (usize, usize),
) -> impl FnMut(&State) -> Vec<f64> + 'a {
    move |state: &State| {
        let mut s = state.clone();

        for _ in 0..substeps {
            forge_sim::step(plan, &mut s, w);
        }

        read_lane(&s, lane)
    }
}

fn column(j: &Jacobian, c: usize) -> Vec<f64> {
    (0..j.rows).map(|r| j.at(r, c)).collect()
}

fn norm(v: &[f64]) -> f64 {
    v.iter().map(|x| x * x).sum::<f64>().sqrt()
}

fn distance(a: &[f64], b: &[f64]) -> f64 {
    norm(&a.iter().zip(b).map(|(x, y)| x - y).collect::<Vec<_>>())
}

#[derive(Clone, Copy, Debug)]
pub struct ColumnError {
    pub error: f64,
    pub kink: bool,
}

pub fn column_errors(analytic: &Jacobian, fd: &Fd, bound: f64) -> Vec<ColumnError> {
    let norms: Vec<f64> = (0..fd.central.cols).map(|c| norm(&column(&fd.central, c))).collect();
    let mut sorted = norms.clone();

    sorted.sort_by(f64::total_cmp);

    let floor = 1e-3 * sorted[sorted.len() / 2].max(1e-9);

    (0..fd.central.cols)
        .map(|c| {
            let a = column(analytic, c);
            let scale = norms[c].max(floor);
            let central = distance(&a, &column(&fd.central, c)) / scale;
            let (forward, backward) = (column(&fd.forward, c), column(&fd.backward, c));
            let kink = distance(&forward, &backward) / scale > bound;

            if central <= bound || !kink {
                return ColumnError { error: central, kink };
            }

            ColumnError {
                error: (distance(&a, &forward) / scale).min(distance(&a, &backward) / scale),
                kink,
            }
        })
        .collect()
}

pub fn worst(errors: &[ColumnError]) -> f64 {
    errors.iter().map(|e| e.error).fold(0.0, f64::max)
}

pub fn quantiles(values: &mut [f64]) -> String {
    values.sort_by(f64::total_cmp);

    let at = |q: f64| values[((values.len() - 1) as f64 * q).round() as usize];

    format!(
        "median {:.2e}, p90 {:.2e}, max {:.2e} over {}",
        at(0.5),
        at(0.9),
        at(1.0),
        values.len()
    )
}
