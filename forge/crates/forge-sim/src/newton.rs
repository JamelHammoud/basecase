use crate::block::Block;
use crate::inertia::{factor, mul_sym, solve};
use crate::lanes::{M, ONE, V, ZERO};
use crate::params::MIN_VAL;
use crate::plan::Plan;
use crate::rows::{any_active, jac_mul, jac_t_mul, update};
use crate::search::search;

pub struct Solver {
    pub ma: Vec<V>,
    pub mv: Vec<V>,
    pub grad: Vec<V>,
    pub mgrad: Vec<V>,
    pub dir: Vec<V>,
    pub tmp: Vec<V>,
    pub jaref: Vec<V>,
    pub jv: Vec<V>,
    pub force: Vec<V>,
    pub quadratic: Vec<V>,
    pub quad: Vec<V>,
    pub h: Vec<V>,
    pub h_inv: Vec<V>,
    pub cost: V,
    pub gauss: [V; 3],
    pub scale: V,
}

impl Solver {
    pub fn new(plan: &Plan) -> Self {
        let (nv, nr) = (plan.kernel.nv, plan.nrows);
        let z = |n: usize| vec![ZERO; n];

        Self {
            ma: z(nv),
            mv: z(nv),
            grad: z(nv),
            mgrad: z(nv),
            dir: z(nv),
            tmp: z(nv),
            jaref: z(nr),
            jv: z(nr),
            force: z(nr),
            quadratic: z(nr),
            quad: z(3 * nr),
            h: z(plan.nm),
            h_inv: z(nv),
            cost: ZERO,
            gauss: [ZERO; 3],
            scale: ZERO,
        }
    }
}

fn dot(a: &[V], b: &[V]) -> V {
    a.iter().zip(b).fold(ZERO, |s, (x, y)| s + *x * *y)
}

fn gauss_cost(b: &Block, s: &Solver, qacc: &[V]) -> V {
    let mut g = ZERO;

    for i in 0..qacc.len() {
        g += (s.ma[i] - b.qfrc_smooth[i]) * (qacc[i] - b.qacc_smooth[i]) * 0.5;
    }

    g
}

fn refresh(plan: &Plan, b: &mut Block, s: &mut Solver) {
    let up = update(plan, b, &s.jaref, &mut s.force, &mut s.quadratic);

    jac_t_mul(plan, b, &s.force, &mut s.tmp);
    b.qfrc_constraint.copy_from_slice(&s.tmp);
    s.gauss[0] = gauss_cost(b, s, &b.qacc);
    s.cost = up.cost + s.gauss[0];

    for i in 0..plan.kernel.nv {
        s.grad[i] = s.ma[i] - b.qfrc_smooth[i] - b.qfrc_constraint[i];
    }
}

fn hessian(plan: &Plan, b: &Block, s: &mut Solver) {
    s.h.copy_from_slice(&b.m);

    for row in 0..plan.nrows {
        if !b.row_any[row] {
            continue;
        }

        let weight = s.quadratic[row] * b.row_d[row];
        let chain = &plan.chains[plan.row_chain[row]];
        let adr = plan.row_jadr[row];
        let mut at = 0;

        for a in 0..chain.dofs.len() {
            let wa = b.jac[adr + a] * weight;

            for c in 0..=a {
                s.h[chain.hessian[at]] += wa * b.jac[adr + c];
                at += 1;
            }
        }
    }

    factor(plan, &mut s.h, &mut s.h_inv);
}

fn newton_direction(plan: &Plan, s: &mut Solver) {
    s.mgrad.copy_from_slice(&s.grad);
    solve(plan, &s.h, &s.h_inv, &mut s.mgrad);
}

fn warmstart(plan: &Plan, b: &mut Block, s: &mut Solver) {
    let nv = plan.kernel.nv;

    jac_mul(plan, b, &b.qacc_smooth, &mut s.jaref);

    for r in 0..plan.nrows {
        s.jaref[r] -= b.row_aref[r];
    }

    let smooth = update(plan, b, &s.jaref, &mut s.force, &mut s.quadratic).cost;

    if !plan.kernel.options.warmstart {
        b.qacc.copy_from_slice(&b.qacc_smooth);
        return;
    }

    jac_mul(plan, b, &b.warm, &mut s.jaref);

    for r in 0..plan.nrows {
        s.jaref[r] -= b.row_aref[r];
    }

    let mut warm = update(plan, b, &s.jaref, &mut s.force, &mut s.quadratic).cost;

    for i in 0..nv {
        s.tmp[i] = b.warm[i] - b.qacc_smooth[i];
    }

    mul_sym(plan, &b.m, &s.tmp, &mut s.mv);
    warm += dot(&s.tmp, &s.mv) * 0.5;

    let use_smooth = warm.gt(smooth);

    for i in 0..nv {
        b.qacc[i] = use_smooth.select(b.qacc_smooth[i], b.warm[i]);
    }
}

fn start(plan: &Plan, b: &mut Block, s: &mut Solver) {
    mul_sym(plan, &b.m, &b.qacc, &mut s.ma);
    jac_mul(plan, b, &b.qacc, &mut s.jaref);

    for r in 0..plan.nrows {
        s.jaref[r] -= b.row_aref[r];
    }

    refresh(plan, b, s);

    let trace = (0..plan.kernel.nv).fold(ZERO, |t, i| t + b.m[plan.diag(i)]);

    s.scale = ONE / trace.max(V::splat(MIN_VAL));
}

fn converged_at_start(plan: &Plan, b: &Block, s: &mut Solver, tol: V) -> M {
    s.mgrad.copy_from_slice(&s.grad);
    solve(plan, &b.ld, &b.ld_inv, &mut s.mgrad);

    let gap = (dot(&s.grad, &s.mgrad) * s.scale * 0.5).max(ZERO).lt(tol);
    let gradient = (dot(&s.grad, &s.grad).sqrt() * s.scale).lt(tol);

    gap.and(gradient)
}

pub fn solve_constraints(plan: &Plan, b: &mut Block, s: &mut Solver) {
    let nv = plan.kernel.nv;
    let opt = &plan.kernel.options;
    let tol = V::splat(opt.tolerance);
    let active = any_active(plan, b);

    b.qfrc_constraint.fill(ZERO);

    if !active.any() {
        b.qacc.copy_from_slice(&b.qacc_smooth);
        return;
    }

    warmstart(plan, b, s);
    start(plan, b, s);

    let mut done = active.flip().or(converged_at_start(plan, b, s, tol));

    if !done.all() {
        hessian(plan, b, s);
        newton_direction(plan, s);

        let gradient = (dot(&s.grad, &s.grad).sqrt() * s.scale).lt(tol);
        let decrement = (dot(&s.grad, &s.mgrad) * s.scale * 0.5).max(ZERO).lt(tol);

        done = done.or(gradient.and(decrement));
    }

    let mut iter = 0;

    while !done.all() && iter < opt.iterations {
        for i in 0..nv {
            s.dir[i] = done.select(ZERO, -s.mgrad[i]);
        }

        let (alpha, improvement) = search(plan, b, s, done);

        done = done.or(alpha.eq(ZERO));

        for i in 0..nv {
            b.qacc[i] = done.select(b.qacc[i], b.qacc[i] + alpha * s.dir[i]);
            s.ma[i] = done.select(s.ma[i], s.ma[i] + alpha * s.mv[i]);
        }

        for r in 0..plan.nrows {
            s.jaref[r] = done.select(s.jaref[r], s.jaref[r] + alpha * s.jv[r]);
        }

        refresh(plan, b, s);
        hessian(plan, b, s);
        newton_direction(plan, s);

        let improvement = improvement * s.scale;
        let gradient = dot(&s.grad, &s.grad).sqrt() * s.scale;
        let decrement = (dot(&s.grad, &s.mgrad) * s.scale * 0.5).max(ZERO);
        let stop = improvement
            .gt(ZERO)
            .and(improvement.lt(tol))
            .or(gradient.lt(tol))
            .or(decrement.lt(tol));

        done = done.or(stop);
        iter += 1;
    }

    for i in 0..nv {
        b.qacc[i] = active.select(b.qacc[i], b.qacc_smooth[i]);
    }
}
