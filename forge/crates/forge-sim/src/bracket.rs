use crate::block::Block;
use crate::lanes::{M, V, ZERO};
use crate::newton::Solver;
use crate::plan::Plan;
use crate::search::{eval, Count, Outcome, Pnt};

pub struct State {
    pub p0: Pnt,
    pub p1: Pnt,
    pub gtol: V,
    pub count: Count,
}

struct Ctx<'a> {
    plan: &'a Plan,
    b: &'a Block,
    s: &'a Solver,
}

fn pick(m: M, a: Pnt, b: Pnt) -> Pnt {
    Pnt::pick(m, a, b)
}

fn next(p: &Pnt) -> V {
    p.next()
}

fn one_sided(c: &Ctx, out: &mut Outcome, st: &mut State, limit: usize) -> Pnt {
    let dir = st.p1.d0.lt(ZERO).select(V::splat(1.0), V::splat(-1.0));
    let mut p1 = st.p1;
    let mut p2 = st.p0;

    loop {
        let going = out
            .finished
            .flip()
            .and((p1.d0 * dir).le(-st.gtol))
            .and(st.count.below(limit));

        if !going.any() {
            break;
        }

        p2 = pick(going, p1, p2);

        let candidate = eval(c.plan, c.b, c.s, going.select(next(&p1), p1.alpha));

        st.count.bump(going, 1);
        p1 = pick(going, candidate, p1);
        out.finish(going.and(p1.d0.abs().lt(st.gtol)).and(p1.cost.lt(ZERO)), p1);
    }

    st.p1 = p1;
    p2
}

fn best_candidate(cands: &[Pnt; 3], gtol: V) -> (M, Pnt) {
    let mut found = M::NONE;
    let mut best = cands[0];

    for c in cands {
        let ok = c.d0.abs().lt(gtol);
        let better = ok.and(found.flip().or(c.cost.lt(best.cost)));

        best = pick(better, *c, best);
        found = found.or(ok);
    }

    (found, best)
}

fn update_bracket(live: M, p: &mut Pnt, cands: &[Pnt; 3]) -> M {
    let mut flag = M::NONE;

    for cand in cands {
        let neg = p.d0.lt(ZERO).and(cand.d0.lt(ZERO)).and(p.d0.lt(cand.d0));
        let pos = p.d0.gt(ZERO).and(cand.d0.gt(ZERO)).and(p.d0.gt(cand.d0));
        let take = live.and(neg.or(pos));

        *p = pick(take, *cand, *p);
        flag = flag.or(take);
    }

    flag
}

fn refresh_next(c: &Ctx, flag: M, p: &Pnt, pnext: &mut Pnt, count: &mut Count) {
    if !flag.any() {
        return;
    }

    let fresh = eval(c.plan, c.b, c.s, flag.select(next(p), p.alpha));

    count.bump(flag, 1);
    *pnext = pick(flag, fresh, *pnext);
}

fn bracketed(c: &Ctx, out: &mut Outcome, st: &mut State, mut p2: Pnt, limit: usize) {
    let mut p1 = st.p1;
    let mut p2next = p1;
    let mut p1next = eval(c.plan, c.b, c.s, next(&p1));

    st.count.bump(out.finished.flip(), 1);

    loop {
        let live = out.finished.flip().and(st.count.below(limit));

        if !live.any() {
            break;
        }

        let pmid = eval(c.plan, c.b, c.s, (p1.alpha + p2.alpha) * 0.5);

        st.count.bump(live, 1);

        let cands = [p1next, p2next, pmid];
        let (found, best) = best_candidate(&cands, st.gtol);

        out.finish(live.and(found), best);

        let live = live.and(found.flip());
        let b1 = update_bracket(live, &mut p1, &cands);

        refresh_next(c, b1, &p1, &mut p1next, &mut st.count);

        let b2 = update_bracket(live, &mut p2, &cands);

        refresh_next(c, b2, &p2, &mut p2next, &mut st.count);
        out.finish(live.and(b1.flip()).and(b2.flip()), pmid);
    }

    let rest = out.finished.flip();
    let first = p1.cost.le(p2.cost).and(p1.cost.lt(ZERO));
    let second = p2.cost.le(p1.cost).and(p2.cost.lt(ZERO));

    out.finish(rest.and(first), p1);
    out.finish(rest.and(first.flip()).and(second), p2);
    out.give_up(rest);
}

pub fn run(plan: &Plan, b: &Block, s: &Solver, out: &mut Outcome, st: &mut State) {
    let limit = plan.kernel.options.ls_iterations;
    let c = Ctx { plan, b, s };
    let p2 = one_sided(&c, out, st, limit);

    out.finish(out.finished.flip().and(st.count.below(limit).flip()), st.p1);

    if out.finished.all() {
        return;
    }

    bracketed(&c, out, st, p2, limit);
}
