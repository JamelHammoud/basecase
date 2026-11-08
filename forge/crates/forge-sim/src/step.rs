use crate::actuation::actuation;
use crate::block::Block;
use crate::collide::collide;
use crate::constraint::assemble;
use crate::inertia::{crb, factor_m, solve};
use crate::integrate::{implicit_step, Implicit};
use crate::kinematics::{com_pos, kinematics};
use crate::lanes::{V, ZERO};
use crate::newton::{solve_constraints, Solver};
use crate::plan::Plan;
use crate::spatial::V3;
use crate::velocity::{com_vel, passive, rne};

pub struct Workspace {
    pub solver: Solver,
    pub implicit: Implicit,
    pub cacc: Vec<V>,
    pub cfrc: Vec<V>,
    pub ctrl: Vec<V>,
    pub points: Vec<V3>,
}

impl Workspace {
    pub fn new(plan: &Plan) -> Self {
        Self {
            solver: Solver::new(plan),
            implicit: Implicit::new(plan),
            cacc: vec![ZERO; 6 * plan.nbody],
            cfrc: vec![ZERO; 6 * plan.nbody],
            ctrl: vec![ZERO; plan.kernel.nu],
            points: Vec::new(),
        }
    }
}

pub fn forward(plan: &Plan, b: &mut Block, w: &mut Workspace) {
    let nv = plan.kernel.nv;

    kinematics(plan, b);
    com_pos(plan, b);
    crb(plan, b);
    factor_m(plan, b);
    collide(plan, b);
    assemble(plan, b, &mut w.points);
    com_vel(plan, b);
    passive(plan, b);
    rne(plan, b, &mut w.cacc, &mut w.cfrc);
    actuation(plan, b, &mut w.ctrl);

    for i in 0..nv {
        b.qfrc_smooth[i] = b.qfrc_passive[i] - b.qfrc_bias[i] + b.qfrc_actuator[i];
    }

    b.qacc_smooth.copy_from_slice(&b.qfrc_smooth);
    solve(plan, &b.ld, &b.ld_inv, &mut b.qacc_smooth);
    solve_constraints(plan, b, &mut w.solver);
}

pub fn step(plan: &Plan, b: &mut Block, w: &mut Workspace) {
    forward(plan, b, w);
    implicit_step(plan, b, &mut w.implicit);
}
