fn mul_quat(a: d4, b: d4) -> d4 {
    return d4(sb(sb(ml(a[0], b[0]), ml(a[1], b[1])), ad(ml(a[2], b[2]), ml(a[3], b[3]))),
              ad(ad(ml(a[0], b[1]), ml(a[1], b[0])), sb(ml(a[2], b[3]), ml(a[3], b[2]))),
              ad(sb(ml(a[0], b[2]), ml(a[1], b[3])), ad(ml(a[2], b[0]), ml(a[3], b[1]))),
              sb(ad(ml(a[0], b[3]), ml(a[1], b[2])), sb(ml(a[2], b[1]), ml(a[3], b[0]))));
}

fn rot_vec_quat(v: d3, q: d4) -> d3 {
    let t0 = sb(ad(ml(q[0], v[0]), ml(q[2], v[2])), ml(q[3], v[1]));
    let t1 = sb(ad(ml(q[0], v[1]), ml(q[3], v[0])), ml(q[1], v[2]));
    let t2 = sb(ad(ml(q[0], v[2]), ml(q[1], v[1])), ml(q[2], v[0]));
    return d3(ad(v[0], mul2(sb(ml(q[2], t2), ml(q[3], t1)))), ad(v[1], mul2(sb(ml(q[3], t0), ml(q[1], t2)))),
              ad(v[2], mul2(sb(ml(q[1], t1), ml(q[2], t0)))));
}

fn quat2mat(q: d4) -> d9 {
    let q00 = ml(q[0], q[0]);
    let q01 = ml(q[0], q[1]);
    let q02 = ml(q[0], q[2]);
    let q03 = ml(q[0], q[3]);
    let q11 = ml(q[1], q[1]);
    let q12 = ml(q[1], q[2]);
    let q13 = ml(q[1], q[3]);
    let q22 = ml(q[2], q[2]);
    let q23 = ml(q[2], q[3]);
    let q33 = ml(q[3], q[3]);
    return d9(sb(sb(ad(q00, q11), q22), q33), mul2(sb(q12, q03)), mul2(ad(q13, q02)),
              mul2(ad(q12, q03)), sb(ad(sb(q00, q11), q22), q33), mul2(sb(q23, q01)),
              mul2(sb(q13, q02)), mul2(ad(q23, q01)), ad(sb(sb(q00, q11), q22), q33));
}

fn norm4(q: d4) -> real {
    return dsqrt(ad(ad(ad(ml(q[0], q[0]), ml(q[1], q[1])), ml(q[2], q[2])), ml(q[3], q[3])));
}

fn normalize4(q: d4) -> d4 {
    let n = norm4(q);
    if (lt(n, MIN_VAL)) {
        return d4(D(1.0), Z(), Z(), Z());
    }
    if (!gt(dabs(sb(n, D(1.0))), MIN_VAL)) {
        return q;
    }
    let inv = dv(D(1.0), n);
    return d4(ml(q[0], inv), ml(q[1], inv), ml(q[2], inv), ml(q[3], inv));
}

fn normalize3(v: d3, norm: ptr<function, real>) -> d3 {
    *norm = dsqrt(dot3(v, v));
    if (lt(*norm, MIN_VAL)) {
        return d3(D(1.0), Z(), Z());
    }
    return scl3(v, dv(D(1.0), *norm));
}

fn poly_sin(x: real) -> real {
    let z = ml(x, x);
    let w = ml(z, z);
    let r = ad(ad(TRIG_S1, ml(z, ad(TRIG_S2, ml(z, TRIG_S3)))), ml(ml(z, w), ad(TRIG_S4, ml(z, TRIG_S5))));
    return ad(x, ml(ml(z, x), ad(TRIG_S0, ml(z, r))));
}

fn poly_cos(x: real) -> real {
    let z = ml(x, x);
    let w = ml(z, z);
    let r = ad(ml(z, ad(TRIG_C0, ml(z, ad(TRIG_C1, ml(z, TRIG_C2))))),
               ml(ml(w, w), ad(TRIG_C3, ml(z, ad(TRIG_C4, ml(z, TRIG_C5))))));
    let hz = halve(z);
    let one = D(1.0);
    let ww = sb(one, hz);
    return ad(ww, ad(sb(sb(one, ww), hz), ml(z, r)));
}

fn sin_cos(x: real, s: ptr<function, real>, co: ptr<function, real>) {
    let k = round(ml(x, TWO_OVER_PI).x);
    let r = sb(sb(x, mf(TRIG_PIO2_1, k)), mf(TRIG_PIO2_1T, k));
    let a = poly_sin(r);
    let b = poly_cos(r);
    let q = ((i32(k) % 4) + 4) % 4;
    *s = select(select(select(-b, -a, q == 2), b, q == 1), a, q == 0);
    *co = select(select(select(a, -b, q == 2), -a, q == 1), b, q == 0);
}

fn axis_angle_quat(axis: d3, angle: real) -> d4 {
    if (eqd(angle, Z())) {
        return d4(D(1.0), Z(), Z(), Z());
    }
    var s: real;
    var co: real;
    sin_cos(halve(angle), &s, &co);
    return d4(co, ml(axis[0], s), ml(axis[1], s), ml(axis[2], s));
}
