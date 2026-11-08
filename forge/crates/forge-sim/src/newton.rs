use crate::block::Block;
use crate::inertia::{factor, mul_sym, solve};
use crate::lanes::{M, ONE, V, ZERO};
use crate::params::MIN_VAL;
use crate::plan::Plan;
use crate::rows::{any_active, for_rows, jac_mul, jac_t_mul, update};
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
    pub friction: Vec<crate::search::Friction>,
    pub h: Vec<V>,
    pub h_inv: Vec<V>,
    pub tri: Vec<V>,
    pub gauss: [V; 3],
    pub scale: V,
    pub stats: Stats,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Stats {
    pub solves: u64,
    pub iterations: u64,
    pub hessians: u64,
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
            friction: vec![crate::search::Friction::default(); plan.friction.len()],
            h: z(plan.nm),
            h_inv: z(nv),
            tri: z(plan.chains.iter().map(|c| c.hessian.len()).max().unwrap_or(0)),
            gauss: [ZERO; 3],
            scale: ZERO,
            stats: Stats::default(),
        }
    }
}

fn dot(a: &[V], b: &[V]) -> V {
    a.iter().zip(b).fold(ZERO, |s, (x, y)| s + *x * *y)
}

fn residual(plan: &Plan, b: &Block, s: &mut Solver, x: &[V]) {
    jac_mul(plan, b, x, &mut s.jaref);
    for_rows(plan, b, |r| s.jaref[r] -= b.row_aref[r]);
}

fn refresh(plan: &Plan, b: &mut Block, s: &mut Solver) {
    update(plan, b, &s.jaref, &mut s.force, &mut s.quadratic);
    jac_t_mul(plan, b, &s.force, &mut s.tmp);
    b.qfrc_constraint.copy_from_slice(&s.tmp);

    for i in 0..plan.kernel.nv {
        s.grad[i] = s.ma[i] - b.qfrc_smooth[i] - b.qfrc_constraint[i];
    }
}

fn slot_hessian(plan: &Plan, b: &Block, s: &mut Solver, slot: usize) {
    let c = &plan.contacts[slot];
    let chain = &plan.chains[c.chain];
    let n = chain.dofs.len();
    let rows = c.row..c.row + c.rows;

    if rows.clone().all(|r| s.quadratic[r] == ZERO) {
        return;
    }

    let tri = &mut s.tri[..chain.hessian.len()];

    tri.fill(ZERO);

    for row in rows {
        let weight = s.quadratic[row] * b.row_d[row];

        if s.quadratic[row] == ZERO {
            continue;
        }

        let jac = &b.jac[plan.row_jadr[row]..plan.row_jadr[row] + n];
        let mut at = 0;

        for (a, ja) in jac.iter().enumerate() {
            let wa = *ja * weight;

            for (t, jc) in tri[at..=at + a].iter_mut().zip(&jac[..=a]) {
                *t += wa * *jc;
            }

            at += a + 1;
        }
    }

    for (t, &adr) in tri.iter().zip(&chain.hessian) {
        s.h[adr] += *t;
    }
}

fn hessian(plan: &Plan, b: &Block, s: &mut Solver) {
    s.stats.hessians += 1;
    s.h.copy_from_slice(&b.m);

    for (row, f) in plan.friction.iter().enumerate() {
        s.h[plan.diag(f.dof)] += s.quadratic[row] * b.row_d[row];
    }

    for &row in &b.live_limits {
        let j = b.jac[plan.row_jadr[row]];

        s.h[plan.diag(plan.jcol[plan.row_jadr[row]])] += s.quadratic[row] * b.row_d[row] * j * j;
    }

    for &slot in &b.live_slots {
        slot_hessian(plan, b, s, slot);
    }

    factor(plan, &mut s.h, &mut s.h_inv);
    s.mgrad.copy_from_slice(&s.grad);
    solve(plan, &s.h, &s.h_inv, &mut s.mgrad);
}

fn warmstart(plan: &Plan, b: &mut Block, s: &mut Solver) {
    residual(plan, b, s, &b.qacc_smooth);

    let smooth = update(plan, b, &s.jaref, &mut s.force, &mut s.quadratic);

    if !plan.kernel.options.warmstart {
        b.qacc.copy_from_slice(&b.qacc_smooth);
        return;
    }

    residual(plan, b, s, &b.warm);

    let mut warm = update(plan, b, &s.jaref, &mut s.force, &mut s.quadratic);

    for i in 0..plan.kernel.nv {
        s.tmp[i] = b.warm[i] - b.qacc_smooth[i];
    }

    mul_sym(plan, &b.m, &s.tmp, &mut s.mv);
    warm += dot(&s.tmp, &s.mv) * 0.5;

    let use_smooth = warm.gt(smooth);

    for i in 0..plan.kernel.nv {
        b.qacc[i] = use_smooth.select(b.qacc_smooth[i], b.warm[i]);
    }
}

fn start(plan: &Plan, b: &mut Block, s: &mut Solver, tol: V) -> M {
    mul_sym(plan, &b.m, &b.qacc, &mut s.ma);
    residual(plan, b, s, &b.qacc);
    refresh(plan, b, s);

    let trace = (0..plan.kernel.nv).fold(ZERO, |t, i| t + b.m[plan.diag(i)]);

    s.scale = ONE / trace.max(V::splat(MIN_VAL));
    s.mgrad.copy_from_slice(&s.grad);
    solve(plan, &b.ld, &b.ld_inv, &mut s.mgrad);

    let gap = (dot(&s.grad, &s.mgrad) * s.scale * 0.5).max(ZERO).lt(tol);

    gap.and(gradient_small(s, tol))
}

fn gradient_small(s: &Solver, tol: V) -> M {
    (dot(&s.grad, &s.grad).sqrt() * s.scale).lt(tol)
}

fn decrement_small(s: &Solver, tol: V) -> M {
    (dot(&s.grad, &s.mgrad) * s.scale * 0.5).max(ZERO).lt(tol)
}

fn advance(plan: &Plan, b: &mut Block, s: &mut Solver, done: M, alpha: V) {
    for i in 0..plan.kernel.nv {
        b.qacc[i] = done.select(b.qacc[i], b.qacc[i] + alpha * s.dir[i]);
        s.ma[i] = done.select(s.ma[i], s.ma[i] + alpha * s.mv[i]);
    }

    for_rows(plan, b, |r| {
        s.jaref[r] = done.select(s.jaref[r], s.jaref[r] + alpha * s.jv[r])
    });
}

fn iterate(plan: &Plan, b: &mut Block, s: &mut Solver, mut done: M, tol: V) {
    let mut iter = 0;

    while !done.all() && iter < plan.kernel.options.iterations {
        for i in 0..plan.kernel.nv {
            s.dir[i] = done.select(ZERO, -s.mgrad[i]);
        }

        let (alpha, improvement) = search(plan, b, s, done);

        done = done.or(alpha.eq(ZERO));
        advance(plan, b, s, done, alpha);
        refresh(plan, b, s);
        iter += 1;
        s.stats.iterations += 1;

        let improvement = improvement * s.scale;

        done = done.or(improvement.gt(ZERO).and(improvement.lt(tol)).or(gradient_small(s, tol)));

        if done.all() {
            break;
        }

        hessian(plan, b, s);
        done = done.or(decrement_small(s, tol));
    }
}

pub fn solve_constraints(plan: &Plan, b: &mut Block, s: &mut Solver) {
    let tol = V::splat(plan.kernel.options.tolerance);
    let active = any_active(plan, b);

    b.qfrc_constraint.fill(ZERO);

    if !active.any() {
        b.qacc.copy_from_slice(&b.qacc_smooth);
        return;
    }

    s.stats.solves += 1;
    warmstart(plan, b, s);

    let mut done = active.flip().or(start(plan, b, s, tol));

    if !done.all() {
        hessian(plan, b, s);
        done = done.or(gradient_small(s, tol).and(decrement_small(s, tol)));
    }

    iterate(plan, b, s, done, tol);

    for i in 0..plan.kernel.nv {
        b.qacc[i] = active.select(b.qacc[i], b.qacc_smooth[i]);
    }
}
