fn mul_inert_vec(i: d10, v: d6) -> d6 {
    return d6(ad(ad(ad(ml(i[0], v[0]), ml(i[3], v[1])), sb(ml(i[4], v[2]), ml(i[8], v[4]))), ml(i[7], v[5])),
              sb(ad(ad(ml(i[3], v[0]), ml(i[1], v[1])), ad(ml(i[5], v[2]), ml(i[8], v[3]))), ml(i[6], v[5])),
              ad(ad(ad(ml(i[4], v[0]), ml(i[5], v[1])), sb(ml(i[2], v[2]), ml(i[7], v[3]))), ml(i[6], v[4])),
              ad(sb(ml(i[8], v[1]), ml(i[7], v[2])), ml(i[9], v[3])),
              ad(sb(ml(i[6], v[2]), ml(i[8], v[0])), ml(i[9], v[4])),
              ad(sb(ml(i[7], v[0]), ml(i[6], v[1])), ml(i[9], v[5])));
}

fn dot6(a: d6, b: d6) -> real {
    return ad(ad(ad(ml(a[0], b[0]), ml(a[1], b[1])), ad(ml(a[2], b[2]), ml(a[3], b[3]))),
              ad(ml(a[4], b[4]), ml(a[5], b[5])));
}

fn cross_motion(vel: d6, v: d6) -> d6 {
    return d6(ad(ml(-vel[2], v[1]), ml(vel[1], v[2])), sb(ml(vel[2], v[0]), ml(vel[0], v[2])),
              ad(ml(-vel[1], v[0]), ml(vel[0], v[1])),
              ad(ad(ml(-vel[2], v[4]), ml(vel[1], v[5])), ad(ml(-vel[5], v[1]), ml(vel[4], v[2]))),
              ad(sb(ml(vel[2], v[3]), ml(vel[0], v[5])), sb(ml(vel[5], v[0]), ml(vel[3], v[2]))),
              ad(ad(ml(-vel[1], v[3]), ml(vel[0], v[4])), ad(ml(-vel[4], v[0]), ml(vel[3], v[1]))));
}

fn cross_force(vel: d6, f: d6) -> d6 {
    return d6(ad(ad(ml(-vel[2], f[1]), ml(vel[1], f[2])), ad(ml(-vel[5], f[4]), ml(vel[4], f[5]))),
              ad(sb(ml(vel[2], f[0]), ml(vel[0], f[2])), sb(ml(vel[5], f[3]), ml(vel[3], f[5]))),
              ad(ad(ml(-vel[1], f[0]), ml(vel[0], f[1])), ad(ml(-vel[4], f[3]), ml(vel[3], f[4]))),
              ad(ml(-vel[2], f[4]), ml(vel[1], f[5])), sb(ml(vel[2], f[3]), ml(vel[0], f[5])),
              ad(ml(-vel[1], f[3]), ml(vel[0], f[4])));
}

fn diag_of(i: i32) -> i32 {
    return ti(M_ADR, i) + ti(M_NNZ, i) - 1;
}

fn crb() {
    for (var k = 0; k < 10 * NBODY; k++) {
        sp(CRB + k, sg(CINERT + k));
    }
    for (var i = NBODY - 1; i >= 1; i--) {
        let p = ti(BODY_PARENT, i);
        if (p > 0) {
            for (var k = 0; k < 10; k++) {
                sa(CRB + 10 * p + k, sg(CRB + 10 * i + k));
            }
        }
    }
    for (var k = 0; k < NM; k++) {
        sp(MM + k, Z());
    }
    for (var i = 0; i < NV; i++) {
        var adr = diag_of(i);
        let buf = mul_inert_vec(g10(CRB, ti(DOF_BODY, i)), g6(CDOF, i));
        sp(MM + adr, tr(DOF_ARMATURE, i));
        for (var j = i; j >= 0; j = ti(DOF_PARENT, j)) {
            sa(MM + adr, dot6(g6(CDOF, j), buf));
            adr--;
        }
    }
}

fn mul_sym(mat: i32, x: i32, out: i32) {
    for (var i = 0; i < NV; i++) {
        sp(out + i, ml(sg(mat + diag_of(i)), sg(x + i)));
    }
    for (var i = 0; i < NV; i++) {
        let xi = sg(x + i);
        var s = A0();
        for (var a = ti(M_ADR, i); a < diag_of(i); a++) {
            let m = sg(mat + a);
            let col = ti(M_COL, a);
            s = acc(s, ml(m, sg(x + col)));
            sa(out + col, ml(m, xi));
        }
        sa(out + i, total(s));
    }
}

fn dotv(a: i32, b: i32) -> real {
    var s = A0();
    for (var i = 0; i < NV; i++) {
        s = acc(s, ml(sg(a + i), sg(b + i)));
    }
    return total(s);
}

fn factor_h() {
    for (var r = 0; r < NV; r++) {
        let k = NV - 1 - r;
        let first = ti(M_ADR, k);
        let diag = diag_of(k);
        let d = hg(diag);
        let pivot = select(d, MIN_VAL.x, d < MIN_VAL.x);
        let inv = 1.0 / pivot;
        hs(diag, pivot);
        hs(NM + k, inv);
        for (var u = ti(FACT_OP, r); u < ti(FACT_OP, r + 1); u++) {
            let s = hg(ti(UPD_ADR, u)) * inv;
            let tgt = ti(UPD_TARGET, u);
            for (var t = 0; t < ti(UPD_LEN, u); t++) {
                hs(tgt + t, hg(tgt + t) - hg(first + t) * s);
            }
        }
        for (var a = first; a < diag; a++) {
            hs(a, hg(a) * inv);
        }
    }
}

fn hxg(i: i32) -> f32 {
    return hg(NM + NV + i);
}

fn hxs(i: i32, v: f32) {
    hs(NM + NV + i, v);
}

fn solve_h(x: i32) {
    for (var i = 0; i < NV; i++) {
        hxs(i, sg(x + i).x);
    }
    for (var i = NV - 1; i >= 0; i--) {
        let xi = hxg(i);
        for (var a = ti(M_ADR, i); a < diag_of(i); a++) {
            let col = ti(M_COL, a);
            hxs(col, hxg(col) - hg(a) * xi);
        }
    }
    for (var i = 0; i < NV; i++) {
        hxs(i, hxg(i) * hg(NM + i));
    }
    for (var i = 0; i < NV; i++) {
        var s = 0.0;
        for (var a = ti(M_ADR, i); a < diag_of(i); a++) {
            s += hg(a) * hxg(ti(M_COL, a));
        }
        hxs(i, hxg(i) - s);
        sp(x + i, D(hxg(i)));
    }
}

fn load_h(mat: i32) {
    for (var k = 0; k < NM; k++) {
        hs(k, sg(mat + k).x);
    }
}

fn refined_solve(b: i32, x: i32, implicit: bool) {
    for (var i = 0; i < NV; i++) {
        sp(x + i, sg(b + i));
    }
    solve_h(x);
    mul_sym(MM, x, MX);
    for (var i = 0; i < NV; i++) {
        var lhs = sg(MX + i);
        if (implicit) {
            lhs = ad(lhs, ml(ml(sg(DERIV + i), -DT), sg(x + i)));
        }
        sp(RES + i, sb(sg(b + i), lhs));
    }
    solve_h(RES);
    for (var i = 0; i < NV; i++) {
        sa(x + i, sg(RES + i));
    }
}
