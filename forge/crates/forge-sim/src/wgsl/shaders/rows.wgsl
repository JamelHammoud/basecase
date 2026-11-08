struct Solver {
    scale: real,
    gauss1: real,
    gauss2: real,
    nlive: i32,
    dirty: bool,
}

fn set_quadratic(sv: ptr<function, Solver>, k: i32, on: bool) {
    let value = select(Z(), D(1.0), on);
    (*sv).dirty = (*sv).dirty || !eqd(sg(QUADR + k), value);
    sp(QUADR + k, value);
}

fn jx(k: i32, d: i32) -> i32 {
    return RJAC + k * NV + d;
}

fn row_dot(k: i32, x: i32) -> real {
    var s = A0();
    for (var d = 0; d < NV; d++) {
        s = acc(s, ml(sg(jx(k, d)), sg(x + d)));
    }
    return total(s);
}

fn jac_mul(nlive: i32, x: i32, out: i32) {
    for (var k = 0; k < NFRIC; k++) {
        sp(out + k, sg(x + ti(FRIC_DOF, k)));
    }
    for (var k = NFRIC; k < nlive; k++) {
        sp(out + k, row_dot(k, x));
    }
}

fn jac_t_mul(nlive: i32, force: i32, out: i32) {
    for (var i = 0; i < NV; i++) {
        sp(out + i, Z());
    }
    for (var k = 0; k < NFRIC; k++) {
        sa(out + ti(FRIC_DOF, k), sg(force + k));
    }
    for (var k = NFRIC; k < nlive; k++) {
        let chain = ng(RCHAIN + k);
        let adr = ti(CHAIN_ADR, chain);
        let f = sg(force + k);
        for (var t = 0; t < ti(CHAIN_LEN, chain); t++) {
            sa(out + ti(CHAIN_DOF, adr + t), ml(sg(RJC + k * MAXCHAIN + t), f));
        }
    }
}

fn friction_row(sv: ptr<function, Solver>, k: i32, jar: i32) -> real {
    let d = tr(FRIC_D, k);
    let x = sg(jar + k);
    let f = tr(FRIC_LOSS, k);
    let r = tr(FRIC_R, k);
    let rf = ml(r, f);
    let neg = le(x, -rf);
    let pos = ge(x, rf);
    let lin = neg || pos;
    let lin_cost = ad(-halve(ml(ml(r, f), f)), select(ml(f, x), -ml(f, x), neg));
    sp(FORCE + k, select(select(-ml(d, x), -f, pos), f, neg));
    set_quadratic(sv, k, !lin);
    return select(halve(ml(ml(d, x), x)), lin_cost, lin);
}

fn update_rows(sv: ptr<function, Solver>, jar: i32) -> real {
    let nlive = (*sv).nlive;
    var cost = A0();
    for (var k = 0; k < NFRIC; k++) {
        cost = acc(cost, friction_row(sv, k, jar));
    }
    for (var k = NFRIC; k < nlive; k++) {
        let d = sg(RD + k);
        let x = sg(jar + k);
        let satisfied = ge(x, Z());
        cost = acc(cost, select(halve(ml(ml(d, x), x)), Z(), satisfied));
        sp(FORCE + k, select(-ml(d, x), Z(), satisfied));
        set_quadratic(sv, k, !satisfied);
    }
    return total(cost);
}

fn hessian_rows(nlive: i32) {
    for (var k = 0; k < NFRIC; k++) {
        let at = diag_of(ti(FRIC_DOF, k));
        hs(at, hg(at) + ml(sg(QUADR + k), tr(FRIC_D, k)).x);
    }
    for (var k = NFRIC; k < nlive; k++) {
        if (eqd(sg(QUADR + k), Z())) {
            continue;
        }
        let weight = ml(sg(QUADR + k), sg(RD + k)).x;
        let chain = ng(RCHAIN + k);
        let n = ti(CHAIN_LEN, chain);
        var at = ti(HESS_ADR, chain);
        for (var a = 0; a < n; a++) {
            let wa = sg(RJC + k * MAXCHAIN + a).x * weight;
            for (var b = 0; b <= a; b++) {
                let h = ti(HESS, at);
                hs(h, hg(h) + wa * sg(RJC + k * MAXCHAIN + b).x);
                at++;
            }
        }
    }
}
