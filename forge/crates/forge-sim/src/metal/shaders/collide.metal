struct Found {
    real dist;
    d3 pos;
    d3 tangent;
};

struct Frames {
    d3 plane_pos;
    d9 plane_mat;
    d3 pos;
    d9 mat;
};

inline d3 vert(int v) { return d3{{D(VERT[3 * v]), D(VERT[3 * v + 1]), D(VERT[3 * v + 2])}}; }

inline d3 plane_normal(Frames f) { return d3{{f.plane_mat.v[2], f.plane_mat.v[5], f.plane_mat.v[8]}}; }
inline d3 axis_of(d9 m) { return d3{{m.v[2], m.v[5], m.v[8]}}; }
inline d3 add_scaled(d3 a, d3 b, real s) { return add3(a, scl3(b, s)); }

inline Found at_point(d3 pos, real dist, d3 normal) {
    return Found{dist, add_scaled(pos, normal, -halve(dist)), zero3()};
}

inline int exhaustive(int m, d3 dir) {
    real best = D(-FLT_MAX);
    int index = 0;
    for (int i = 0; i < MESH_VNUM[m]; i++) {
        real d = dot3(dir, vert(MESH_VADR[m] + i));
        if (d > best) {
            best = d;
            index = i;
        }
    }
    return index;
}

inline int grid(real x) { return (x > D(0.4f) ? 2 : 1) - (x < D(-0.4f) ? 1 : 0); }

inline int hill_climb(int m, d3 dir) {
    int base = CLIMB_ADR[m];
    int vadr = MESH_VADR[m];
    int imax = CLIMB_EXTREMA[27 * m + grid(dir.v[0]) * 9 + grid(dir.v[1]) * 3 + grid(dir.v[2])];
    real best = dot3(dir, vert(vadr + CLIMB_VERTEX[base + imax]));
    int prev = -1;
    while (imax != prev) {
        prev = imax;
        for (int a = CLIMB_NADR[base + prev]; a < CLIMB_NADR[base + prev] + CLIMB_NNUM[base + prev]; a++) {
            int n = CLIMB_NB[a];
            real d = dot3(dir, vert(vadr + CLIMB_VERTEX[base + n]));
            if (d > best) {
                best = d;
                imax = n;
            }
        }
    }
    return CLIMB_VERTEX[base + imax];
}

inline real area4(int vadr, int face, int4 q) {
    int a = FACE_VADR[face];
    d3 ca = sub3(vert(vadr + FACE_V[a + q.x]), vert(vadr + FACE_V[a + q.z]));
    d3 db = sub3(vert(vadr + FACE_V[a + q.y]), vert(vadr + FACE_V[a + q.w]));
    d3 x = cross3(ca, db);
    return halve(dsqrt(dot3(x, x)));
}

inline bool grow(int vadr, int face, thread int4 &q, int slot, thread real &best) {
    int n = FACE_VNUM[face];
    bool moved = false;
    while (true) {
        int4 next = q;
        next[slot] = (q[slot] + 1) % n;
        real area = area4(vadr, face, next);
        if (area <= best) {
            return moved;
        }
        q = next;
        best = area;
        moved = true;
        if (slot == 3) {
            return moved;
        }
    }
}

inline int hull4(int vadr, int face, int a, thread int4 &q) {
    int n = FACE_VNUM[face];
    q = int4(a, (a + 1) % n, (a + 2) % n, (a + 3) % n);
    if (n <= 4) {
        return n;
    }
    real best = area4(vadr, face, q);
    while (grow(vadr, face, q, 3, best)) {
        grow(vadr, face, q, 2, best);
        grow(vadr, face, q, 1, best);
    }
    return 4;
}

inline int best_face(int vtx, d3 local_normal) {
    int best = -1;
    real best_dot = D(1.0f);
    for (int a = VF_ADR[vtx]; a < VF_ADR[vtx] + VF_NUM[vtx]; a++) {
        int f = VF[a];
        real d = dot3(c3(FACE_NORMAL, f), local_normal);
        if (d < best_dot) {
            best_dot = d;
            best = f;
        }
    }
    return best;
}

inline d3 to_global(Frames f, int v) { return add3(mat_vec(f.mat, vert(v)), f.pos); }

inline int plane_convex(int m, Frames f, real margin, thread Found *out) {
    d3 normal = plane_normal(f);
    d3 local_dir = mat_t_vec(f.mat, scl3(normal, D(-1.0f)));
    int vadr = MESH_VADR[m];
    int vtx = CLIMB_ADR[m] >= 0 ? hill_climb(m, local_dir) : exhaustive(m, local_dir);
    d3 v = to_global(f, vadr + vtx);
    real dist = dot3(normal, sub3(v, f.plane_pos));
    if (dist > margin) {
        return 0;
    }
    out[0] = at_point(v, dist, normal);
    int face = MESH_FNUM[m] > 0 ? best_face(vadr + vtx, mat_t_vec(f.mat, normal)) : -1;
    if (face < 0) {
        return 1;
    }
    int anchor = 0;
    for (int k = FACE_VNUM[face] - 1; k >= 0; k--) {
        anchor = FACE_V[FACE_VADR[face] + k] == vtx ? k : anchor;
    }
    int4 q;
    int nq = hull4(vadr, face, anchor, q);
    int count = 1;
    for (int k = 1; k < nq; k++) {
        d3 p = to_global(f, vadr + FACE_V[FACE_VADR[face] + q[k]]);
        real d = dot3(normal, sub3(p, f.plane_pos));
        if (d > margin || dot3(normal, sub3(p, f.pos)) > Z()) {
            continue;
        }
        out[count] = at_point(p, d, normal);
        count++;
    }
    return count;
}
