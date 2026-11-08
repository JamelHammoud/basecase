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

inline void factor(Ctx c, int mat, int dinv) {
    for (int r = 0; r < NV; r++) {
        int k = NV - 1 - r;
        int start = M_ADR[k];
        int diag = diag_of(k);
        real d = S(mat, diag);
        real pivot = d < MIN_VAL ? MIN_VAL : d;
        real inv = D(1.0f) / pivot;
        S(mat, diag) = pivot;
        S(dinv, k) = inv;
        for (int u = FACT_OP[r]; u < FACT_OP[r + 1]; u++) {
            real s = S(mat, UPD_ADR[u]) * inv;
            int target = UPD_TARGET[u];
            for (int t = 0; t < UPD_LEN[u]; t++) {
                S(mat, target + t) -= S(mat, start + t) * s;
            }
        }
        for (int a = start; a < diag; a++) {
            S(mat, a) = S(mat, a) * inv;
        }
    }
}

inline void solve(Ctx c, int ld, int dinv, int x) {
    for (int i = NV - 1; i >= 0; i--) {
        real xi = S(x, i);
        for (int a = M_ADR[i]; a < diag_of(i); a++) {
            S(x, M_COL[a]) -= S(ld, a) * xi;
        }
    }
    for (int i = 0; i < NV; i++) {
        S(x, i) = S(x, i) * S(dinv, i);
    }
    for (int i = 0; i < NV; i++) {
        dacc acc = A0();
        for (int a = M_ADR[i]; a < diag_of(i); a++) {
            acc += S(ld, a) * S(x, M_COL[a]);
        }
        S(x, i) -= sum(acc);
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
