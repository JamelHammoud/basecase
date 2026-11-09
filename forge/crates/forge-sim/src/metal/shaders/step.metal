inline int detect(int pair, Frames f, thread Found *out) {
    int g = PAIR_G2[pair];
    d3 size = c3(GEOM_SIZE, g);
    real margin = PAIR_REACH[pair];
    switch (PAIR_COLLIDER[pair]) {
        case COLLIDER_CONVEX: return plane_convex(GEOM_MESH[g], f, margin, out);
        case COLLIDER_SPHERE: return plane_sphere(f, size, margin, out);
        case COLLIDER_CAPSULE: return plane_capsule(f, size, margin, out);
        case COLLIDER_CYLINDER: return plane_cylinder(f, size, margin, out);
        default: return plane_box(f, size, margin, out);
    }
}

inline void keep_contact(Ctx c, int at, int slot, Found found, d3 normal) {
    N(CSLOT, at) = slot;
    S(CDIST, at) = found.dist;
    put3(c, CPOS, at, found.pos);
    put3(c, CTAN, at, found.tangent);
    put3(c, CNOR, at, normal);
}

inline int collide(Ctx c, thread int &ncon) {
    int kept = 0;
    ncon = 0;
    for (int p = 0; p < NPAIR; p++) {
        int g1 = PAIR_G1[p], g2 = PAIR_G2[p];
        Frames f = Frames{get3(c, GXPOS, g1), get9(c, GXMAT, g1), get3(c, GXPOS, g2), get9(c, GXMAT, g2)};
        Found found[4];
        int n = detect(p, f, found);
        ncon += n;
        for (int i = 0; i < n; i++) {
            int slot = PAIR_SLOT0[p] + i;
            if (found[i].dist < SLOT_MARGIN[slot]) {
                keep_contact(c, kept, slot, found[i], plane_normal(f));
                kept++;
            }
        }
    }
    return kept;
}

inline int assemble(Ctx c, thread int &ncon) {
    friction_rows(c);
    int k = limit_rows(c, NFRIC);
    int kept = collide(c, ncon);
    for (int i = 0; i < kept; i++) {
        Found found = Found{S(CDIST, i), get3(c, CPOS, i), get3(c, CTAN, i)};
        k = contact_rows(c, N(CSLOT, i), found, get3(c, CNOR, i), k);
    }
    return k;
}

inline int forward_upto(Ctx c, thread int &ncon, uint upto) {
    kinematics(c);
    com_pos(c);
    if (upto < 2) {
        return 0;
    }
    crb(c);
    load_h(c, MM);
    factor_h(c);
    if (upto < 3) {
        return 0;
    }
    int nlive = assemble(c, ncon);
    if (upto < 4) {
        return 0;
    }
    com_vel(c);
    passive(c);
    rne(c);
    actuation(c);
    for (int i = 0; i < NV; i++) {
        S(QSMOOTH, i) = S(QPASSIVE, i) - S(QBIAS, i) + S(QACT, i);
    }
    refined_solve(c, QSMOOTH, QACCS, false);
    if (upto < 5) {
        return 0;
    }
    return solve_constraints(c, nlive, upto);
}

inline int forward(Ctx c, thread int &ncon) { return forward_upto(c, ncon, 9); }

inline void integrate_positions(Ctx c) {
    for (int j = 0; j < NJNT; j++) {
        int p = JNT_QPOSADR[j], v = JNT_DOFADR[j];
        if (JNT_KIND[j] != KIND_FREE) {
            S(QPOS, p) += S(QVEL, v) * DT;
            continue;
        }
        for (int i = 0; i < 3; i++) {
            S(QPOS, p + i) += S(QVEL, v + i) * DT;
        }
        real speed;
        d3 axis = normalize3(d3{{S(QVEL, v + 3), S(QVEL, v + 4), S(QVEL, v + 5)}}, speed);
        d4 rot = axis_angle_quat(axis, speed * DT);
        d4 quat = normalize4(d4{{S(QPOS, p + 3), S(QPOS, p + 4), S(QPOS, p + 5), S(QPOS, p + 6)}});
        put4(c, QPOS + p + 3, 0, mul_quat(quat, rot));
    }
}

inline void velocity_derivative(Ctx c) {
    for (int d = 0; d < NV; d++) {
        S(DERIV, d) = Z();
    }
    for (int a = 0; a < NU; a++) {
        real b2 = S(TBIAS, 3 * a + 2);
        if (b2 == Z()) {
            continue;
        }
        real f = S(ACTF, a);
        bool active = !ACT_FORCE_LIMITED[a] || (f > ACT_FORCE_LO[a] && f < ACT_FORCE_HI[a]);
        real gear = S(TGEAR, a);
        S(DERIV, ACT_DOF[a]) += active ? b2 * (gear * gear) : Z();
    }
    for (int d = 0; d < NV; d++) {
        S(DERIV, d) -= DOF_DAMPING[d];
    }
}

inline void implicit_step(Ctx c) {
    velocity_derivative(c);
    load_h(c, MM);
    for (int i = 0; i < NV; i++) {
        H(diag_of(i)) = to_h(S(MM, diag_of(i)) + S(DERIV, i) * (-DT));
        S(RHS, i) = S(QSMOOTH, i) + S(QCON, i);
    }
    factor_h(c);
    refined_solve(c, RHS, IACC, true);
    record_ctrl(c);
    for (int i = 0; i < NV; i++) {
        S(QVEL, i) += S(IACC, i) * DT;
    }
    integrate_positions(c);
    S(TIME, 0) += DT;
    for (int i = 0; i < NV; i++) {
        S(WARM, i) = S(QACC, i);
    }
}

inline void load(Ctx c, device const real *io, uint world) {
    for (int i = 0; i < NSTATE; i++) {
        S(i, 0) = io[world * NSTATE + i];
    }
}

inline void store(Ctx c, device real *io, uint world) {
    for (int i = 0; i < NSTATE; i++) {
        io[world * NSTATE + i] = S(i, 0);
    }
}

kernel void step(device real *io [[buffer(0)]], device real *s [[buffer(1)]], device int *n [[buffer(2)]],
                 device const uint *order [[buffer(3)]], device int *stats [[buffer(4)]],
                 constant uint *params [[buffer(5)]], uint t [[thread_position_in_grid]]) {
    uint W = params[0];
    if (t >= W) {
        return;
    }
    uint world = order[t];
    threadgroup hreal tgh[H_SHARED ? BLOCK * (NM + 2 * NV) : 1];
    Ctx c = context(s, n, tgh, t);
    load(c, io, world);
    int ncon = 0, work = 0;
    for (uint i = 0; i < params[1]; i++) {
        work += forward(c, ncon);
        implicit_step(c);
    }
    store(c, io, world);
    stats[2 * world] = ncon;
    stats[2 * world + 1] = work;
}

kernel void forward_only(device real *io [[buffer(0)]], device real *s [[buffer(1)]], device int *n [[buffer(2)]],
                         device const uint *order [[buffer(3)]], device int *stats [[buffer(4)]],
                         constant uint *params [[buffer(5)]], uint t [[thread_position_in_grid]]) {
    uint W = params[0];
    if (t >= W) {
        return;
    }
    uint world = order[t];
    threadgroup hreal tgh[H_SHARED ? BLOCK * (NM + 2 * NV) : 1];
    Ctx c = context(s, n, tgh, t);
    load(c, io, world);
    int ncon = 0;
    stats[2 * world + 1] = forward(c, ncon);
    stats[2 * world] = ncon;
}

kernel void profile(device real *io [[buffer(0)]], device real *s [[buffer(1)]], device int *n [[buffer(2)]],
                    device const uint *order [[buffer(3)]], device int *stats [[buffer(4)]],
                    constant uint *params [[buffer(5)]], uint t [[thread_position_in_grid]]) {
    uint W = params[0];
    if (t >= W) {
        return;
    }
    threadgroup hreal tgh[H_SHARED ? BLOCK * (NM + 2 * NV) : 1];
    Ctx c = context(s, n, tgh, t);
    load(c, io, order[t]);
    int ncon = 0, work = 0;
    for (uint i = 0; i < params[1]; i++) {
        work += forward_upto(c, ncon, params[2]);
        if (params[2] >= 9) {
            implicit_step(c);
        }
    }
    stats[2 * order[t] + 1] = work;
}
