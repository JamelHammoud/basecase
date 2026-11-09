fn make_frame(normal: d3, tangent: d3) -> d9 {
    let x = normalized(normal);
    var y = tangent;
    if (lt(dot3(y, y), D(0.25))) {
        if (lt(x[1], D(0.5)) && gt(x[1], D(-0.5))) {
            y = d3(Z(), D(1.0), Z());
        } else {
            y = d3(Z(), Z(), D(1.0));
        }
    }
    y = normalized(sub3(y, scl3(x, dot3(x, y))));
    let z = cross3(x, y);
    return d9(x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]);
}

fn impedance(i: i32, pos: real, margin: real) -> real {
    if (tb(IMP_FLAT, i)) {
        return tr(IMP_MID, i);
    }
    let s0 = tr(IMP_SOLIMP, 5 * i);
    let s1 = tr(IMP_SOLIMP, 5 * i + 1);
    let s2 = tr(IMP_SOLIMP, 5 * i + 2);
    let s3 = tr(IMP_SOLIMP, 5 * i + 3);
    let x = dabs(dv(sb(pos, margin), s2));
    if (ge(x, D(1.0))) {
        return s1;
    }
    if (le(x, Z())) {
        return s0;
    }
    var y = x;
    if (tb(IMP_SQUARE, i)) {
        let one_minus = sb(D(1.0), x);
        if (le(x, s3)) {
            y = ml(ml(x, x), tr(IMP_A, i));
        } else {
            y = sb(D(1.0), ml(ml(one_minus, one_minus), tr(IMP_B2, i)));
        }
    }
    return ad(s0, ml(y, sb(s1, s0)));
}

fn clear_row(k: i32) {
    for (var d = 0; d < NV; d++) {
        sp(jx(k, d), Z());
    }
}

fn finish_row(k: i32, chain: i32, imp: i32, r: real, aref_pos: real) {
    np(RCHAIN + k, chain);
    sp(RR + k, r);
    sp(RD + k, dv(D(1.0), r));
    sp(RAREF + k, sb(-ml(row_dot(k, QVEL), tr(IMP_BB, imp)), aref_pos));
}

fn friction_rows() {
    for (var k = 0; k < NFRIC; k++) {
        np(RCHAIN + k, ti(FRIC_DOF, k));
        sp(RAREF + k, -ml(sg(QVEL + ti(FRIC_DOF, k)), tr(FRIC_B, k)));
    }
}

fn limit_rows(first: i32) -> i32 {
    var k = first;
    for (var l = 0; l < NLIM; l++) {
        let sign = tf(LIM_SIGN, l);
        let dist = mf(sb(tr(LIM_BOUND, l), sg(QPOS + ti(LIM_QPOSADR, l))), sign);
        let margin = tr(LIM_MARGIN, l);
        if (!lt(dist, margin)) {
            continue;
        }
        let imp = ti(LIM_IMP, l);
        let value = impedance(imp, dist, margin);
        let r = dmax(dv(ml(sb(D(1.0), value), tr(LIM_DIAG, l)), value), MIN_VAL);
        clear_row(k);
        sp(jx(k, ti(LIM_DOF, l)), D(-sign));
        sp(RJC + k * MAXCHAIN, D(-sign));
        finish_row(k, ti(LIM_DOF, l), imp, r, ml(ml(value, tr(IMP_K, imp)), sb(dist, margin)));
        k++;
    }
    return k;
}

fn point_jacobian(chain: i32, pos: d3) {
    for (var t = 0; t < ti(CHAIN_LEN, chain); t++) {
        let ct = ti(CHAIN_ADR, chain) + t;
        var jp = zero3();
        let first = ti(TERM_ADR, ct);
        for (var a = first; a < first + ti(TERM_NUM, ct); a++) {
            let cdof = g6(CDOF, ti(TERM_DOF, a));
            let offset = sub3(pos, g3(SUBCOM, ti(TERM_ROOT, a)));
            let x = cross3(d3(cdof[0], cdof[1], cdof[2]), offset);
            let sign = tf(TERM_SIGN, a);
            for (var e = 0; e < 3; e++) {
                jp[e] = ad(jp[e], mf(ad(cdof[3 + e], x[e]), sign));
            }
        }
        for (var e = 0; e < 3; e++) {
            sp(SCRJ + 3 * t + e, jp[e]);
        }
    }
}

fn mixed_friction(pair: i32) -> real {
    let f1 = sg(TFRIC + ti(PAIR_G1, pair));
    let f2 = sg(TFRIC + ti(PAIR_G2, pair));
    let mix = ti(PAIR_MIX, pair);
    let mixed = select(select(f2, f1, mix == MIX_FIRST), select(f2, f1, ge(f1, f2)), mix == MIX_MAX);
    return dmax(mixed, MIN_MU);
}

fn project_rows(slot: i32, k: i32, frame: d9, slide: real) {
    let chain = ti(SLOT_CHAIN, slot);
    let rows = ti(SLOT_ROWS, slot);
    for (var t = 0; t < ti(CHAIN_LEN, chain); t++) {
        let p = d3(sg(SCRJ + 3 * t), sg(SCRJ + 3 * t + 1), sg(SCRJ + 3 * t + 2));
        let p0 = row3(frame, 0, p);
        let p1 = row3(frame, 1, p);
        let p2 = row3(frame, 2, p);
        let dof = ti(CHAIN_DOF, ti(CHAIN_ADR, chain) + t);
        for (var row = 0; row < rows; row++) {
            let signed_slide = select(-slide, slide, row % 2 == 0);
            let pd = select(p2, p1, row / 2 == 0);
            let value = select(ad(p0, ml(pd, signed_slide)), p0, rows == 1);
            sp(jx(k + row, dof), value);
            sp(RJC + (k + row) * MAXCHAIN + t, value);
        }
    }
}

fn contact_rows(slot: i32, found: Found, normal: d3, k: i32) -> i32 {
    let margin = tr(SLOT_MARGIN, slot);
    let dist = found.dist;
    if (!lt(dist, margin)) {
        return k;
    }
    let pair = ti(SLOT_PAIR, slot);
    let chain = ti(SLOT_CHAIN, slot);
    let rows = ti(SLOT_ROWS, slot);
    let frame = make_frame(normal, found.tangent);
    point_jacobian(chain, found.pos);
    let slide = mixed_friction(pair);
    let tran = tr(SLOT_TRAN, slot);
    let diag = select(ad(tran, ml(ml(slide, slide), tran)), tran, rows == 1);
    let imp = ti(SLOT_IMP, slot);
    let value = impedance(imp, dist, margin);
    let r0 = dmax(dv(ml(sb(D(1.0), value), diag), value), MIN_VAL);
    let mu = ml(slide, tr(SLOT_RATIO, slot));
    let r = select(mul2(ml(ml(mu, mu), r0)), r0, rows == 1);
    let aref_pos = ml(ml(value, tr(IMP_K, imp)), sb(dist, margin));
    for (var row = 0; row < rows; row++) {
        clear_row(k + row);
    }
    project_rows(slot, k, frame, slide);
    for (var row = 0; row < rows; row++) {
        finish_row(k + row, chain, imp, r, aref_pos);
    }
    return k + rows;
}
