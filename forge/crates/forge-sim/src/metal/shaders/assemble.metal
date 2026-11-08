inline d9 make_frame(d3 normal, d3 tangent) {
    d3 x = normalized(normal);
    d3 y = tangent;
    if (dot3(y, y) < D(0.25f)) {
        y = (x.v[1] < D(0.5f) && x.v[1] > D(-0.5f)) ? d3{{Z(), D(1.0f), Z()}} : d3{{Z(), Z(), D(1.0f)}};
    }
    y = normalized(sub3(y, scl3(x, dot3(x, y))));
    d3 z = cross3(x, y);
    return d9{{x.v[0], x.v[1], x.v[2], y.v[0], y.v[1], y.v[2], z.v[0], z.v[1], z.v[2]}};
}

inline real impedance(int i, real pos, real margin) {
    if (IMP_FLAT[i]) {
        return IMP_MID[i];
    }
    real s0 = IMP_SOLIMP[5 * i], s1 = IMP_SOLIMP[5 * i + 1], s2 = IMP_SOLIMP[5 * i + 2];
    real s3 = IMP_SOLIMP[5 * i + 3];
    real x = dabs((pos - margin) / s2);
    if (x >= D(1.0f)) {
        return s1;
    }
    if (x <= Z()) {
        return s0;
    }
    real y = x;
    if (IMP_SQUARE[i]) {
        real one_minus = D(1.0f) - x;
        y = x <= s3 ? x * x * IMP_A[i] : D(1.0f) - one_minus * one_minus * IMP_B2[i];
    }
    return s0 + y * (s1 - s0);
}

inline void clear_row(Ctx c, int k) {
    for (int d = 0; d < NV; d++) {
        J(k, d) = Z();
    }
}

inline void finish_row(Ctx c, int k, int chain, int imp, real r, real aref_pos) {
    N(RCHAIN, k) = chain;
    S(RR, k) = r;
    S(RD, k) = D(1.0f) / r;
    S(RAREF, k) = -(row_dot(c, k, QVEL) * IMP_BB[imp]) - aref_pos;
}

inline void friction_rows(Ctx c) {
    for (int k = 0; k < NFRIC; k++) {
        N(RCHAIN, k) = FRIC_DOF[k];
        S(RAREF, k) = -(S(QVEL, FRIC_DOF[k]) * FRIC_B[k]);
    }
}

inline int limit_rows(Ctx c, int k) {
    for (int l = 0; l < NLIM; l++) {
        real dist = (LIM_BOUND[l] - S(QPOS, LIM_QPOSADR[l])) * LIM_SIGN[l];
        real margin = LIM_MARGIN[l];
        if (!(dist < margin)) {
            continue;
        }
        int imp = LIM_IMP[l];
        real value = impedance(imp, dist, margin);
        real r = dmax((D(1.0f) - value) * LIM_DIAG[l] / value, MIN_VAL);
        clear_row(c, k);
        J(k, LIM_DOF[l]) = D(-LIM_SIGN[l]);
        S(RJC, k * MAXCHAIN) = D(-LIM_SIGN[l]);
        finish_row(c, k, LIM_DOF[l], imp, r, value * IMP_K[imp] * (dist - margin));
        k++;
    }
    return k;
}

inline void point_jacobian(Ctx c, int chain, d3 pos) {
    for (int t = 0; t < CHAIN_LEN[chain]; t++) {
        int ct = CHAIN_ADR[chain] + t;
        d3 jp = zero3();
        for (int a = TERM_ADR[ct]; a < TERM_ADR[ct] + TERM_NUM[ct]; a++) {
            d6 cdof = get6(c, CDOF, TERM_DOF[a]);
            d3 offset = sub3(pos, get3(c, SUBCOM, TERM_ROOT[a]));
            d3 x = cross3(d3{{cdof.v[0], cdof.v[1], cdof.v[2]}}, offset);
            for (int e = 0; e < 3; e++) {
                jp.v[e] += (cdof.v[3 + e] + x.v[e]) * TERM_SIGN[a];
            }
        }
        for (int e = 0; e < 3; e++) {
            S(SCRJ, 3 * t + e) = jp.v[e];
        }
    }
}

inline real mixed_friction(Ctx c, int pair) {
    real f1 = S(TFRIC, PAIR_G1[pair]);
    real f2 = S(TFRIC, PAIR_G2[pair]);
    real mixed = PAIR_MIX[pair] == MIX_MAX ? (f1 >= f2 ? f1 : f2) : (PAIR_MIX[pair] == MIX_FIRST ? f1 : f2);
    return dmax(mixed, MIN_MU);
}

inline void project_rows(Ctx c, int slot, int k, d9 frame, real slide) {
    int chain = SLOT_CHAIN[slot];
    int rows = SLOT_ROWS[slot];
    int n = CHAIN_LEN[chain];
    for (int t = 0; t < n; t++) {
        d3 p = d3{{S(SCRJ, 3 * t), S(SCRJ, 3 * t + 1), S(SCRJ, 3 * t + 2)}};
        real p0 = frame.v[0] * p.v[0] + frame.v[1] * p.v[1] + frame.v[2] * p.v[2];
        real p1 = frame.v[3] * p.v[0] + frame.v[4] * p.v[1] + frame.v[5] * p.v[2];
        real p2 = frame.v[6] * p.v[0] + frame.v[7] * p.v[1] + frame.v[8] * p.v[2];
        for (int row = 0; row < rows; row++) {
            real signed_slide = row % 2 == 0 ? slide : -slide;
            real pd = row / 2 == 0 ? p1 : p2;
            real value = rows == 1 ? p0 : p0 + pd * signed_slide;
            J(k + row, CHAIN_DOF[CHAIN_ADR[chain] + t]) = value;
            S(RJC, (k + row) * MAXCHAIN + t) = value;
        }
    }
}

inline int contact_rows(Ctx c, int slot, Found found, d3 normal, int k) {
    real margin = SLOT_MARGIN[slot];
    real dist = found.dist;
    if (!(dist < margin)) {
        return k;
    }
    int pair = SLOT_PAIR[slot];
    int chain = SLOT_CHAIN[slot];
    int rows = SLOT_ROWS[slot];
    d9 frame = make_frame(normal, found.tangent);
    point_jacobian(c, chain, found.pos);
    real slide = mixed_friction(c, pair);
    real tran = SLOT_TRAN[slot];
    real diag = rows == 1 ? tran : tran + slide * slide * tran;
    int imp = SLOT_IMP[slot];
    real value = impedance(imp, dist, margin);
    real r0 = dmax((D(1.0f) - value) * diag / value, MIN_VAL);
    real mu = slide * SLOT_RATIO[slot];
    real r = rows == 1 ? r0 : mul2(mu * mu * r0);
    real aref_pos = value * IMP_K[imp] * (dist - margin);
    for (int row = 0; row < rows; row++) {
        clear_row(c, k + row);
    }
    project_rows(c, slot, k, frame, slide);
    for (int row = 0; row < rows; row++) {
        finish_row(c, k + row, chain, imp, r, aref_pos);
    }
    return k + rows;
}
