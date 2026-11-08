struct Solver {
    real scale;
    real gauss1;
    real gauss2;
    int nlive;
    bool dirty;
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

inline void hessian_rows(Ctx c, int nlive) {
    for (int k = 0; k < NFRIC; k++) {
        H(diag_of(FRIC_DOF[k])) += to_h(S(QUADR, k) * FRIC_D[k]);
    }
    for (int k = NFRIC; k < nlive; k++) {
        if (S(QUADR, k) == Z()) {
            continue;
        }
        hreal weight = to_h(S(QUADR, k) * S(RD, k));
        int chain = N(RCHAIN, k);
        int n = CHAIN_LEN[chain];
        int at = HESS_ADR[chain];
        for (int a = 0; a < n; a++) {
            hreal wa = to_h(S(RJC, k * MAXCHAIN + a)) * weight;
            for (int b = 0; b <= a; b++) {
                H(HESS[at]) += wa * to_h(S(RJC, k * MAXCHAIN + b));
                at++;
            }
        }
    }
}
