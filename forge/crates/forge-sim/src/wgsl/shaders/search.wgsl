struct Pnt {
    alpha: real,
    cost: real,
    d0: real,
    d1: real,
}

struct Outcome {
    alpha: real,
    improvement: real,
}

struct Terms {
    cost: dacc,
    d0: dacc,
    d1: dacc,
}

fn next_alpha(p: Pnt) -> real {
    return sb(p.alpha, dv(p.d0, p.d1));
}

fn is_quad(x: real, rf: real) -> bool {
    return gt(rf, -x) && lt(x, rf);
}

fn friction_cost(x: real, k: i32, quad: bool, neg: bool) -> real {
    let f = tr(FRIC_LOSS, k);
    let h = halve(tr(FRIC_RF, k));
    let linear_cost = select(ml(f, ad(-h, x)), ml(f, sb(-h, x)), neg);
    return select(linear_cost, halve(ml(ml(tr(FRIC_D, k), x), x)), quad);
}

fn prepare(sv: ptr<function, Solver>) {
    (*sv).gauss1 = sb(dotv(DIR, MA), dotv(QSMOOTH, DIR));
    (*sv).gauss2 = halve(dotv(DIR, MV));
    for (var k = 0; k < NFRIC; k++) {
        let first = sg(JAREF + k);
        let rf = tr(FRIC_RF, k);
        let quad = is_quad(first, rf);
        let neg = le(first, -rf);
        sp(FRC + k, friction_cost(first, k, quad, neg));
        np(FRZ + k, select(select(2, 1, neg), 0, quad));
    }
    for (var k = NFRIC; k < (*sv).nlive; k++) {
        let jv = sg(JV + k);
        let ja = sg(JAREF + k);
        let d = sg(RD + k);
        let dj = ml(d, ja);
        sp(QUAD + 3 * k, halve(ml(ja, dj)));
        sp(QUAD + 3 * k + 1, ml(jv, dj));
        sp(QUAD + 3 * k + 2, halve(ml(ml(jv, d), jv)));
    }
}

fn friction_terms(k: i32, alpha: real, t: ptr<function, Terms>) {
    let first = sg(JAREF + k);
    let dir = sg(JV + k);
    let f = tr(FRIC_LOSS, k);
    let d = tr(FRIC_D, k);
    let x = ad(first, ml(alpha, dir));
    let rf = tr(FRIC_RF, k);
    let quad = is_quad(x, rf);
    let neg = le(x, -rf);
    let pos = !(quad || neg);
    let zone = ng(FRZ + k);
    var value = sb(friction_cost(x, k, quad, neg), sg(FRC + k));
    if (quad && zone == 0) {
        value = halve(ml(ml(d, sb(x, first)), ad(x, first)));
    } else if (neg && zone == 1) {
        value = ml(f, sb(first, x));
    } else if (pos && zone == 2) {
        value = ml(f, sb(x, first));
    }
    let fdir = ml(f, dir);
    (*t).cost = acc((*t).cost, value);
    (*t).d0 = acc((*t).d0, select(select(fdir, -fdir, neg), ml(ml(d, x), dir), quad));
    if (quad) {
        (*t).d1 = acc((*t).d1, ml(ml(d, dir), dir));
    }
}

fn eval_at(sv: ptr<function, Solver>, alpha: real) -> Pnt {
    var t = Terms(A0(), A0(), A0());
    var qa = A0();
    var qb = A0();
    var qc = A0();
    for (var k = 0; k < NFRIC; k++) {
        friction_terms(k, alpha, &t);
    }
    for (var k = NFRIC; k < (*sv).nlive; k++) {
        let first = sg(JAREF + k);
        let x = ad(first, ml(alpha, sg(JV + k)));
        let a = sg(QUAD + 3 * k);
        let cost0 = select(Z(), a, lt(first, Z()));
        if (lt(x, Z())) {
            qa = acc(qa, sb(a, cost0));
            qb = acc(qb, sg(QUAD + 3 * k + 1));
            qc = acc(qc, sg(QUAD + 3 * k + 2));
        } else {
            t.cost = acc(t.cost, -cost0);
        }
    }
    let q0 = total(qa);
    let q1 = ad((*sv).gauss1, total(qb));
    let q2 = ad((*sv).gauss2, total(qc));
    let cost = ad(total(t.cost), ad(ad(ml(ml(alpha, alpha), q2), ml(alpha, q1)), q0));
    let d0 = ad(total(t.d0), ad(mul2(ml(alpha, q2)), q1));
    var d1 = ad(total(t.d1), mul2(q2));
    if (le(d1, Z())) {
        d1 = MIN_VAL;
    }
    return Pnt(alpha, cost, d0, d1);
}

fn found_at(p: Pnt) -> Outcome {
    return Outcome(p.alpha, -p.cost);
}

fn better_candidate(cand: Pnt, gtol: real, found: bool, best: Pnt) -> bool {
    return lt(dabs(cand.d0), gtol) && (!found || lt(cand.cost, best.cost));
}

fn tighten(p: ptr<function, Pnt>, cand: Pnt) -> bool {
    let neg = lt((*p).d0, Z()) && lt(cand.d0, Z()) && lt((*p).d0, cand.d0);
    let pos = gt((*p).d0, Z()) && gt(cand.d0, Z()) && gt((*p).d0, cand.d0);
    if (neg || pos) {
        *p = cand;
    }
    return neg || pos;
}

fn update_bracket(p: ptr<function, Pnt>, cands: array<Pnt, 3>) -> bool {
    let f1 = tighten(p, cands[0]);
    let f2 = tighten(p, cands[1]);
    let f3 = tighten(p, cands[2]);
    return f1 || f2 || f3;
}
