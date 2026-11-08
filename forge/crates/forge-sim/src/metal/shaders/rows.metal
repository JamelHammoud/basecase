struct Solver {
    real scale;
    real gauss1;
    real gauss2;
    int nlive;
    bool dirty;
    int evals;
    int factors;
};

inline void set_quadratic(Ctx c, thread Solver &sv, int k, bool on) {
    real value = on ? D(1.0f) : Z();
    sv.dirty = sv.dirty || S(QUADR, k) != value;
    S(QUADR, k) = value;
}

#define J(k, d) S(RJAC, (k) * NV + (d))

inline real row_dot(Ctx c, int k, int x) {
    dacc s = A0();
    for (int d = 0; d < NV; d++) {
        s += J(k, d) * S(x, d);
    }
    return sum(s);
}

inline void jac_mul(Ctx c, int nlive, int x, int out) {
    for (int k = 0; k < NFRIC; k++) {
        S(out, k) = S(x, FRIC_DOF[k]);
    }
    for (int k = NFRIC; k < nlive; k++) {
        S(out, k) = row_dot(c, k, x);
    }
}

inline void jac_t_mul(Ctx c, int nlive, int force, int out) {
    for (int i = 0; i < NV; i++) {
        S(out, i) = Z();
    }
    for (int k = 0; k < NFRIC; k++) {
        S(out, FRIC_DOF[k]) += S(force, k);
    }
    for (int k = NFRIC; k < nlive; k++) {
        int chain = N(RCHAIN, k);
        int adr = CHAIN_ADR[chain];
        real f = S(force, k);
        for (int t = 0; t < CHAIN_LEN[chain]; t++) {
            S(out, CHAIN_DOF[adr + t]) += S(RJC, k * MAXCHAIN + t) * f;
        }
    }
}

inline real update_rows(Ctx c, thread Solver &sv, int jar) {
    int nlive = sv.nlive;
    dacc cost = A0();
    for (int k = 0; k < NFRIC; k++) {
        real d = FRIC_D[k], x = S(jar, k), f = FRIC_LOSS[k], r = FRIC_R[k];
        real rf = r * f;
        bool neg = x <= -rf;
        bool pos = x >= rf;
        bool linear = neg || pos;
        real lin_cost = -(halve(r * f * f)) + (neg ? -(f * x) : f * x);
        cost += linear ? lin_cost : halve(d * x * x);
        S(FORCE, k) = neg ? f : (pos ? -f : -(d * x));
        set_quadratic(c, sv, k, !linear);
    }
    for (int k = NFRIC; k < nlive; k++) {
        real d = S(RD, k), x = S(jar, k);
        bool satisfied = x >= Z();
        cost += satisfied ? Z() : halve(d * x * x);
        S(FORCE, k) = satisfied ? Z() : -(d * x);
        set_quadratic(c, sv, k, !satisfied);
    }
    return sum(cost);
}

inline void add_hessian_row(Ctx c, int k, real weight) {
    int chain = N(RCHAIN, k);
    int n = CHAIN_LEN[chain];
    int at = HESS_ADR[chain];
    for (int a = 0; a < n; a++) {
        real wa = S(RJC, k * MAXCHAIN + a) * weight;
        for (int b = 0; b <= a; b++) {
            S(HM, HESS[at]) += wa * S(RJC, k * MAXCHAIN + b);
            at++;
        }
    }
}

inline void hessian_rows(Ctx c, int nlive) {
    for (int k = 0; k < NFRIC; k++) {
        S(HM, diag_of(FRIC_DOF[k])) += S(QUADR, k) * FRIC_D[k];
    }
    for (int k = NFRIC; k < nlive; k++) {
        if (S(QUADR, k) == Z()) {
            continue;
        }
        add_hessian_row(c, k, S(QUADR, k) * S(RD, k));
    }
}

inline void hessian_rows_f(Ctx c, int nlive) {
    for (int k = 0; k < NFRIC; k++) {
        H(diag_of(FRIC_DOF[k])) += (S(QUADR, k) * FRIC_D[k]).hi;
    }
    for (int k = NFRIC; k < nlive; k++) {
        if (S(QUADR, k) == Z()) {
            continue;
        }
        float weight = (S(QUADR, k) * S(RD, k)).hi;
        int chain = N(RCHAIN, k);
        int n = CHAIN_LEN[chain];
        int at = HESS_ADR[chain];
        for (int a = 0; a < n; a++) {
            float wa = S(RJC, k * MAXCHAIN + a).hi * weight;
            for (int b = 0; b <= a; b++) {
                H(HESS[at]) += wa * S(RJC, k * MAXCHAIN + b).hi;
                at++;
            }
        }
    }
}

inline void factor_f(Ctx c) {
    for (int r = 0; r < NV; r++) {
        int k = NV - 1 - r;
        int start = M_ADR[k];
        int diag = diag_of(k);
        float d = H(diag);
        float pivot = d < 1e-15f ? 1e-15f : d;
        float inv = 1.0f / pivot;
        H(diag) = pivot;
        H(NM + k) = inv;
        for (int u = FACT_OP[r]; u < FACT_OP[r + 1]; u++) {
            float s = H(UPD_ADR[u]) * inv;
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

inline void solve_f(Ctx c, int x) {
    for (int i = NV - 1; i >= 0; i--) {
        float xi = S(x, i).hi;
        for (int a = M_ADR[i]; a < diag_of(i); a++) {
            S(x, M_COL[a]) = D(S(x, M_COL[a]).hi - H(a) * xi);
        }
    }
    for (int i = 0; i < NV; i++) {
        S(x, i) = D(S(x, i).hi * H(NM + i));
    }
    for (int i = 0; i < NV; i++) {
        float acc = 0.0f;
        for (int a = M_ADR[i]; a < diag_of(i); a++) {
            acc += H(a) * S(x, M_COL[a]).hi;
        }
        S(x, i) = D(S(x, i).hi - acc);
    }
}
