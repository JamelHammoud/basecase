inline void add_dofs(Ctx c, thread d6 &cvel, int src, int first, int count) {
    d6 tmp = d6{{Z(), Z(), Z(), Z(), Z(), Z()}};
    for (int r = 0; r < count; r++) {
        real q = S(QVEL, first + r);
        for (int k = 0; k < 6; k++) {
            tmp.v[k] += S(src, 6 * (first + r) + k) * q;
        }
    }
    for (int k = 0; k < 6; k++) {
        cvel.v[k] += tmp.v[k];
    }
}

inline void com_vel(Ctx c) {
    d6 zero = d6{{Z(), Z(), Z(), Z(), Z(), Z()}};
    put6(c, CVEL, 0, zero);
    for (int i = 1; i < NBODY; i++) {
        d6 cvel = get6(c, CVEL, BODY_PARENT[i]);
        int d = BODY_DOFADR[i];
        int end = d + BODY_DOFNUM[i];
        while (d < end) {
            if (JNT_KIND[DOF_JNT[d]] == KIND_FREE) {
                for (int r = 0; r < 3; r++) {
                    put6(c, CDOFDOT, d + r, zero);
                }
                add_dofs(c, cvel, CDOF, d, 3);
                for (int r = 0; r < 3; r++) {
                    put6(c, CDOFDOT, d + 3 + r, cross_motion(cvel, get6(c, CDOF, d + 3 + r)));
                }
                add_dofs(c, cvel, CDOF, d + 3, 3);
                d += 6;
                continue;
            }
            put6(c, CDOFDOT, d, cross_motion(cvel, get6(c, CDOF, d)));
            add_dofs(c, cvel, CDOF, d, 1);
            d += 1;
        }
        put6(c, CVEL, i, cvel);
    }
}

inline void rne(Ctx c) {
    put6(c, CACC, 0, d6{{Z(), Z(), Z(), -GRAVITY[0], -GRAVITY[1], -GRAVITY[2]}});
    for (int i = 1; i < NBODY; i++) {
        d6 acc = get6(c, CACC, BODY_PARENT[i]);
        add_dofs(c, acc, CDOFDOT, BODY_DOFADR[i], BODY_DOFNUM[i]);
        put6(c, CACC, i, acc);
        d10 inert = get10(c, CINERT, i);
        d6 vel = get6(c, CVEL, i);
        d6 f = mul_inert_vec(inert, acc);
        d6 cf = cross_force(vel, mul_inert_vec(inert, vel));
        for (int k = 0; k < 6; k++) {
            S(CFRC, 6 * i + k) = f.v[k] + cf.v[k];
        }
    }
    for (int k = 0; k < 6; k++) {
        S(CFRC, k) = Z();
    }
    for (int i = NBODY - 1; i >= 1; i--) {
        int p = BODY_PARENT[i];
        if (p > 0) {
            for (int k = 0; k < 6; k++) {
                S(CFRC, 6 * p + k) += S(CFRC, 6 * i + k);
            }
        }
    }
    for (int d = 0; d < NV; d++) {
        S(QBIAS, d) = dot6(get6(c, CDOF, d), get6(c, CFRC, DOF_BODY[d]));
    }
}

inline void passive(Ctx c) {
    for (int d = 0; d < NV; d++) {
        S(QPASSIVE, d) = DOF_DAMPING[d] != Z() ? -S(QVEL, d) * DOF_DAMPING[d] : Z();
    }
}

inline int hist_phys(int cursor, int n, int logical) { return (cursor + 1 + logical) % n; }

inline int hist_find(Ctx c, int base, int n, int cursor, real t) {
    if (t <= S(base, hist_phys(cursor, n, 0))) {
        return 0;
    }
    if (t > S(base, hist_phys(cursor, n, n - 1))) {
        return n;
    }
    int lo = 0;
    int hi = n - 1;
    while (hi - lo > 1) {
        int mid = (lo + hi) / 2;
        if (S(base, hist_phys(cursor, n, mid)) < t) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return hi;
}

inline real hist_read(Ctx c, int h, real t) {
    int n = DELAY_N[h];
    int times = HIST + DELAY_ADR[h];
    int values = times + n;
    int cursor = (int)S(values + n, 0).hi;
    int oldest = hist_phys(cursor, n, 0);
    int newest = hist_phys(cursor, n, n - 1);
    if (t <= S(times, oldest) + MIN_VAL) {
        return S(values, oldest);
    }
    if (t >= S(times, newest) - MIN_VAL) {
        return S(values, newest);
    }
    int i = hist_find(c, times, n, cursor, t);
    int hi = hist_phys(cursor, n, i);
    if (dabs(t - S(times, hi)) < MIN_VAL) {
        return S(values, hi);
    }
    int lo = hist_phys(cursor, n, i - 1);
    if (!DELAY_LINEAR[h]) {
        return S(values, lo);
    }
    real alpha = (t - S(times, lo)) / (S(times, hi) - S(times, lo));
    return S(values, lo) + alpha * (S(values, hi) - S(values, lo));
}

inline void hist_shift(Ctx c, int times, int values, int n, int cursor, int count) {
    for (int j = 0; j < count; j++) {
        int src = hist_phys(cursor, n, j + 1);
        int dst = hist_phys(cursor, n, j);
        S(times, dst) = S(times, src);
        S(values, dst) = S(values, src);
    }
}

inline void hist_insert(Ctx c, int h, real t, real value) {
    int n = DELAY_N[h];
    int times = HIST + DELAY_ADR[h];
    int values = times + n;
    int cursor = (int)S(values + n, 0).hi;
    int i = hist_find(c, times, n, cursor, t);
    if (i < n && dabs(t - S(times, hist_phys(cursor, n, i))) < MIN_VAL) {
        S(values, hist_phys(cursor, n, i)) = value;
        return;
    }
    if (i == 0) {
        int oldest = hist_phys(cursor, n, 0);
        S(times, oldest) = t;
        S(values, oldest) = value;
        return;
    }
    if (i == n) {
        int next = (cursor + 1) % n;
        S(values + n, 0) = D((float)next);
        S(times, next) = t;
        S(values, next) = value;
        return;
    }
    hist_shift(c, times, values, n, cursor, i - 1);
    int at = hist_phys(cursor, n, i - 1);
    S(times, at) = t;
    S(values, at) = value;
}

inline void effective_ctrl(Ctx c) {
    bool bad = false;
    for (int a = 0; a < NU; a++) {
        real x = S(CTRL, a);
        int h = ACT_DELAY[a];
        if (h >= 0) {
            x = hist_read(c, h, S(TIME, 0) - DELAY_SECONDS[h]);
        }
        if (CLAMP_CTRL && ACT_CTRL_LIMITED[a]) {
            x = clip(x, ACT_CTRL_LO[a], ACT_CTRL_HI[a]);
        }
        bad = bad || isnan(x.hi) || !(x >= -MAX_VAL && x <= MAX_VAL);
        S(CTRLE, a) = x;
    }
    if (bad) {
        for (int a = 0; a < NU; a++) {
            S(CTRLE, a) = Z();
        }
    }
}

inline void actuation(Ctx c) {
    effective_ctrl(c);
    for (int d = 0; d < NV; d++) {
        S(QACT, d) = Z();
    }
    for (int a = 0; a < NU; a++) {
        real gear = ACT_GEAR[a];
        real length = S(QPOS, ACT_QPOSADR[a]) * gear;
        real velocity = S(QVEL, ACT_DOF[a]) * gear;
        real bias = S(TBIAS, 3 * a) + length * S(TBIAS, 3 * a + 1) + velocity * S(TBIAS, 3 * a + 2);
        real force = S(CTRLE, a) * S(TGAIN, a) + bias;
        if (ACT_FORCE_LIMITED[a]) {
            force = clip(force, ACT_FORCE_LO[a], ACT_FORCE_HI[a]);
        }
        S(ACTF, a) = force;
        S(QACT, ACT_DOF[a]) += force * gear;
    }
}

inline void record_ctrl(Ctx c) {
    for (int a = 0; a < NU; a++) {
        int h = ACT_DELAY[a];
        if (h >= 0) {
            hist_insert(c, h, S(TIME, 0), S(CTRL, a));
        }
    }
}
