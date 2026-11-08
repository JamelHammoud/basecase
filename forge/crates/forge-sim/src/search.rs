use crate::block::Block;
use crate::inertia::mul_sym;
use crate::lanes::{LANES, M, V, ZERO};
use crate::newton::Solver;
use crate::params::MIN_VAL;
use crate::plan::{Plan, RowKind};
use crate::rows::jac_mul;

#[derive(Clone, Copy)]
pub struct Pnt {
    pub alpha: V,
    pub cost: V,
    pub d0: V,
    pub d1: V,
}

impl Pnt {
    pub fn pick(m: M, a: Pnt, b: Pnt) -> Pnt {
        Pnt {
            alpha: m.select(a.alpha, b.alpha),
            cost: m.select(a.cost, b.cost),
            d0: m.select(a.d0, b.d0),
            d1: m.select(a.d1, b.d1),
        }
    }

    pub fn next(&self) -> V {
        self.alpha - self.d0 / self.d1
    }
}

fn dot(a: &[V], b: &[V]) -> V {
    a.iter().zip(b).fold(ZERO, |s, (x, y)| s + *x * *y)
}

fn prepare(plan: &Plan, b: &Block, s: &mut Solver) {
    s.gauss[1] = dot(&s.dir, &s.ma) - dot(&b.qfrc_smooth, &s.dir);
    s.gauss[2] = dot(&s.dir, &s.mv) * 0.5;

    for row in 0..plan.nrows {
        if !b.row_any[row] {
            continue;
        }

        let (jv, ja, d) = (s.jv[row], s.jaref[row], b.row_d[row]);
        let dj = d * ja;

        s.quad[3 * row] = ja * dj * 0.5;
        s.quad[3 * row + 1] = jv * dj;
        s.quad[3 * row + 2] = jv * d * jv * 0.5;
    }
}

fn friction_cost(x: V, f: V, rf: V, d: V) -> V {
    let quad = rf.gt(-x).and(x.lt(rf));
    let neg = x.le(-rf);

    quad.select(
        d * x * x * 0.5,
        neg.select(f * (-(rf * 0.5) - x), f * (-(rf * 0.5) + x)),
    )
}

fn friction_dif(start: V, x: V, f: V, rf: V, d: V) -> V {
    let zone = |v: V| {
        let q = rf.gt(-v).and(v.lt(rf));
        let n = v.le(-rf);

        (q, n, q.flip().and(n.flip()))
    };
    let (q0, n0, p0) = zone(start);
    let (q1, n1, p1) = zone(x);
    let both_q = d * (x - start) * (x + start) * 0.5;
    let both_n = f * (start - x);
    let both_p = f * (x - start);
    let general = friction_cost(x, f, rf, d) - friction_cost(start, f, rf, d);

    q0.and(q1)
        .select(both_q, n0.and(n1).select(both_n, p0.and(p1).select(both_p, general)))
}

pub fn eval(plan: &Plan, b: &Block, s: &Solver, alpha: V) -> Pnt {
    let mut cost = ZERO;
    let (mut d0, mut d1) = (ZERO, ZERO);
    let mut qt = [ZERO, s.gauss[1], s.gauss[2]];

    for row in 0..plan.nrows {
        if !b.row_any[row] {
            continue;
        }

        let (start, dir) = (s.jaref[row], s.jv[row]);
        let x = start + alpha * dir;

        if plan.row_kind[row] == RowKind::Friction {
            let (f, d) = (b.row_floss[row], b.row_d[row]);
            let rf = b.row_r[row] * f;
            let quad = rf.gt(-x).and(x.lt(rf));
            let neg = x.le(-rf);

            cost += friction_dif(start, x, f, rf, d);
            d0 += quad.select(d * x * dir, neg.select(-(f * dir), f * dir));
            d1 += quad.mask(d * dir * dir);
            continue;
        }

        let q = &s.quad[3 * row..3 * row + 3];
        let cost0 = start.lt(ZERO).mask(q[0]);
        let on = x.lt(ZERO);

        qt[0] += on.mask(q[0] - cost0);
        qt[1] += on.mask(q[1]);
        qt[2] += on.mask(q[2]);
        cost -= on.flip().mask(cost0);
    }

    cost += alpha * alpha * qt[2] + alpha * qt[1] + qt[0];
    d0 += alpha * qt[2] * 2.0 + qt[1];
    d1 += qt[2] * 2.0;
    d1 = d1.le(ZERO).select(V::splat(MIN_VAL), d1);

    Pnt { alpha, cost, d0, d1 }
}

pub struct Outcome {
    pub alpha: V,
    pub improvement: V,
    pub finished: M,
}

impl Outcome {
    pub fn finish(&mut self, lanes: M, p: Pnt) {
        let fresh = lanes.and(self.finished.flip());

        self.alpha = fresh.select(p.alpha, self.alpha);
        self.improvement = fresh.select(-p.cost, self.improvement);
        self.finished = self.finished.or(fresh);
    }

    pub fn give_up(&mut self, lanes: M) {
        let fresh = lanes.and(self.finished.flip());

        self.alpha = fresh.select(ZERO, self.alpha);
        self.improvement = fresh.select(ZERO, self.improvement);
        self.finished = self.finished.or(fresh);
    }
}

pub struct Count([usize; LANES]);

impl Count {
    pub fn bump(&mut self, lanes: M, by: usize) {
        for i in 0..LANES {
            if lanes.get(i) {
                self.0[i] += by;
            }
        }
    }

    pub fn below(&self, limit: usize) -> M {
        M::from_fn(|i| self.0[i] < limit)
    }
}

pub fn search(plan: &Plan, b: &Block, s: &mut Solver, done: M) -> (V, V) {
    let opt = &plan.kernel.options;
    let snorm = dot(&s.dir, &s.dir).sqrt();
    let mut out = Outcome {
        alpha: ZERO,
        improvement: ZERO,
        finished: done.or(snorm.lt(V::splat(MIN_VAL))),
    };

    if out.finished.all() {
        return (out.alpha, out.improvement);
    }

    let gtol = snorm * (opt.tolerance * opt.ls_tolerance) / s.scale;

    mul_sym(plan, &b.m, &s.dir, &mut s.mv);
    jac_mul(plan, b, &s.dir, &mut s.jv);
    prepare(plan, b, s);

    let mut count = Count([0; LANES]);
    let p0 = eval(plan, b, s, ZERO);
    let p1 = eval(plan, b, s, p0.next());

    count.bump(out.finished.flip(), 2);

    let initial = p1.d0.abs().lt(gtol).and(p1.alpha.eq(ZERO).or(p1.cost.lt(ZERO)));

    out.finish(initial, p1);

    let mut state = crate::bracket::State { p0, p1, gtol, count };

    crate::bracket::run(plan, b, s, &mut out, &mut state);

    (out.alpha, out.improvement)
}
