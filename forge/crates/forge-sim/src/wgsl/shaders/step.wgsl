fn detect(pair: i32, f: Frames, out: ptr<function, Founds>) -> i32 {
    let g = ti(PAIR_G2, pair);
    let size = c3(GEOM_SIZE, g);
    let margin = tr(PAIR_REACH, pair);
    switch ti(PAIR_COLLIDER, pair) {
        case COLLIDER_CONVEX: {
            return plane_convex(ti(GEOM_MESH, g), f, margin, out);
        }
        case COLLIDER_SPHERE: {
            return plane_sphere(f, size, margin, out);
        }
        case COLLIDER_CAPSULE: {
            return plane_capsule(f, size, margin, out);
        }
        case COLLIDER_CYLINDER: {
            return plane_cylinder(f, size, margin, out);
        }
        default: {
            return plane_box(f, size, margin, out);
        }
    }
}

fn keep_contact(at: i32, slot: i32, found: Found, normal: d3) {
    np(CSLOT + at, slot);
    sp(CDIST + at, found.dist);
    p3(CPOS, at, found.pos);
    p3(CTAN, at, found.tangent);
    p3(CNOR, at, normal);
}

fn collide(ncon: ptr<function, i32>) -> i32 {
    var kept = 0;
    *ncon = 0;
    for (var p = 0; p < NPAIR; p++) {
        let g1 = ti(PAIR_G1, p);
        let g2 = ti(PAIR_G2, p);
        let f = Frames(g3(GXPOS, g1), g9(GXMAT, g1), g3(GXPOS, g2), g9(GXMAT, g2));
        var found: Founds;
        let n = detect(p, f, &found);
        *ncon += n;
        for (var i = 0; i < n; i++) {
            let slot = ti(PAIR_SLOT0, p) + i;
            if (lt(found[i].dist, tr(SLOT_MARGIN, slot))) {
                keep_contact(kept, slot, found[i], plane_normal(f));
                kept++;
            }
        }
    }
    return kept;
}

fn assemble(ncon: ptr<function, i32>) -> i32 {
    friction_rows();
    var k = limit_rows(NFRIC);
    let kept = collide(ncon);
    for (var i = 0; i < kept; i++) {
        let found = Found(sg(CDIST + i), g3(CPOS, i), g3(CTAN, i));
        k = contact_rows(ng(CSLOT + i), found, g3(CNOR, i), k);
    }
    return k;
}

fn forward_upto(ncon: ptr<function, i32>, upto: u32) -> i32 {
    kinematics();
    com_pos();
    if (upto < 2u) {
        return 0;
    }
    crb();
    load_h(MM);
    factor_h();
    if (upto < 3u) {
        return 0;
    }
    let nlive = assemble(ncon);
    if (upto < 4u) {
        return 0;
    }
    com_vel();
    passive();
    rne();
    actuation();
    for (var i = 0; i < NV; i++) {
        sp(QSMOOTH + i, ad(sb(sg(QPASSIVE + i), sg(QBIAS + i)), sg(QACT + i)));
    }
    refined_solve(QSMOOTH, QACCS, false);
    if (upto < 5u) {
        return 0;
    }
    return solve_constraints(nlive, upto);
}

fn integrate_free(p: i32, v: i32) {
    for (var i = 0; i < 3; i++) {
        sa(QPOS + p + i, ml(sg(QVEL + v + i), DT));
    }
    var speed: real;
    let axis = normalize3(d3(sg(QVEL + v + 3), sg(QVEL + v + 4), sg(QVEL + v + 5)), &speed);
    let rot = axis_angle_quat(axis, ml(speed, DT));
    let quat = normalize4(d4(sg(QPOS + p + 3), sg(QPOS + p + 4), sg(QPOS + p + 5), sg(QPOS + p + 6)));
    p4(QPOS + p + 3, 0, mul_quat(quat, rot));
}

fn integrate_positions() {
    for (var j = 0; j < NJNT; j++) {
        let p = ti(JNT_QPOSADR, j);
        let v = ti(JNT_DOFADR, j);
        if (ti(JNT_KIND, j) != KIND_FREE) {
            sa(QPOS + p, ml(sg(QVEL + v), DT));
        } else {
            integrate_free(p, v);
        }
    }
}

fn velocity_derivative() {
    for (var d = 0; d < NV; d++) {
        sp(DERIV + d, Z());
    }
    for (var a = 0; a < NU; a++) {
        let b2 = sg(TBIAS + 3 * a + 2);
        if (eqd(b2, Z())) {
            continue;
        }
        let f = sg(ACTF + a);
        let on = !tb(ACT_FORCE_LIMITED, a) || (gt(f, tr(ACT_FORCE_LO, a)) && lt(f, tr(ACT_FORCE_HI, a)));
        if (on) {
            let gear = sg(TGEAR + a);
            sa(DERIV + ti(ACT_DOF, a), ml(b2, ml(gear, gear)));
        } else {
            sa(DERIV + ti(ACT_DOF, a), Z());
        }
    }
    for (var d = 0; d < NV; d++) {
        sp(DERIV + d, sb(sg(DERIV + d), tr(DOF_DAMPING, d)));
    }
}

fn implicit_step() {
    velocity_derivative();
    load_h(MM);
    for (var i = 0; i < NV; i++) {
        let at = diag_of(i);
        hs(at, ad(sg(MM + at), ml(sg(DERIV + i), -DT)).x);
        sp(RHS + i, ad(sg(QSMOOTH + i), sg(QCON + i)));
    }
    factor_h();
    refined_solve(RHS, IACC, true);
    record_ctrl();
    for (var i = 0; i < NV; i++) {
        sa(QVEL + i, ml(sg(IACC + i), DT));
    }
    integrate_positions();
    sa(TIME, DT);
    for (var i = 0; i < NV; i++) {
        sp(WARM + i, sg(QACC + i));
    }
}

fn load_world(world: u32) {
    for (var i = 0; i < NSTATE; i++) {
        sp(i, IO[world * u32(NSTATE) + u32(i)]);
    }
}

fn store_world(world: u32) {
    for (var i = 0; i < NSTATE; i++) {
        IO[world * u32(NSTATE) + u32(i)] = sg(i);
    }
}

@compute @workgroup_size(BLOCKU)
fn step_worlds(@builtin(global_invocation_id) id: vec3<u32>) {
    let t = id.x;
    if (t >= P.worlds) {
        return;
    }
    enter(t);
    let world = ORDER[t];
    load_world(world);
    var ncon = 0;
    var work = 0;
    for (var i = 0u; i < P.nstep; i++) {
        work += forward_upto(&ncon, 9u);
        implicit_step();
    }
    store_world(world);
    STATS[2u * world] = ncon;
    STATS[2u * world + 1u] = work;
}

@compute @workgroup_size(BLOCKU)
fn forward_worlds(@builtin(global_invocation_id) id: vec3<u32>) {
    let t = id.x;
    if (t >= P.worlds) {
        return;
    }
    enter(t);
    let world = ORDER[t];
    load_world(world);
    var ncon = 0;
    STATS[2u * world + 1u] = forward_upto(&ncon, 9u);
    STATS[2u * world] = ncon;
}

@compute @workgroup_size(BLOCKU)
fn profile_worlds(@builtin(global_invocation_id) id: vec3<u32>) {
    let t = id.x;
    if (t >= P.worlds) {
        return;
    }
    enter(t);
    let world = ORDER[t];
    load_world(world);
    var ncon = 0;
    var work = 0;
    for (var i = 0u; i < P.nstep; i++) {
        work += forward_upto(&ncon, P.upto);
        if (P.upto >= 9u) {
            implicit_step();
        }
    }
    STATS[2u * world + 1u] = work;
}
