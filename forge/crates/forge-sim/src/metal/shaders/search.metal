struct Pnt {
    real alpha;
    real cost;
    real d0;
    real d1;
};

inline real next_alpha(Pnt p) { return p.alpha - p.d0 / p.d1; }

inline void zones(real x, real rf, thread bool &quad, thread bool &neg) {
    quad = rf > -x && x < rf;
    neg = x <= -rf;
}

inline real friction_cost(real x, int k, bool quad, bool neg) {
    real f = FRIC_LOSS[k];
    real h = halve(FRIC_RF[k]);
    return quad ? halve(FRIC_D[k] * x * x) : (neg ? f * (-h - x) : f * (-h + x));
}

inline void prepare(Ctx c, thread Solver &sv) {
    sv.gauss1 = dotv(c, DIR, MA) - dotv(c, QSMOOTH, DIR);
    sv.gauss2 = halve(dotv(c, DIR, MV));
    for (int k = 0; k < NFRIC; k++) {
        real start = S(JAREF, k);
        bool quad, neg;
        zones(start, FRIC_RF[k], quad, neg);
        S(FRC, k) = friction_cost(start, k, quad, neg);
        N(FRZ, k) = quad ? 0 : (neg ? 1 : 2);
    }
    for (int k = NFRIC; k < sv.nlive; k++) {
        real jv = S(JV, k), ja = S(JAREF, k), d = S(RD, k);
        real dj = d * ja;
        S(QUAD, 3 * k) = halve(ja * dj);
        S(QUAD, 3 * k + 1) = jv * dj;
        S(QUAD, 3 * k + 2) = halve(jv * d * jv);
    }
}

inline void friction_terms(Ctx c, int k, real alpha, thread dacc &cost, thread dacc &d0, thread dacc &d1) {
    real start = S(JAREF, k), dir = S(JV, k), f = FRIC_LOSS[k], d = FRIC_D[k];
    real x = start + alpha * dir;
    bool quad, neg;
    zones(x, FRIC_RF[k], quad, neg);
    bool pos = !(quad || neg);
    int zone = N(FRZ, k);
    real general = friction_cost(x, k, quad, neg) - S(FRC, k);
    real value = general;
    if (quad && zone == 0) {
        value = halve(d * (x - start) * (x + start));
    } else if (neg && zone == 1) {
        value = f * (start - x);
    } else if (pos && zone == 2) {
        value = f * (x - start);
    }
    real fdir = f * dir;
    cost += value;
    d0 += quad ? d * x * dir : (neg ? -fdir : fdir);
    if (quad) {
        d1 += d * dir * dir;
    }
}

inline Pnt eval_at(Ctx c, thread Solver &sv, real alpha) {
    dacc ca = A0(), da = A0(), ea = A0();
    dacc qa = A0(), qb = A0(), qc = A0();
    for (int k = 0; k < NFRIC; k++) {
        friction_terms(c, k, alpha, ca, da, ea);
    }
    for (int k = NFRIC; k < sv.nlive; k++) {
        real start = S(JAREF, k);
        real x = start + alpha * S(JV, k);
        real a = S(QUAD, 3 * k);
        real cost0 = start < Z() ? a : Z();
        if (x < Z()) {
            qa += a - cost0;
            qb += S(QUAD, 3 * k + 1);
            qc += S(QUAD, 3 * k + 2);
        } else {
            ca -= cost0;
        }
    }
    real q0 = sum(qa), q1 = sv.gauss1 + sum(qb), q2 = sv.gauss2 + sum(qc);
    real cost = sum(ca), d0 = sum(da), d1 = sum(ea);
    cost += alpha * alpha * q2 + alpha * q1 + q0;
    d0 += mul2(alpha * q2) + q1;
    d1 += mul2(q2);
    d1 = d1 <= Z() ? MIN_VAL : d1;
    return Pnt{alpha, cost, d0, d1};
}

struct Outcome {
    real alpha;
    real improvement;
};

inline Outcome found_at(Pnt p) { return Outcome{p.alpha, -p.cost}; }

inline bool better_candidate(Pnt cand, real gtol, bool found, Pnt best) {
    return dabs(cand.d0) < gtol && (!found || cand.cost < best.cost);
}

inline bool tighten(thread Pnt &p, Pnt cand) {
    bool neg = p.d0 < Z() && cand.d0 < Z() && p.d0 < cand.d0;
    bool pos = p.d0 > Z() && cand.d0 > Z() && p.d0 > cand.d0;
    if (neg || pos) {
        p = cand;
    }
    return neg || pos;
}

inline bool update_bracket(thread Pnt &p, Pnt a, Pnt b, Pnt m) {
    bool f1 = tighten(p, a);
    bool f2 = tighten(p, b);
    bool f3 = tighten(p, m);
    return f1 || f2 || f3;
}

inline Outcome bracketed(Ctx c, thread Solver &sv, Pnt p1, Pnt p2, real gtol, int count) {
    Pnt p2next = p1;
    Pnt p1next = eval_at(c, sv, next_alpha(p1));
    count++;
    while (count < LS_ITERATIONS) {
        Pnt pmid = eval_at(c, sv, halve(p1.alpha + p2.alpha));
        count++;
        Pnt cands[3] = {p1next, p2next, pmid};
        bool found = false;
        Pnt best = cands[0];
        for (int i = 0; i < 3; i++) {
            if (better_candidate(cands[i], gtol, found, best)) {
                best = cands[i];
                found = true;
            }
        }
        if (found) {
            return found_at(best);
        }
        bool b1 = update_bracket(p1, cands[0], cands[1], cands[2]);
        if (b1) {
            p1next = eval_at(c, sv, next_alpha(p1));
            count++;
        }
        bool b2 = update_bracket(p2, cands[0], cands[1], cands[2]);
        if (b2) {
            p2next = eval_at(c, sv, next_alpha(p2));
            count++;
        }
        if (!b1 && !b2) {
            return found_at(pmid);
        }
    }
    if (p1.cost <= p2.cost && p1.cost < Z()) {
        return found_at(p1);
    }
    if (p2.cost <= p1.cost && p2.cost < Z()) {
        return found_at(p2);
    }
    return Outcome{Z(), Z()};
}

inline Outcome line_search(Ctx c, thread Solver &sv) {
    real snorm = dsqrt(dotv(c, DIR, DIR));
    if (snorm < MIN_VAL) {
        return Outcome{Z(), Z()};
    }
    real gtol = snorm * TOL_LS / sv.scale;
    mul_sym(c, MM, DIR, MV);
    jac_mul(c, sv.nlive, DIR, JV);
    prepare(c, sv);
    Pnt p0 = eval_at(c, sv, Z());
    Pnt p1 = eval_at(c, sv, next_alpha(p0));
    int count = 2;
    if (dabs(p1.d0) < gtol && (p1.alpha == Z() || p1.cost < Z())) {
        return found_at(p1);
    }
    real dir = p1.d0 < Z() ? D(1.0f) : D(-1.0f);
    Pnt p2 = p0;
    while ((p1.d0 * dir) <= -gtol && count < LS_ITERATIONS) {
        p2 = p1;
        p1 = eval_at(c, sv, next_alpha(p1));
        count++;
        if (dabs(p1.d0) < gtol && p1.cost < Z()) {
            return found_at(p1);
        }
    }
    if (count >= LS_ITERATIONS) {
        return found_at(p1);
    }
    return bracketed(c, sv, p1, p2, gtol, count);
}
