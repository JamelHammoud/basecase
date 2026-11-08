struct Found {
    dist: real,
    pos: d3,
    tangent: d3,
}

struct Frames {
    plane_pos: d3,
    plane_mat: d9,
    pos: d3,
    rot: d9,
}

alias Founds = array<Found, 4>;

fn vert(v: i32) -> d3 {
    return d3(D(tf(VERT, 3 * v)), D(tf(VERT, 3 * v + 1)), D(tf(VERT, 3 * v + 2)));
}

fn axis_of(m: d9) -> d3 {
    return d3(m[2], m[5], m[8]);
}

fn plane_normal(f: Frames) -> d3 {
    return axis_of(f.plane_mat);
}

fn add_scaled(a: d3, b: d3, s: real) -> d3 {
    return add3(a, scl3(b, s));
}

fn at_point(pos: d3, dist: real, normal: d3) -> Found {
    return Found(dist, add_scaled(pos, normal, -halve(dist)), zero3());
}

fn exhaustive(m: i32, dir: d3) -> i32 {
    var best = D(-3.4028235e38);
    var index = 0;
    for (var i = 0; i < ti(MESH_VNUM, m); i++) {
        let d = dot3(dir, vert(ti(MESH_VADR, m) + i));
        if (gt(d, best)) {
            best = d;
            index = i;
        }
    }
    return index;
}

fn grid(x: real) -> i32 {
    return select(1, 2, gt(x, D(0.4))) - select(0, 1, lt(x, D(-0.4)));
}

fn hill_climb(m: i32, dir: d3) -> i32 {
    let base = ti(CLIMB_ADR, m);
    let vadr = ti(MESH_VADR, m);
    var imax = ti(CLIMB_EXTREMA, 27 * m + grid(dir[0]) * 9 + grid(dir[1]) * 3 + grid(dir[2]));
    var best = dot3(dir, vert(vadr + ti(CLIMB_VERTEX, base + imax)));
    var prev = -1;
    while (imax != prev) {
        prev = imax;
        let first = ti(CLIMB_NADR, base + prev);
        for (var a = first; a < first + ti(CLIMB_NNUM, base + prev); a++) {
            let n = ti(CLIMB_NB, a);
            let d = dot3(dir, vert(vadr + ti(CLIMB_VERTEX, base + n)));
            if (gt(d, best)) {
                best = d;
                imax = n;
            }
        }
    }
    return ti(CLIMB_VERTEX, base + imax);
}

fn face_vert(vadr: i32, face: i32, k: i32) -> d3 {
    return vert(vadr + ti(FACE_V, ti(FACE_VADR, face) + k));
}

fn area4(vadr: i32, face: i32, q: vec4<i32>) -> real {
    let ca = sub3(face_vert(vadr, face, q.x), face_vert(vadr, face, q.z));
    let db = sub3(face_vert(vadr, face, q.y), face_vert(vadr, face, q.w));
    let x = cross3(ca, db);
    return halve(dsqrt(dot3(x, x)));
}

fn grow(vadr: i32, face: i32, q: ptr<function, vec4<i32>>, slot: i32, best: ptr<function, real>) -> bool {
    let n = ti(FACE_VNUM, face);
    var moved = false;
    loop {
        var next = *q;
        next[slot] = ((*q)[slot] + 1) % n;
        let area = area4(vadr, face, next);
        if (le(area, *best)) {
            break;
        }
        *q = next;
        *best = area;
        moved = true;
        if (slot == 3) {
            break;
        }
    }
    return moved;
}

fn hull4(vadr: i32, face: i32, a: i32, q: ptr<function, vec4<i32>>) -> i32 {
    let n = ti(FACE_VNUM, face);
    *q = vec4<i32>(a, (a + 1) % n, (a + 2) % n, (a + 3) % n);
    if (n <= 4) {
        return n;
    }
    var best = area4(vadr, face, *q);
    while (grow(vadr, face, q, 3, &best)) {
        grow(vadr, face, q, 2, &best);
        grow(vadr, face, q, 1, &best);
    }
    return 4;
}

fn best_face(vtx: i32, local_normal: d3) -> i32 {
    var best = -1;
    var best_dot = D(1.0);
    let first = ti(VF_ADR, vtx);
    for (var a = first; a < first + ti(VF_NUM, vtx); a++) {
        let f = ti(VF, a);
        let d = dot3(c3(FACE_NORMAL, f), local_normal);
        if (lt(d, best_dot)) {
            best_dot = d;
            best = f;
        }
    }
    return best;
}

fn to_global(f: Frames, v: i32) -> d3 {
    return add3(mat_vec(f.rot, vert(v)), f.pos);
}

fn anchor_of(face: i32, vtx: i32) -> i32 {
    var anchor = 0;
    for (var k = ti(FACE_VNUM, face) - 1; k >= 0; k--) {
        anchor = select(anchor, k, ti(FACE_V, ti(FACE_VADR, face) + k) == vtx);
    }
    return anchor;
}

fn plane_convex(m: i32, f: Frames, margin: real, out: ptr<function, Founds>) -> i32 {
    let normal = plane_normal(f);
    let local_dir = mat_t_vec(f.rot, scl3(normal, D(-1.0)));
    let vadr = ti(MESH_VADR, m);
    var vtx = 0;
    if (ti(CLIMB_ADR, m) >= 0) {
        vtx = hill_climb(m, local_dir);
    } else {
        vtx = exhaustive(m, local_dir);
    }
    let v = to_global(f, vadr + vtx);
    let dist = dot3(normal, sub3(v, f.plane_pos));
    if (gt(dist, margin)) {
        return 0;
    }
    (*out)[0] = at_point(v, dist, normal);
    var face = -1;
    if (ti(MESH_FNUM, m) > 0) {
        face = best_face(vadr + vtx, mat_t_vec(f.rot, normal));
    }
    if (face < 0) {
        return 1;
    }
    var q: vec4<i32>;
    let nq = hull4(vadr, face, anchor_of(face, vtx), &q);
    var count = 1;
    for (var k = 1; k < nq; k++) {
        let p = to_global(f, vadr + ti(FACE_V, ti(FACE_VADR, face) + q[k]));
        let d = dot3(normal, sub3(p, f.plane_pos));
        if (gt(d, margin) || gt(dot3(normal, sub3(p, f.pos)), Z())) {
            continue;
        }
        (*out)[count] = at_point(p, d, normal);
        count++;
    }
    return count;
}
