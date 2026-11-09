fn joint_frames(i: i32, pos: ptr<function, d3>, quat: ptr<function, d4>) {
    let first = ti(BODY_JNT_ADR, i);
    for (var a = first; a < first + ti(BODY_JNT_NUM, i); a++) {
        let j = ti(BODY_JNT, a);
        let axis = c3(JNT_AXIS, j);
        let jpos = c3(JNT_POS, j);
        let qa = ti(JNT_QPOSADR, j);
        let q = sb(sg(QPOS + qa), tr(QPOS0, qa));
        let xaxis = rot_vec_quat(axis, *quat);
        let xanchor = add3(rot_vec_quat(jpos, *quat), *pos);
        if (ti(JNT_KIND, j) == KIND_SLIDE) {
            *pos = add3(*pos, scl3(xaxis, q));
        } else {
            *quat = mul_quat(*quat, axis_angle_quat(axis, q));
            *pos = sub3(xanchor, rot_vec_quat(jpos, *quat));
        }
        p3(XANCHOR, j, xanchor);
        p3(XAXIS, j, xaxis);
    }
}

fn body_pose(i: i32, pos: ptr<function, d3>, quat: ptr<function, d4>) {
    if (tb(BODY_FREE, i)) {
        let j = ti(BODY_JNT, ti(BODY_JNT_ADR, i));
        let a = ti(JNT_QPOSADR, j);
        *pos = d3(sg(QPOS + a), sg(QPOS + a + 1), sg(QPOS + a + 2));
        *quat = normalize4(d4(sg(QPOS + a + 3), sg(QPOS + a + 4), sg(QPOS + a + 5), sg(QPOS + a + 6)));
        p3(XANCHOR, j, *pos);
        p3(XAXIS, j, c3(JNT_AXIS, j));
        return;
    }
    let p = ti(BODY_PARENT, i);
    if (p != 0) {
        *pos = add3(mat_vec(g9(XMAT, p), c3(BODY_POS, i)), g3(XPOS, p));
        *quat = mul_quat(g4(XQUAT, p), c4(BODY_QUAT, i));
    } else {
        *pos = c3(BODY_POS, i);
        *quat = c4(BODY_QUAT, i);
    }
    joint_frames(i, pos, quat);
    *quat = normalize4(*quat);
}

fn global_pos(body: i32, lpos: d3, frame: i32) -> d3 {
    if (frame == FRAME_BODY) {
        return g3(XPOS, body);
    }
    if (frame == FRAME_INERTIA) {
        return g3(XIPOS, body);
    }
    return add3(mat_vec(g9(XMAT, body), lpos), g3(XPOS, body));
}

fn global_mat(body: i32, lquat: d4, frame: i32) -> d9 {
    if (frame == FRAME_NONE) {
        return quat2mat(mul_quat(g4(XQUAT, body), lquat));
    }
    if (frame == FRAME_BODY || frame == FRAME_BODYROT) {
        return g9(XMAT, body);
    }
    return g9(XIMAT, body);
}

fn identity9() -> d9 {
    return d9(D(1.0), Z(), Z(), Z(), D(1.0), Z(), Z(), Z(), D(1.0));
}

fn kinematics() {
    p3(XPOS, 0, zero3());
    p4(XQUAT, 0, d4(D(1.0), Z(), Z(), Z()));
    p9(XMAT, 0, identity9());
    p3(XIPOS, 0, zero3());
    p9(XIMAT, 0, identity9());
    for (var i = 1; i < NBODY; i++) {
        var pos: d3;
        var quat: d4;
        body_pose(i, &pos, &quat);
        p4(XQUAT, i, quat);
        p3(XPOS, i, pos);
        p9(XMAT, i, quat2mat(quat));
    }
    for (var i = 1; i < NBODY; i++) {
        let frame = ti(BODY_IFRAME, i);
        p3(XIPOS, i, global_pos(i, c3(BODY_IPOS, i), frame));
        p9(XIMAT, i, global_mat(i, c4(BODY_IQUAT, i), frame));
    }
    for (var g = 0; g < NGEOM; g++) {
        let body = ti(GEOM_BODY, g);
        let frame = ti(GEOM_FRAME, g);
        p3(GXPOS, g, global_pos(body, c3(GEOM_POS, g), frame));
        p9(GXMAT, g, global_mat(body, c4(GEOM_QUAT, g), frame));
    }
}

fn subtree_com() {
    for (var i = 0; i < NBODY; i++) {
        p3(SUBCOM, i, scl3(g3(XIPOS, i), sg(TMASS + i)));
    }
    for (var i = NBODY - 1; i >= 1; i--) {
        let p = ti(BODY_PARENT, i);
        p3(SUBCOM, p, add3(g3(SUBCOM, p), g3(SUBCOM, i)));
    }
    for (var i = 0; i < NBODY; i++) {
        let m = tr(BODY_SUBTREE_MASS, i);
        if (lt(m, MIN_VAL)) {
            p3(SUBCOM, i, g3(XIPOS, i));
        } else {
            p3(SUBCOM, i, scl3(g3(SUBCOM, i), dv(D(1.0), m)));
        }
    }
}

fn sq_sum(a: real, b: real) -> real {
    return ad(ml(a, a), ml(b, b));
}

fn inert_com(inert: d3, m: d9, d: d3, mass: real) -> d10 {
    let t = d9(ml(m[0], inert[0]), ml(m[3], inert[0]), ml(m[6], inert[0]), ml(m[1], inert[1]), ml(m[4], inert[1]),
               ml(m[7], inert[1]), ml(m[2], inert[2]), ml(m[5], inert[2]), ml(m[8], inert[2]));
    let a = ad(ad(ml(m[0], t[0]), ml(m[1], t[3])), ml(m[2], t[6]));
    let b = ad(ad(ml(m[3], t[1]), ml(m[4], t[4])), ml(m[5], t[7]));
    let c = ad(ad(ml(m[6], t[2]), ml(m[7], t[5])), ml(m[8], t[8]));
    let e = ad(ad(ml(m[0], t[1]), ml(m[1], t[4])), ml(m[2], t[7]));
    let f = ad(ad(ml(m[0], t[2]), ml(m[1], t[5])), ml(m[2], t[8]));
    let g = ad(ad(ml(m[3], t[2]), ml(m[4], t[5])), ml(m[5], t[8]));
    return d10(ad(a, ml(mass, sq_sum(d[1], d[2]))), ad(b, ml(mass, sq_sum(d[0], d[2]))),
               ad(c, ml(mass, sq_sum(d[0], d[1]))), sb(e, ml(ml(mass, d[0]), d[1])),
               sb(f, ml(ml(mass, d[0]), d[2])), sb(g, ml(ml(mass, d[1]), d[2])), ml(mass, d[0]), ml(mass, d[1]),
               ml(mass, d[2]), mass);
}

fn dof_com(dof: i32, axis: d3, rotation: bool, offset: d3) {
    if (rotation) {
        let x = cross3(axis, offset);
        p6(CDOF, dof, d6(axis[0], axis[1], axis[2], x[0], x[1], x[2]));
    } else {
        p6(CDOF, dof, d6(Z(), Z(), Z(), axis[0], axis[1], axis[2]));
    }
}

fn motion_dofs(i: i32) {
    let root = g3(SUBCOM, ti(BODY_ROOT, i));
    let xmat = g9(XMAT, i);
    let first = ti(BODY_JNT_ADR, i);
    for (var a = first; a < first + ti(BODY_JNT_NUM, i); a++) {
        let j = ti(BODY_JNT, a);
        let da = ti(JNT_DOFADR, j);
        let offset = sub3(root, g3(XANCHOR, j));
        if (ti(JNT_KIND, j) == KIND_FREE) {
            for (var t = 0; t < 3; t++) {
                var unit = zero3();
                unit[t] = D(1.0);
                dof_com(da + t, unit, false, offset);
            }
            for (var r = 0; r < 3; r++) {
                dof_com(da + 3 + r, d3(xmat[r], xmat[r + 3], xmat[r + 6]), true, offset);
            }
        } else {
            dof_com(da, g3(XAXIS, j), ti(JNT_KIND, j) != KIND_SLIDE, offset);
        }
    }
}

fn com_pos() {
    subtree_com();
    for (var k = 0; k < 10; k++) {
        sp(CINERT + k, Z());
    }
    for (var i = 1; i < NBODY; i++) {
        let offset = sub3(g3(XIPOS, i), g3(SUBCOM, ti(BODY_ROOT, i)));
        p10(CINERT, i, inert_com(c3(BODY_INERTIA, i), g9(XIMAT, i), offset, sg(TMASS + i)));
    }
    for (var i = 1; i < NBODY; i++) {
        motion_dofs(i);
    }
}
