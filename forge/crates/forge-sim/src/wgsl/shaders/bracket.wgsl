fn best_of(cands: array<Pnt, 3>, gtol: real, best: ptr<function, Pnt>) -> bool {
    var found = false;
    *best = cands[0];
    for (var i = 0; i < 3; i++) {
        if (better_candidate(cands[i], gtol, found, *best)) {
            *best = cands[i];
            found = true;
        }
    }
    return found;
}

fn bracketed(sv: ptr<function, Solver>, first: Pnt, second: Pnt, gtol: real, start: i32) -> Outcome {
    var p1 = first;
    var p2 = second;
    var count = start;
    var p2next = p1;
    var p1next = eval_at(sv, next_alpha(p1));
    count++;
    while (count < LS_ITERATIONS) {
        let pmid = eval_at(sv, halve(ad(p1.alpha, p2.alpha)));
        count++;
        let cands = array<Pnt, 3>(p1next, p2next, pmid);
        var best: Pnt;
        if (best_of(cands, gtol, &best)) {
            return found_at(best);
        }
        let b1 = update_bracket(&p1, cands);
        if (b1) {
            p1next = eval_at(sv, next_alpha(p1));
            count++;
        }
        let b2 = update_bracket(&p2, cands);
        if (b2) {
            p2next = eval_at(sv, next_alpha(p2));
            count++;
        }
        if (!b1 && !b2) {
            return found_at(pmid);
        }
    }
    if (le(p1.cost, p2.cost) && lt(p1.cost, Z())) {
        return found_at(p1);
    }
    if (le(p2.cost, p1.cost) && lt(p2.cost, Z())) {
        return found_at(p2);
    }
    return Outcome(Z(), Z());
}

fn line_search(sv: ptr<function, Solver>) -> Outcome {
    let step_norm = dsqrt(dotv(DIR, DIR));
    if (lt(step_norm, MIN_VAL)) {
        return Outcome(Z(), Z());
    }
    let gtol = dv(ml(step_norm, TOL_LS), (*sv).scale);
    mul_sym(MM, DIR, MV);
    jac_mul((*sv).nlive, DIR, JV);
    prepare(sv);
    let p0 = eval_at(sv, Z());
    var p1 = eval_at(sv, next_alpha(p0));
    var count = 2;
    if (lt(dabs(p1.d0), gtol) && (eqd(p1.alpha, Z()) || lt(p1.cost, Z()))) {
        return found_at(p1);
    }
    let dir = select(D(-1.0), D(1.0), lt(p1.d0, Z()));
    var p2 = p0;
    while (le(ml(p1.d0, dir), -gtol) && count < LS_ITERATIONS) {
        p2 = p1;
        p1 = eval_at(sv, next_alpha(p1));
        count++;
        if (lt(dabs(p1.d0), gtol) && lt(p1.cost, Z())) {
            return found_at(p1);
        }
    }
    if (count >= LS_ITERATIONS) {
        return found_at(p1);
    }
    return bracketed(sv, p1, p2, gtol, count);
}
