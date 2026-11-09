fn residual(sv: ptr<function, Solver>, x: i32) {
    jac_mul((*sv).nlive, x, JAREF);
    for (var k = 0; k < (*sv).nlive; k++) {
        sp(JAREF + k, sb(sg(JAREF + k), sg(RAREF + k)));
    }
}

fn forces(sv: ptr<function, Solver>) {
    jac_t_mul((*sv).nlive, FORCE, QCON);
    for (var i = 0; i < NV; i++) {
        sp(GRAD + i, sb(sb(sg(MA + i), sg(QSMOOTH + i)), sg(QCON + i)));
    }
}

fn refresh(sv: ptr<function, Solver>) {
    update_rows(sv, JAREF);
    forces(sv);
}

fn hessian(sv: ptr<function, Solver>) {
    if ((*sv).dirty) {
        load_h(MM);
        hessian_rows((*sv).nlive);
        factor_h();
        (*sv).dirty = false;
    }
    for (var i = 0; i < NV; i++) {
        sp(MGRAD + i, sg(GRAD + i));
    }
    solve_h(MGRAD);
}

fn warmstart(sv: ptr<function, Solver>) -> bool {
    residual(sv, QACCS);
    let smooth_cost = update_rows(sv, JAREF);
    if (WARMSTART == 0) {
        for (var i = 0; i < NV; i++) {
            sp(QACC + i, sg(QACCS + i));
        }
        return true;
    }
    residual(sv, WARM);
    var warm = update_rows(sv, JAREF);
    for (var i = 0; i < NV; i++) {
        sp(TMP + i, sb(sg(WARM + i), sg(QACCS + i)));
    }
    mul_sym(MM, TMP, MV);
    warm = ad(warm, halve(dotv(TMP, MV)));
    let use_smooth = gt(warm, smooth_cost);
    for (var i = 0; i < NV; i++) {
        sp(QACC + i, select(sg(WARM + i), sg(QACCS + i), use_smooth));
    }
    return !use_smooth;
}

fn gradient_small(sv: ptr<function, Solver>) -> bool {
    return lt(ml(dsqrt(dotv(GRAD, GRAD)), (*sv).scale), TOLERANCE);
}

fn decrement_small(sv: ptr<function, Solver>) -> bool {
    return lt(dmax(halve(ml(dotv(GRAD, MGRAD), (*sv).scale)), Z()), TOLERANCE);
}

fn start(sv: ptr<function, Solver>, current: bool) -> bool {
    mul_sym(MM, QACC, MA);
    if (current) {
        forces(sv);
    } else {
        residual(sv, QACC);
        refresh(sv);
    }
    var trace = Z();
    for (var i = 0; i < NV; i++) {
        trace = ad(trace, sg(MM + diag_of(i)));
    }
    (*sv).scale = dv(D(1.0), dmax(trace, MIN_VAL));
    if (!gradient_small(sv)) {
        return false;
    }
    for (var i = 0; i < NV; i++) {
        sp(MGRAD + i, sg(GRAD + i));
    }
    solve_h(MGRAD);
    return decrement_small(sv);
}

fn advance(sv: ptr<function, Solver>, alpha: real) {
    for (var i = 0; i < NV; i++) {
        sa(QACC + i, ml(alpha, sg(DIR + i)));
        sa(MA + i, ml(alpha, sg(MV + i)));
    }
    for (var k = 0; k < (*sv).nlive; k++) {
        sa(JAREF + k, ml(alpha, sg(JV + k)));
    }
}

fn iterate(sv: ptr<function, Solver>, finished: bool) -> i32 {
    var done = finished;
    var iter = 0;
    while (!done && iter < ITERATIONS) {
        for (var i = 0; i < NV; i++) {
            sp(DIR + i, -sg(MGRAD + i));
        }
        let o = line_search(sv);
        done = eqd(o.alpha, Z());
        if (!done) {
            advance(sv, o.alpha);
        }
        refresh(sv);
        iter++;
        let improvement = ml(o.improvement, (*sv).scale);
        done = done || (gt(improvement, Z()) && lt(improvement, TOLERANCE)) || gradient_small(sv);
        if (done) {
            break;
        }
        hessian(sv);
        done = decrement_small(sv);
    }
    return iter;
}

fn solve_constraints(nlive: i32, upto: u32) -> i32 {
    var sv = Solver(Z(), Z(), Z(), nlive, true);
    for (var i = 0; i < NV; i++) {
        sp(QCON + i, Z());
    }
    if (nlive == 0) {
        for (var i = 0; i < NV; i++) {
            sp(QACC + i, sg(QACCS + i));
        }
        return 0;
    }
    let current = warmstart(&sv);
    if (upto < 6u) {
        return 0;
    }
    var done = start(&sv, current);
    if (upto < 7u) {
        return 0;
    }
    if (!done) {
        hessian(&sv);
        done = gradient_small(&sv) && decrement_small(&sv);
    }
    if (upto < 8u) {
        return 0;
    }
    return iterate(&sv, done);
}
