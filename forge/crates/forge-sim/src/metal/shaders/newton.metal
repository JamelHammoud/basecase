inline void residual(Ctx c, thread Solver &sv, int x) {
    jac_mul(c, sv.nlive, x, JAREF);
    for (int k = 0; k < sv.nlive; k++) {
        S(JAREF, k) -= S(RAREF, k);
    }
}

inline void forces(Ctx c, thread Solver &sv) {
    jac_t_mul(c, sv.nlive, FORCE, QCON);
    for (int i = 0; i < NV; i++) {
        S(GRAD, i) = S(MA, i) - S(QSMOOTH, i) - S(QCON, i);
    }
}

inline void refresh(Ctx c, thread Solver &sv) {
    update_rows(c, sv, JAREF);
    forces(c, sv);
}

inline void hessian(Ctx c, thread Solver &sv) {
    if (sv.dirty) {
        for (int k = 0; k < NM; k++) {
            H(k) = S(MM, k).hi;
        }
        hessian_rows_f(c, sv.nlive);
        factor_f(c);
        sv.dirty = false;
        sv.factors++;
    }
    for (int i = 0; i < NV; i++) {
        S(MGRAD, i) = S(GRAD, i);
    }
    solve_f(c, MGRAD);
}

inline bool warmstart(Ctx c, thread Solver &sv) {
    residual(c, sv, QACCS);
    real smooth = update_rows(c, sv, JAREF);
    if (!WARMSTART) {
        for (int i = 0; i < NV; i++) {
            S(QACC, i) = S(QACCS, i);
        }
        return true;
    }
    residual(c, sv, WARM);
    real warm = update_rows(c, sv, JAREF);
    for (int i = 0; i < NV; i++) {
        S(TMP, i) = S(WARM, i) - S(QACCS, i);
    }
    mul_sym(c, MM, TMP, MV);
    warm += halve(dotv(c, TMP, MV));
    bool use_smooth = warm > smooth;
    for (int i = 0; i < NV; i++) {
        S(QACC, i) = use_smooth ? S(QACCS, i) : S(WARM, i);
    }
    return !use_smooth;
}

inline bool gradient_small(Ctx c, thread Solver &sv) { return dsqrt(dotv(c, GRAD, GRAD)) * sv.scale < TOLERANCE; }

inline bool decrement_small(Ctx c, thread Solver &sv) {
    return dmax(halve(dotv(c, GRAD, MGRAD) * sv.scale), Z()) < TOLERANCE;
}

inline bool start(Ctx c, thread Solver &sv, bool current) {
    mul_sym(c, MM, QACC, MA);
    if (current) {
        forces(c, sv);
    } else {
        residual(c, sv, QACC);
        refresh(c, sv);
    }
    real trace = Z();
    for (int i = 0; i < NV; i++) {
        trace += S(MM, diag_of(i));
    }
    sv.scale = D(1.0f) / dmax(trace, MIN_VAL);
    if (!gradient_small(c, sv)) {
        return false;
    }
    for (int i = 0; i < NV; i++) {
        S(MGRAD, i) = S(GRAD, i);
    }
    solve(c, LD, LDINV, MGRAD);
    return decrement_small(c, sv);
}

inline void advance(Ctx c, thread Solver &sv, real alpha) {
    for (int i = 0; i < NV; i++) {
        S(QACC, i) += alpha * S(DIR, i);
        S(MA, i) += alpha * S(MV, i);
    }
    for (int k = 0; k < sv.nlive; k++) {
        S(JAREF, k) += alpha * S(JV, k);
    }
}

inline int iterate(Ctx c, thread Solver &sv, bool done) {
    int iter = 0;
    while (!done && iter < ITERATIONS) {
        for (int i = 0; i < NV; i++) {
            S(DIR, i) = -S(MGRAD, i);
        }
        Outcome o = line_search(c, sv);
        done = o.alpha == Z();
        if (!done) {
            advance(c, sv, o.alpha);
        }
        refresh(c, sv);
        iter++;
        real improvement = o.improvement * sv.scale;
        done = done || (improvement > Z() && improvement < TOLERANCE) || gradient_small(c, sv);
        if (done) {
            break;
        }
        hessian(c, sv);
        done = decrement_small(c, sv);
    }
    return iter;
}

inline int solve_constraints(Ctx c, int nlive, uint upto) {
    Solver sv = Solver{Z(), Z(), Z(), nlive, true, 0, 0};
    for (int i = 0; i < NV; i++) {
        S(QCON, i) = Z();
    }
    if (nlive == 0) {
        for (int i = 0; i < NV; i++) {
            S(QACC, i) = S(QACCS, i);
        }
        return 0;
    }
    bool current = warmstart(c, sv);
    if (upto < 6) return 0;
    bool done = start(c, sv, current);
    if (upto < 7) return 0;
    if (!done) {
        hessian(c, sv);
        done = gradient_small(c, sv) && decrement_small(c, sv);
    }
    if (upto < 8) return 0;
    int it = iterate(c, sv, done);
    return it + 1000 * sv.evals + 1000000 * sv.factors;
}
