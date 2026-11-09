fn add_dofs(cvel: ptr<function, d6>, src: i32, first: i32, count: i32) {
    var tmp = zero6();
    for (var r = 0; r < count; r++) {
        let q = sg(QVEL + first + r);
        for (var k = 0; k < 6; k++) {
            tmp[k] = ad(tmp[k], ml(sg(src + 6 * (first + r) + k), q));
        }
    }
    for (var k = 0; k < 6; k++) {
        (*cvel)[k] = ad((*cvel)[k], tmp[k]);
    }
}

fn com_vel() {
    p6(CVEL, 0, zero6());
    for (var i = 1; i < NBODY; i++) {
        var cvel = g6(CVEL, ti(BODY_PARENT, i));
        var d = ti(BODY_DOFADR, i);
        let end = d + ti(BODY_DOFNUM, i);
        while (d < end) {
            if (ti(JNT_KIND, ti(DOF_JNT, d)) == KIND_FREE) {
                for (var r = 0; r < 3; r++) {
                    p6(CDOFDOT, d + r, zero6());
                }
                add_dofs(&cvel, CDOF, d, 3);
                for (var r = 0; r < 3; r++) {
                    p6(CDOFDOT, d + 3 + r, cross_motion(cvel, g6(CDOF, d + 3 + r)));
                }
                add_dofs(&cvel, CDOF, d + 3, 3);
                d += 6;
                continue;
            }
            p6(CDOFDOT, d, cross_motion(cvel, g6(CDOF, d)));
            add_dofs(&cvel, CDOF, d, 1);
            d += 1;
        }
        p6(CVEL, i, cvel);
    }
}

fn rne() {
    p6(CACC, 0, d6(Z(), Z(), Z(), -tr(GRAVITY, 0), -tr(GRAVITY, 1), -tr(GRAVITY, 2)));
    for (var i = 1; i < NBODY; i++) {
        var a = g6(CACC, ti(BODY_PARENT, i));
        add_dofs(&a, CDOFDOT, ti(BODY_DOFADR, i), ti(BODY_DOFNUM, i));
        p6(CACC, i, a);
        let inert = g10(CINERT, i);
        let vel = g6(CVEL, i);
        let f = mul_inert_vec(inert, a);
        let cf = cross_force(vel, mul_inert_vec(inert, vel));
        for (var k = 0; k < 6; k++) {
            sp(CFRC + 6 * i + k, ad(f[k], cf[k]));
        }
    }
    for (var k = 0; k < 6; k++) {
        sp(CFRC + k, Z());
    }
    for (var i = NBODY - 1; i >= 1; i--) {
        let p = ti(BODY_PARENT, i);
        if (p > 0) {
            for (var k = 0; k < 6; k++) {
                sa(CFRC + 6 * p + k, sg(CFRC + 6 * i + k));
            }
        }
    }
    for (var d = 0; d < NV; d++) {
        sp(QBIAS + d, dot6(g6(CDOF, d), g6(CFRC, ti(DOF_BODY, d))));
    }
}

fn passive() {
    for (var d = 0; d < NV; d++) {
        let damping = tr(DOF_DAMPING, d);
        sp(QPASSIVE + d, select(Z(), ml(-sg(QVEL + d), damping), !eqd(damping, Z())));
    }
}

fn hist_phys(cursor: i32, n: i32, logical: i32) -> i32 {
    return (cursor + 1 + logical) % n;
}

fn hist_find(base: i32, n: i32, cursor: i32, t: real) -> i32 {
    if (le(t, sg(base + hist_phys(cursor, n, 0)))) {
        return 0;
    }
    if (gt(t, sg(base + hist_phys(cursor, n, n - 1)))) {
        return n;
    }
    var lo = 0;
    var hi = n - 1;
    while (hi - lo > 1) {
        let mid = (lo + hi) / 2;
        if (lt(sg(base + hist_phys(cursor, n, mid)), t)) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return hi;
}

fn hist_read(h: i32, t: real) -> real {
    let n = ti(DELAY_N, h);
    let times = HIST + ti(DELAY_ADR, h);
    let values = times + n;
    let cursor = i32(sg(values + n).x);
    let oldest = hist_phys(cursor, n, 0);
    let newest = hist_phys(cursor, n, n - 1);
    if (le(t, ad(sg(times + oldest), MIN_VAL))) {
        return sg(values + oldest);
    }
    if (ge(t, sb(sg(times + newest), MIN_VAL))) {
        return sg(values + newest);
    }
    let i = hist_find(times, n, cursor, t);
    let hi = hist_phys(cursor, n, i);
    if (lt(dabs(sb(t, sg(times + hi))), MIN_VAL)) {
        return sg(values + hi);
    }
    let lo = hist_phys(cursor, n, i - 1);
    if (!tb(DELAY_LINEAR, h)) {
        return sg(values + lo);
    }
    let alpha = dv(sb(t, sg(times + lo)), sb(sg(times + hi), sg(times + lo)));
    return ad(sg(values + lo), ml(alpha, sb(sg(values + hi), sg(values + lo))));
}

fn hist_shift(times: i32, values: i32, n: i32, cursor: i32, count: i32) {
    for (var j = 0; j < count; j++) {
        let src = hist_phys(cursor, n, j + 1);
        let dst = hist_phys(cursor, n, j);
        sp(times + dst, sg(times + src));
        sp(values + dst, sg(values + src));
    }
}

fn hist_insert(h: i32, t: real, value: real) {
    let n = ti(DELAY_N, h);
    let times = HIST + ti(DELAY_ADR, h);
    let values = times + n;
    let cursor = i32(sg(values + n).x);
    let i = hist_find(times, n, cursor, t);
    if (i < n && lt(dabs(sb(t, sg(times + hist_phys(cursor, n, i)))), MIN_VAL)) {
        sp(values + hist_phys(cursor, n, i), value);
        return;
    }
    if (i == 0) {
        let oldest = hist_phys(cursor, n, 0);
        sp(times + oldest, t);
        sp(values + oldest, value);
        return;
    }
    if (i == n) {
        let next = (cursor + 1) % n;
        sp(values + n, D(f32(next)));
        sp(times + next, t);
        sp(values + next, value);
        return;
    }
    hist_shift(times, values, n, cursor, i - 1);
    let at = hist_phys(cursor, n, i - 1);
    sp(times + at, t);
    sp(values + at, value);
}

fn effective_ctrl() {
    var bad = false;
    for (var a = 0; a < NU; a++) {
        var x = sg(CTRL + a);
        let h = ti(ACT_DELAY, a);
        if (h >= 0) {
            x = hist_read(h, sb(sg(TIME), tr(DELAY_SECONDS, h)));
        }
        if (CLAMP_CTRL != 0 && tb(ACT_CTRL_LIMITED, a)) {
            x = clip(x, tr(ACT_CTRL_LO, a), tr(ACT_CTRL_HI, a));
        }
        bad = bad || nan_f(x.x) || !(ge(x, -MAX_VAL) && le(x, MAX_VAL));
        sp(CTRLE + a, x);
    }
    if (bad) {
        for (var a = 0; a < NU; a++) {
            sp(CTRLE + a, Z());
        }
    }
}

fn actuation() {
    effective_ctrl();
    for (var d = 0; d < NV; d++) {
        sp(QACT + d, Z());
    }
    for (var a = 0; a < NU; a++) {
        let gear = tr(ACT_GEAR, a);
        let len = ml(sg(QPOS + ti(ACT_QPOSADR, a)), gear);
        let vel = ml(sg(QVEL + ti(ACT_DOF, a)), gear);
        let bias = ad(ad(sg(TBIAS + 3 * a), ml(len, sg(TBIAS + 3 * a + 1))), ml(vel, sg(TBIAS + 3 * a + 2)));
        var force = ad(ml(sg(CTRLE + a), sg(TGAIN + a)), bias);
        if (tb(ACT_FORCE_LIMITED, a)) {
            force = clip(force, tr(ACT_FORCE_LO, a), tr(ACT_FORCE_HI, a));
        }
        sp(ACTF + a, force);
        sa(QACT + ti(ACT_DOF, a), ml(force, gear));
    }
}

fn record_ctrl() {
    for (var a = 0; a < NU; a++) {
        let h = ti(ACT_DELAY, a);
        if (h >= 0) {
            hist_insert(h, sg(TIME), sg(CTRL + a));
        }
    }
}
