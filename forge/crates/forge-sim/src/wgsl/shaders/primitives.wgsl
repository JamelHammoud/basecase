fn sphere_at(f: Frames, center: d3, radius: real, margin: real, out: ptr<function, Found>) -> bool {
    let normal = plane_normal(f);
    let cdist = dot3(sub3(center, f.plane_pos), normal);
    if (gt(cdist, ad(margin, radius))) {
        return false;
    }
    let dist = sb(cdist, radius);
    *out = Found(dist, add_scaled(center, normal, sb(-halve(dist), radius)), zero3());
    return true;
}

fn plane_sphere(f: Frames, size: d3, margin: real, out: ptr<function, Founds>) -> i32 {
    var c: Found;
    if (!sphere_at(f, f.pos, size[0], margin, &c)) {
        return 0;
    }
    (*out)[0] = c;
    return 1;
}

fn plane_capsule(f: Frames, size: d3, margin: real, out: ptr<function, Founds>) -> i32 {
    let a = axis_of(f.rot);
    let ends = array<d3, 2>(add_scaled(f.pos, a, size[1]), add_scaled(f.pos, a, -size[1]));
    var n = 0;
    for (var e = 0; e < 2; e++) {
        var c: Found;
        if (sphere_at(f, ends[e], size[0], margin, &c)) {
            c.tangent = a;
            (*out)[n] = c;
            n++;
        }
    }
    return n;
}

fn rim(f: Frames, radius: real, normal: d3, prjaxis: real, ax: d3) -> d3 {
    let v = sub3(scl3(ax, prjaxis), normal);
    let len_sqr = dot3(v, v);
    if (ge(len_sqr, ml(MIN_VAL, MIN_VAL))) {
        return scl3(v, dv(radius, dsqrt(len_sqr)));
    }
    return d3(ml(f.rot[0], radius), ml(f.rot[3], radius), ml(f.rot[6], radius));
}

fn normalized(v: d3) -> d3 {
    let n = dsqrt(dot3(v, v));
    if (lt(n, MIN_VAL)) {
        return d3(D(1.0), Z(), Z());
    }
    return d3(dv(v[0], n), dv(v[1], n), dv(v[2], n));
}

fn plane_cylinder(f: Frames, size: d3, margin: real, out: ptr<function, Founds>) -> i32 {
    let normal = plane_normal(f);
    var ax = axis_of(f.rot);
    var prjaxis = dot3(normal, ax);
    if (gt(prjaxis, Z())) {
        ax = scl3(ax, D(-1.0));
        prjaxis = -prjaxis;
    }
    let dist0 = dot3(sub3(f.pos, f.plane_pos), normal);
    let rv = rim(f, size[0], normal, prjaxis, ax);
    let prjvec = dot3(rv, normal);
    let axis = scl3(ax, size[1]);
    let prj = ml(prjaxis, size[1]);
    let base = add3(f.pos, rv);
    let top = ad(ad(dist0, prj), prjvec);
    if (gt(top, margin)) {
        return 0;
    }
    (*out)[0] = at_point(add3(base, axis), top, normal);
    var n = 1;
    let bottom = ad(sb(dist0, prj), prjvec);
    if (le(bottom, margin)) {
        (*out)[n] = at_point(sub3(base, axis), bottom, normal);
        n++;
    }
    let prjvec1 = halve(-prjvec);
    let dist = ad(ad(dist0, prj), prjvec1);
    if (le(dist, margin)) {
        let side = scl3(normalized(cross3(rv, axis)), ml(size[0], SQRT3_HALF));
        let center = add_scaled(add3(f.pos, axis), rv, D(-0.5));
        (*out)[n] = at_point(add3(center, side), dist, normal);
        (*out)[n + 1] = at_point(sub3(center, side), dist, normal);
        n += 2;
    }
    return n;
}

fn box_corner(size: d3, i: i32) -> d3 {
    return d3(select(-size[0], size[0], (i & 1) != 0), select(-size[1], size[1], (i & 2) != 0),
              select(-size[2], size[2], (i & 4) != 0));
}

fn plane_box(f: Frames, size: d3, margin: real, out: ptr<function, Founds>) -> i32 {
    let normal = plane_normal(f);
    let dist = dot3(sub3(f.pos, f.plane_pos), normal);
    var n = 0;
    for (var i = 0; i < 8; i++) {
        let corner = mat_vec(f.rot, box_corner(size, i));
        let ldist = dot3(normal, corner);
        if (gt(ad(dist, ldist), margin) || gt(ldist, Z())) {
            continue;
        }
        (*out)[n] = at_point(add3(corner, f.pos), ad(dist, ldist), normal);
        n++;
        if (n >= 4) {
            return 4;
        }
    }
    return n;
}
