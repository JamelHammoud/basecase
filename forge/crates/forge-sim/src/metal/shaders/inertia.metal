inline d6 mul_inert_vec(d10 i, d6 v) {
    return d6{{(i.v[0] * v.v[0] + i.v[3] * v.v[1]) + (i.v[4] * v.v[2] - i.v[8] * v.v[4]) + i.v[7] * v.v[5],
               (i.v[3] * v.v[0] + i.v[1] * v.v[1]) + (i.v[5] * v.v[2] + i.v[8] * v.v[3]) - i.v[6] * v.v[5],
               (i.v[4] * v.v[0] + i.v[5] * v.v[1]) + (i.v[2] * v.v[2] - i.v[7] * v.v[3]) + i.v[6] * v.v[4],
               i.v[8] * v.v[1] - i.v[7] * v.v[2] + i.v[9] * v.v[3],
               i.v[6] * v.v[2] - i.v[8] * v.v[0] + i.v[9] * v.v[4],
               i.v[7] * v.v[0] - i.v[6] * v.v[1] + i.v[9] * v.v[5]}};
}

inline real dot6(d6 a, d6 b) {
    return ((a.v[0] * b.v[0] + a.v[1] * b.v[1]) + (a.v[2] * b.v[2] + a.v[3] * b.v[3]))
           + (a.v[4] * b.v[4] + a.v[5] * b.v[5]);
}

inline d6 cross_motion(d6 vel, d6 v) {
    return d6{{-vel.v[2] * v.v[1] + vel.v[1] * v.v[2], vel.v[2] * v.v[0] - vel.v[0] * v.v[2],
               -vel.v[1] * v.v[0] + vel.v[0] * v.v[1],
               -vel.v[2] * v.v[4] + vel.v[1] * v.v[5] + (-vel.v[5] * v.v[1] + vel.v[4] * v.v[2]),
               vel.v[2] * v.v[3] - vel.v[0] * v.v[5] + (vel.v[5] * v.v[0] - vel.v[3] * v.v[2]),
               -vel.v[1] * v.v[3] + vel.v[0] * v.v[4] + (-vel.v[4] * v.v[0] + vel.v[3] * v.v[1])}};
}

inline d6 cross_force(d6 vel, d6 f) {
    return d6{{-vel.v[2] * f.v[1] + vel.v[1] * f.v[2] + (-vel.v[5] * f.v[4] + vel.v[4] * f.v[5]),
               vel.v[2] * f.v[0] - vel.v[0] * f.v[2] + (vel.v[5] * f.v[3] - vel.v[3] * f.v[5]),
               -vel.v[1] * f.v[0] + vel.v[0] * f.v[1] + (-vel.v[4] * f.v[3] + vel.v[3] * f.v[4]),
               -vel.v[2] * f.v[4] + vel.v[1] * f.v[5], vel.v[2] * f.v[3] - vel.v[0] * f.v[5],
               -vel.v[1] * f.v[3] + vel.v[0] * f.v[4]}};
}

inline int diag_of(int i) { return M_ADR[i] + M_NNZ[i] - 1; }

inline void crb(Ctx c) {
    for (int k = 0; k < 10 * NBODY; k++) {
        S(CRB, k) = S(CINERT, k);
    }
    for (int i = NBODY - 1; i >= 1; i--) {
        int p = BODY_PARENT[i];
        if (p > 0) {
            for (int k = 0; k < 10; k++) {
                S(CRB, 10 * p + k) += S(CRB, 10 * i + k);
            }
        }
    }
    for (int k = 0; k < NM; k++) {
        S(MM, k) = Z();
    }
    for (int i = 0; i < NV; i++) {
        int adr = diag_of(i);
        d6 buf = mul_inert_vec(get10(c, CRB, DOF_BODY[i]), get6(c, CDOF, i));
        S(MM, adr) = DOF_ARMATURE[i];
        for (int j = i; j >= 0; j = DOF_PARENT[j]) {
            S(MM, adr) += dot6(get6(c, CDOF, j), buf);
            adr--;
        }
    }
}

inline void mul_sym(Ctx c, int mat, int x, int out) {
    for (int i = 0; i < NV; i++) {
        S(out, i) = S(mat, diag_of(i)) * S(x, i);
    }
    for (int i = 0; i < NV; i++) {
        real xi = S(x, i);
        dacc acc = A0();
        for (int a = M_ADR[i]; a < diag_of(i); a++) {
            real m = S(mat, a);
            acc += m * S(x, M_COL[a]);
            S(out, M_COL[a]) += m * xi;
        }
        S(out, i) += sum(acc);
    }
}

inline real dotv(Ctx c, int a, int b) {
    dacc s = A0();
    for (int i = 0; i < NV; i++) {
        s += S(a, i) * S(b, i);
    }
    return sum(s);
}

inline void factor_h(Ctx c) {
    for (int r = 0; r < NV; r++) {
        int k = NV - 1 - r;
        int start = M_ADR[k];
        int diag = diag_of(k);
        hreal d = H(diag);
        hreal pivot = d < to_h(MIN_VAL) ? to_h(MIN_VAL) : d;
        hreal inv = h_one() / pivot;
        H(diag) = pivot;
        H(NM + k) = inv;
        for (int u = FACT_OP[r]; u < FACT_OP[r + 1]; u++) {
            hreal s = H(UPD_ADR[u]) * inv;
            int target = UPD_TARGET[u];
            for (int t = 0; t < UPD_LEN[u]; t++) {
                H(target + t) -= H(start + t) * s;
            }
        }
        for (int a = start; a < diag; a++) {
            H(a) *= inv;
        }
    }
}

inline void solve_h(Ctx c, int x) {
    for (int i = NV - 1; i >= 0; i--) {
        hreal xi = to_h(S(x, i));
        for (int a = M_ADR[i]; a < diag_of(i); a++) {
            S(x, M_COL[a]) = from_h(to_h(S(x, M_COL[a])) - H(a) * xi);
        }
    }
    for (int i = 0; i < NV; i++) {
        S(x, i) = from_h(to_h(S(x, i)) * H(NM + i));
    }
    for (int i = 0; i < NV; i++) {
        hreal acc = to_h(Z());
        for (int a = M_ADR[i]; a < diag_of(i); a++) {
            acc += H(a) * to_h(S(x, M_COL[a]));
        }
        S(x, i) = from_h(to_h(S(x, i)) - acc);
    }
}

inline void load_h(Ctx c, int mat) {
    for (int k = 0; k < NM; k++) {
        H(k) = to_h(S(mat, k));
    }
}

inline void refined_solve(Ctx c, int b, int x, bool implicit) {
    for (int i = 0; i < NV; i++) {
        S(x, i) = S(b, i);
    }
    solve_h(c, x);
    if (H_DF) {
        return;
    }
    mul_sym(c, MM, x, MX);
    for (int i = 0; i < NV; i++) {
        real lhs = implicit ? S(MX, i) + S(DERIV, i) * (-DT) * S(x, i) : S(MX, i);
        S(RES, i) = S(b, i) - lhs;
    }
    solve_h(c, RES);
    for (int i = 0; i < NV; i++) {
        S(x, i) += S(RES, i);
    }
}
