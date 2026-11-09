use super::coeffs::{Coeffs, Wrt};
use super::dual::Dual;
use super::frozen::{freeze, Frozen};
use super::solve::Smooth;
use super::substep::{substep, Next, World};
use crate::integrate::implicit_step;
use crate::lanes::LANES;
use crate::plan::Plan;
use crate::state::State;
use crate::step::{forward_block, Workspace};

pub const WIDTH: usize = 16;

type D = Dual<WIDTH>;

#[derive(Clone, Copy, Debug)]
pub struct Spec<'a> {
    pub wrt: &'a [Wrt],
    pub substeps: usize,
    pub smoothing: Smooth,
    pub lanes: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Jacobian {
    pub rows: usize,
    pub cols: usize,
    pub values: Vec<f64>,
}

impl Jacobian {
    pub fn at(&self, row: usize, col: usize) -> f64 {
        self.values[row * self.cols + col]
    }
}

pub fn supported(plan: &Plan) -> Result<(), String> {
    let k = &plan.kernel;

    if let Some(a) = k.actuators.iter().position(|a| a.delay.is_some()) {
        return Err(format!(
            "actuator {a} has a delay, and Forge's gradients don't carry the control history"
        ));
    }

    let powers = plan
        .limits
        .iter()
        .map(|l| &l.imp)
        .chain(plan.contacts.iter().map(|c| &c.imp))
        .any(|imp| !imp.flat() && imp.solimp[4] != 1.0 && imp.solimp[4] != 2.0);

    if powers {
        return Err("a solimp power other than 1 or 2 has no gradient in Forge".to_owned());
    }

    Ok(())
}

struct Lane {
    qpos: Vec<D>,
    qvel: Vec<D>,
    ctrl: Vec<D>,
    coeffs: Coeffs<D>,
}

fn seed_lane(state: &State, l: usize, chunk: &[Wrt]) -> Lane {
    let read = |v: &[crate::lanes::V]| v.iter().map(|x| D::constant(x.0[l])).collect::<Vec<_>>();
    let mut lane = Lane {
        qpos: read(&state.qpos),
        qvel: read(&state.qvel),
        ctrl: read(&state.ctrl),
        coeffs: Coeffs::from_lane(&state.tables, l).lift(),
    };

    for (direction, wrt) in chunk.iter().enumerate() {
        match *wrt {
            Wrt::Qpos(i) => lane.qpos[i].du[direction] = 1.0,
            Wrt::Qvel(i) => lane.qvel[i].du[direction] = 1.0,
            Wrt::Ctrl(i) => lane.ctrl[i].du[direction] = 1.0,
            other => lane.coeffs.seed(other, direction),
        }
    }

    lane
}

fn exact_into(values: &mut [D], exact: &[crate::lanes::V], l: usize) {
    for (v, e) in values.iter_mut().zip(exact) {
        v.re = e.0[l];
    }
}

pub struct Tracer {
    lanes: Vec<Lane>,
}

impl Tracer {
    pub fn new(state: &State, lanes: usize, chunk: &[Wrt]) -> Self {
        assert!(chunk.len() <= WIDTH, "a tracer carries at most {WIDTH} directions");

        Self {
            lanes: (0..lanes.min(LANES)).map(|l| seed_lane(state, l, chunk)).collect(),
        }
    }

    pub fn advance(
        &mut self,
        plan: &Plan,
        state: &mut State,
        (w, substeps, smoothing): (&mut Workspace, usize, Smooth),
    ) -> Result<(), String> {
        for (l, lane) in self.lanes.iter_mut().enumerate() {
            exact_into(&mut lane.ctrl, &state.ctrl, l);
        }

        for _ in 0..substeps {
            state.swap(&mut w.block);
            forward_block(plan, w);

            let frozen: Vec<Frozen> = (0..self.lanes.len()).map(|l| freeze(plan, &w.block, l)).collect();

            for (lane, frozen) in self.lanes.iter_mut().zip(&frozen) {
                let world = World {
                    qpos: &lane.qpos,
                    qvel: &lane.qvel,
                    ctrl: &lane.ctrl,
                    coeffs: &lane.coeffs,
                };
                let Next { qpos, qvel, .. } =
                    substep(plan, &world, frozen, smoothing).ok_or("the gradient's mass matrix isn't positive")?;

                lane.qpos = qpos;
                lane.qvel = qvel;
            }

            implicit_step(plan, &mut w.block, &mut w.implicit);
            state.swap(&mut w.block);

            for (l, lane) in self.lanes.iter_mut().enumerate() {
                exact_into(&mut lane.qpos, &state.qpos, l);
                exact_into(&mut lane.qvel, &state.qvel, l);
            }
        }

        Ok(())
    }

    pub fn qpos(&self, lane: usize, i: usize) -> &[f64; WIDTH] {
        &self.lanes[lane].qpos[i].du
    }

    pub fn qvel(&self, lane: usize, i: usize) -> &[f64; WIDTH] {
        &self.lanes[lane].qvel[i].du
    }
}

fn pass(
    plan: &Plan,
    state: &mut State,
    w: &mut Workspace,
    (spec, chunk): (&Spec, &[Wrt]),
) -> Result<Vec<Lane>, String> {
    let mut tracer = Tracer::new(state, spec.lanes, chunk);

    tracer.advance(plan, state, (w, spec.substeps, spec.smoothing))?;

    Ok(tracer.lanes)
}

pub fn step_with_jacobian(
    plan: &Plan,
    state: &mut State,
    w: &mut Workspace,
    spec: &Spec,
) -> Result<Vec<Jacobian>, String> {
    supported(plan)?;

    let k = &plan.kernel;
    let rows = k.nq + k.nv;
    let cols = spec.wrt.len();
    let start = state.clone();
    let mut out = vec![
        Jacobian {
            rows,
            cols,
            values: vec![0.0; rows * cols],
        };
        spec.lanes.min(LANES)
    ];

    if cols == 0 {
        pass(plan, state, w, (spec, &[]))?;

        return Ok(out);
    }

    for (c, chunk) in spec.wrt.chunks(WIDTH).enumerate() {
        *state = start.clone();

        let lanes = pass(plan, state, w, (spec, chunk))?;

        for (jac, lane) in out.iter_mut().zip(&lanes) {
            for (r, value) in lane.qpos.iter().chain(&lane.qvel).enumerate() {
                for t in 0..chunk.len() {
                    jac.values[r * cols + c * WIDTH + t] = value.du[t];
                }
            }
        }
    }

    Ok(out)
}

pub fn surrogate(
    plan: &Plan,
    state: &State,
    w: &mut Workspace,
    (lane, smoothing): (usize, Smooth),
) -> Option<Next<f64>> {
    let mut exact = state.clone();
    let read = |v: &[crate::lanes::V]| v.iter().map(|x| x.0[lane]).collect::<Vec<f64>>();
    let (qpos, qvel, ctrl) = (read(&state.qpos), read(&state.qvel), read(&state.ctrl));
    let coeffs = Coeffs::from_lane(&state.tables, lane);

    exact.swap(&mut w.block);
    forward_block(plan, w);

    let frozen: Vec<Frozen> = (0..LANES).map(|l| freeze(plan, &w.block, l)).collect();

    exact.swap(&mut w.block);

    let frozen = &frozen[lane];

    let world = World {
        qpos: &qpos,
        qvel: &qvel,
        ctrl: &ctrl,
        coeffs: &coeffs,
    };

    substep(plan, &world, frozen, smoothing)
}
