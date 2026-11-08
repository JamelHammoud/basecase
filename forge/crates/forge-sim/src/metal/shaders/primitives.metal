inline bool sphere_at(Frames f, d3 center, real radius, real margin, thread Found &out) {
    d3 normal = plane_normal(f);
    real cdist = dot3(sub3(center, f.plane_pos), normal);
    if (cdist > margin + radius) {
        return false;
    }
    real dist = cdist - radius;
    out = Found{dist, add_scaled(center, normal, -halve(dist) - radius), zero3()};
    return true;
}

inline int plane_sphere(Frames f, d3 size, real margin, thread Found *out) {
    return sphere_at(f, f.pos, size.v[0], margin, out[0]) ? 1 : 0;
}

inline int plane_capsule(Frames f, d3 size, real margin, thread Found *out) {
    d3 a = axis_of(f.mat);
    d3 ends[2] = {add_scaled(f.pos, a, size.v[1]), add_scaled(f.pos, a, -size.v[1])};
    int n = 0;
    for (int e = 0; e < 2; e++) {
        Found c;
        if (sphere_at(f, ends[e], size.v[0], margin, c)) {
            c.tangent = a;
            out[n] = c;
            n++;
        }
    }
    return n;
}

inline d3 rim(Frames f, real radius, d3 normal, real prjaxis, d3 ax) {
    d3 v = sub3(scl3(ax, prjaxis), normal);
    real len_sqr = dot3(v, v);
    if (len_sqr >= MIN_VAL * MIN_VAL) {
        return scl3(v, radius / dsqrt(len_sqr));
    }
    return d3{{f.mat.v[0] * radius, f.mat.v[3] * radius, f.mat.v[6] * radius}};
}

inline d3 normalized(d3 v) {
    real norm = dsqrt(dot3(v, v));
    if (norm < MIN_VAL) {
        return d3{{D(1.0f), Z(), Z()}};
    }
    return d3{{v.v[0] / norm, v.v[1] / norm, v.v[2] / norm}};
}

inline int plane_cylinder(Frames f, d3 size, real margin, thread Found *out) {
    d3 normal = plane_normal(f);
    d3 ax = axis_of(f.mat);
    real prjaxis = dot3(normal, ax);
    if (prjaxis > Z()) {
        ax = scl3(ax, D(-1.0f));
        prjaxis = -prjaxis;
    }
    real dist0 = dot3(sub3(f.pos, f.plane_pos), normal);
    d3 vec = rim(f, size.v[0], normal, prjaxis, ax);
    real prjvec = dot3(vec, normal);
    d3 axis = scl3(ax, size.v[1]);
    real prj = prjaxis * size.v[1];
    d3 base = add3(f.pos, vec);
    if (dist0 + prj + prjvec > margin) {
        return 0;
    }
    out[0] = at_point(add3(base, axis), dist0 + prj + prjvec, normal);
    int n = 1;
    if (dist0 - prj + prjvec <= margin) {
        out[n] = at_point(sub3(base, axis), dist0 - prj + prjvec, normal);
        n++;
    }
    real prjvec1 = halve(-prjvec);
    if (dist0 + prj + prjvec1 <= margin) {
        d3 side = scl3(normalized(cross3(vec, axis)), size.v[0] * SQRT3_HALF);
        real dist = dist0 + prj + prjvec1;
        d3 center = add_scaled(add3(f.pos, axis), vec, D(-0.5f));
        out[n] = at_point(add3(center, side), dist, normal);
        out[n + 1] = at_point(sub3(center, side), dist, normal);
        n += 2;
    }
    return n;
}

inline int plane_box(Frames f, d3 size, real margin, thread Found *out) {
    d3 normal = plane_normal(f);
    real dist = dot3(sub3(f.pos, f.plane_pos), normal);
    int n = 0;
    for (int i = 0; i < 8; i++) {
        d3 v = d3{{(i & 1) ? size.v[0] : -size.v[0], (i & 2) ? size.v[1] : -size.v[1],
                   (i & 4) ? size.v[2] : -size.v[2]}};
        d3 corner = mat_vec(f.mat, v);
        real ldist = dot3(normal, corner);
        if (dist + ldist > margin || ldist > Z()) {
            continue;
        }
        out[n] = at_point(add3(corner, f.pos), dist + ldist, normal);
        n++;
        if (n >= 4) {
            return 4;
        }
    }
    return n;
}
