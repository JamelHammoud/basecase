inline void joint_frames(Ctx c, int i, thread d3 &pos, thread d4 &quat) {
    for (int a = BODY_JNT_ADR[i]; a < BODY_JNT_ADR[i] + BODY_JNT_NUM[i]; a++) {
        int j = BODY_JNT[a];
        d3 axis = c3(JNT_AXIS, j);
        d3 jpos = c3(JNT_POS, j);
        int qa = JNT_QPOSADR[j];
        real q = S(QPOS, qa) - QPOS0[qa];
        d3 xaxis = rot_vec_quat(axis, quat);
        d3 xanchor = add3(rot_vec_quat(jpos, quat), pos);
        if (JNT_KIND[j] == KIND_SLIDE) {
            pos = add3(pos, scl3(xaxis, q));
        } else {
            quat = mul_quat(quat, axis_angle_quat(axis, q));
            pos = sub3(xanchor, rot_vec_quat(jpos, quat));
        }
        put3(c, XANCHOR, j, xanchor);
        put3(c, XAXIS, j, xaxis);
    }
}

inline void body_pose(Ctx c, int i, thread d3 &pos, thread d4 &quat) {
    if (BODY_FREE[i]) {
        int j = BODY_JNT[BODY_JNT_ADR[i]];
        int a = JNT_QPOSADR[j];
        pos = d3{{S(QPOS, a), S(QPOS, a + 1), S(QPOS, a + 2)}};
        quat = normalize4(d4{{S(QPOS, a + 3), S(QPOS, a + 4), S(QPOS, a + 5), S(QPOS, a + 6)}});
        put3(c, XANCHOR, j, pos);
        put3(c, XAXIS, j, c3(JNT_AXIS, j));
        return;
    }
    int p = BODY_PARENT[i];
    if (p != 0) {
        pos = add3(mat_vec(get9(c, XMAT, p), c3(BODY_POS, i)), get3(c, XPOS, p));
        quat = mul_quat(get4(c, XQUAT, p), c4(BODY_QUAT, i));
    } else {
        pos = c3(BODY_POS, i);
        quat = c4(BODY_QUAT, i);
    }
    joint_frames(c, i, pos, quat);
    quat = normalize4(quat);
}

inline void local_to_global(Ctx c, int body, d3 lpos, d4 lquat, int frame, thread d3 &gpos, thread d9 &gmat) {
    d9 xmat = get9(c, XMAT, body);
    d3 xpos = get3(c, XPOS, body);
    if (frame == FRAME_BODY) {
        gpos = xpos;
    } else if (frame == FRAME_INERTIA) {
        gpos = get3(c, XIPOS, body);
    } else {
        gpos = add3(mat_vec(xmat, lpos), xpos);
    }
    if (frame == FRAME_NONE) {
        gmat = quat2mat(mul_quat(get4(c, XQUAT, body), lquat));
    } else if (frame == FRAME_BODY || frame == FRAME_BODYROT) {
        gmat = xmat;
    } else {
        gmat = get9(c, XIMAT, body);
    }
}

inline d9 identity9() { return d9{{D(1.0f), Z(), Z(), Z(), D(1.0f), Z(), Z(), Z(), D(1.0f)}}; }

inline void kinematics(Ctx c) {
    put3(c, XPOS, 0, zero3());
    put4(c, XQUAT, 0, d4{{D(1.0f), Z(), Z(), Z()}});
    put9(c, XMAT, 0, identity9());
    put3(c, XIPOS, 0, zero3());
    put9(c, XIMAT, 0, identity9());
    for (int i = 1; i < NBODY; i++) {
        d3 pos;
        d4 quat;
        body_pose(c, i, pos, quat);
        put4(c, XQUAT, i, quat);
        put3(c, XPOS, i, pos);
        put9(c, XMAT, i, quat2mat(quat));
    }
    for (int i = 1; i < NBODY; i++) {
        d3 p;
        d9 m;
        local_to_global(c, i, c3(BODY_IPOS, i), c4(BODY_IQUAT, i), BODY_IFRAME[i], p, m);
        put3(c, XIPOS, i, p);
        put9(c, XIMAT, i, m);
    }
    for (int g = 0; g < NGEOM; g++) {
        d3 p;
        d9 m;
        local_to_global(c, GEOM_BODY[g], c3(GEOM_POS, g), c4(GEOM_QUAT, g), GEOM_FRAME[g], p, m);
        put3(c, GXPOS, g, p);
        put9(c, GXMAT, g, m);
    }
}

inline void subtree_com(Ctx c) {
    for (int i = 0; i < NBODY; i++) {
        put3(c, SUBCOM, i, scl3(get3(c, XIPOS, i), S(TMASS, i)));
    }
    for (int i = NBODY - 1; i >= 1; i--) {
        int p = BODY_PARENT[i];
        put3(c, SUBCOM, p, add3(get3(c, SUBCOM, p), get3(c, SUBCOM, i)));
    }
    for (int i = 0; i < NBODY; i++) {
        real m = BODY_SUBTREE_MASS[i];
        d3 value = m < MIN_VAL ? get3(c, XIPOS, i) : scl3(get3(c, SUBCOM, i), D(1.0f) / m);
        put3(c, SUBCOM, i, value);
    }
}

inline d10 inert_com(d3 inert, d9 m, d3 d, real mass) {
    d9 t = d9{{m.v[0] * inert.v[0], m.v[3] * inert.v[0], m.v[6] * inert.v[0], m.v[1] * inert.v[1],
               m.v[4] * inert.v[1], m.v[7] * inert.v[1], m.v[2] * inert.v[2], m.v[5] * inert.v[2],
               m.v[8] * inert.v[2]}};
    return d10{{m.v[0] * t.v[0] + m.v[1] * t.v[3] + m.v[2] * t.v[6] + mass * (d.v[1] * d.v[1] + d.v[2] * d.v[2]),
                m.v[3] * t.v[1] + m.v[4] * t.v[4] + m.v[5] * t.v[7] + mass * (d.v[0] * d.v[0] + d.v[2] * d.v[2]),
                m.v[6] * t.v[2] + m.v[7] * t.v[5] + m.v[8] * t.v[8] + mass * (d.v[0] * d.v[0] + d.v[1] * d.v[1]),
                m.v[0] * t.v[1] + m.v[1] * t.v[4] + m.v[2] * t.v[7] - mass * d.v[0] * d.v[1],
                m.v[0] * t.v[2] + m.v[1] * t.v[5] + m.v[2] * t.v[8] - mass * d.v[0] * d.v[2],
                m.v[3] * t.v[2] + m.v[4] * t.v[5] + m.v[5] * t.v[8] - mass * d.v[1] * d.v[2],
                mass * d.v[0], mass * d.v[1], mass * d.v[2], mass}};
}

inline void dof_com(Ctx c, int dof, d3 axis, bool rotation, d3 offset) {
    if (rotation) {
        d3 x = cross3(axis, offset);
        put6(c, CDOF, dof, d6{{axis.v[0], axis.v[1], axis.v[2], x.v[0], x.v[1], x.v[2]}});
    } else {
        put6(c, CDOF, dof, d6{{Z(), Z(), Z(), axis.v[0], axis.v[1], axis.v[2]}});
    }
}

inline void motion_dofs(Ctx c, int i) {
    d3 root = get3(c, SUBCOM, BODY_ROOT[i]);
    d9 xmat = get9(c, XMAT, i);
    for (int a = BODY_JNT_ADR[i]; a < BODY_JNT_ADR[i] + BODY_JNT_NUM[i]; a++) {
        int j = BODY_JNT[a];
        int da = JNT_DOFADR[j];
        d3 offset = sub3(root, get3(c, XANCHOR, j));
        d3 xaxis = get3(c, XAXIS, j);
        if (JNT_KIND[j] == KIND_FREE) {
            for (int t = 0; t < 3; t++) {
                d3 unit = zero3();
                unit.v[t] = D(1.0f);
                dof_com(c, da + t, unit, false, offset);
            }
            for (int r = 0; r < 3; r++) {
                dof_com(c, da + 3 + r, d3{{xmat.v[r], xmat.v[r + 3], xmat.v[r + 6]}}, true, offset);
            }
        } else {
            dof_com(c, da, xaxis, JNT_KIND[j] != KIND_SLIDE, offset);
        }
    }
}

inline void com_pos(Ctx c) {
    subtree_com(c);
    for (int k = 0; k < 10; k++) {
        S(CINERT, k) = Z();
    }
    for (int i = 1; i < NBODY; i++) {
        d3 offset = sub3(get3(c, XIPOS, i), get3(c, SUBCOM, BODY_ROOT[i]));
        put10(c, CINERT, i, inert_com(c3(BODY_INERTIA, i), get9(c, XIMAT, i), offset, S(TMASS, i)));
    }
    for (int i = 1; i < NBODY; i++) {
        motion_dofs(c, i);
    }
}
