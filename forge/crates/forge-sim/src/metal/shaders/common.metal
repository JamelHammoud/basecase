#if H_DF
typedef df hreal;
inline hreal to_h(real x) { return x; }
inline real from_h(hreal x) { return x; }
inline hreal h_one() { return D(1.0f); }
#else
typedef float hreal;
inline hreal to_h(real x) { return x.hi; }
inline real from_h(hreal x) { return D(x); }
inline hreal h_one() { return 1.0f; }
#endif

struct Ctx {
    device real *s;
    device int *n;
    threadgroup hreal *h;
};

#define S(off, i) c.s[(uint)((off) + (i)) * BLOCK]
#define N(off, i) c.n[(uint)((off) + (i)) * BLOCK]

#if H_SHARED
#define H(i) c.h[(i) * BLOCK]
#elif H_DF
#define H(i) S(HF, i)
#else
#define H(i) S(HF, i).hi
#endif

inline Ctx context(device real *s, device int *n, threadgroup hreal *h, uint t) {
    uint block = t / BLOCK, lane = t % BLOCK;
    return Ctx{s + block * NREALS * BLOCK + lane, n + block * NINTS * BLOCK + lane, h + lane};
}

struct d3 { real v[3]; };
struct d4 { real v[4]; };
struct d6 { real v[6]; };
struct d9 { real v[9]; };
struct d10 { real v[10]; };

inline real Z() { return D(0.0f); }

inline d3 get3(Ctx c, int off, int i) { return d3{{S(off, 3 * i), S(off, 3 * i + 1), S(off, 3 * i + 2)}}; }
inline d4 get4(Ctx c, int off, int i) {
    return d4{{S(off, 4 * i), S(off, 4 * i + 1), S(off, 4 * i + 2), S(off, 4 * i + 3)}};
}
inline d6 get6(Ctx c, int off, int i) {
    d6 r;
    for (int k = 0; k < 6; k++) r.v[k] = S(off, 6 * i + k);
    return r;
}
inline d9 get9(Ctx c, int off, int i) {
    d9 r;
    for (int k = 0; k < 9; k++) r.v[k] = S(off, 9 * i + k);
    return r;
}
inline d10 get10(Ctx c, int off, int i) {
    d10 r;
    for (int k = 0; k < 10; k++) r.v[k] = S(off, 10 * i + k);
    return r;
}
inline void put3(Ctx c, int off, int i, d3 x) { for (int k = 0; k < 3; k++) S(off, 3 * i + k) = x.v[k]; }
inline void put4(Ctx c, int off, int i, d4 x) { for (int k = 0; k < 4; k++) S(off, 4 * i + k) = x.v[k]; }
inline void put6(Ctx c, int off, int i, d6 x) { for (int k = 0; k < 6; k++) S(off, 6 * i + k) = x.v[k]; }
inline void put9(Ctx c, int off, int i, d9 x) { for (int k = 0; k < 9; k++) S(off, 9 * i + k) = x.v[k]; }
inline void put10(Ctx c, int off, int i, d10 x) { for (int k = 0; k < 10; k++) S(off, 10 * i + k) = x.v[k]; }

inline d3 c3(constant real *t, int i) { return d3{{t[3 * i], t[3 * i + 1], t[3 * i + 2]}}; }
inline d4 c4(constant real *t, int i) { return d4{{t[4 * i], t[4 * i + 1], t[4 * i + 2], t[4 * i + 3]}}; }
inline d3 zero3() { return d3{{Z(), Z(), Z()}}; }

inline d3 add3(d3 a, d3 b) { return d3{{a.v[0] + b.v[0], a.v[1] + b.v[1], a.v[2] + b.v[2]}}; }
inline d3 sub3(d3 a, d3 b) { return d3{{a.v[0] - b.v[0], a.v[1] - b.v[1], a.v[2] - b.v[2]}}; }
inline d3 scl3(d3 a, real s) { return d3{{a.v[0] * s, a.v[1] * s, a.v[2] * s}}; }
inline real dot3(d3 a, d3 b) { return a.v[0] * b.v[0] + a.v[1] * b.v[1] + a.v[2] * b.v[2]; }

inline d3 cross3(d3 a, d3 b) {
    return d3{{a.v[1] * b.v[2] - a.v[2] * b.v[1], a.v[2] * b.v[0] - a.v[0] * b.v[2],
               a.v[0] * b.v[1] - a.v[1] * b.v[0]}};
}

inline d3 mat_vec(d9 m, d3 v) {
    return d3{{m.v[0] * v.v[0] + m.v[1] * v.v[1] + m.v[2] * v.v[2],
               m.v[3] * v.v[0] + m.v[4] * v.v[1] + m.v[5] * v.v[2],
               m.v[6] * v.v[0] + m.v[7] * v.v[1] + m.v[8] * v.v[2]}};
}

inline d3 mat_t_vec(d9 m, d3 v) {
    return d3{{m.v[0] * v.v[0] + m.v[3] * v.v[1] + m.v[6] * v.v[2],
               m.v[1] * v.v[0] + m.v[4] * v.v[1] + m.v[7] * v.v[2],
               m.v[2] * v.v[0] + m.v[5] * v.v[1] + m.v[8] * v.v[2]}};
}

inline d4 mul_quat(d4 a, d4 b) {
    return d4{{(a.v[0] * b.v[0] - a.v[1] * b.v[1]) - (a.v[2] * b.v[2] + a.v[3] * b.v[3]),
               (a.v[0] * b.v[1] + a.v[1] * b.v[0]) + (a.v[2] * b.v[3] - a.v[3] * b.v[2]),
               (a.v[0] * b.v[2] - a.v[1] * b.v[3]) + (a.v[2] * b.v[0] + a.v[3] * b.v[1]),
               (a.v[0] * b.v[3] + a.v[1] * b.v[2]) - (a.v[2] * b.v[1] - a.v[3] * b.v[0])}};
}

inline d3 rot_vec_quat(d3 v, d4 q) {
    real t0 = q.v[0] * v.v[0] + q.v[2] * v.v[2] - q.v[3] * v.v[1];
    real t1 = q.v[0] * v.v[1] + q.v[3] * v.v[0] - q.v[1] * v.v[2];
    real t2 = q.v[0] * v.v[2] + q.v[1] * v.v[1] - q.v[2] * v.v[0];
    return d3{{v.v[0] + mul2(q.v[2] * t2 - q.v[3] * t1), v.v[1] + mul2(q.v[3] * t0 - q.v[1] * t2),
               v.v[2] + mul2(q.v[1] * t1 - q.v[2] * t0)}};
}

inline d9 quat2mat(d4 q) {
    real q00 = q.v[0] * q.v[0], q01 = q.v[0] * q.v[1], q02 = q.v[0] * q.v[2], q03 = q.v[0] * q.v[3];
    real q11 = q.v[1] * q.v[1], q12 = q.v[1] * q.v[2], q13 = q.v[1] * q.v[3];
    real q22 = q.v[2] * q.v[2], q23 = q.v[2] * q.v[3], q33 = q.v[3] * q.v[3];
    return d9{{q00 + q11 - q22 - q33, mul2(q12 - q03), mul2(q13 + q02),
               mul2(q12 + q03), q00 - q11 + q22 - q33, mul2(q23 - q01),
               mul2(q13 - q02), mul2(q23 + q01), q00 - q11 - q22 + q33}};
}

inline d4 normalize4(d4 q) {
    real norm = dsqrt(q.v[0] * q.v[0] + q.v[1] * q.v[1] + q.v[2] * q.v[2] + q.v[3] * q.v[3]);
    if (norm < MIN_VAL) {
        return d4{{D(1.0f), Z(), Z(), Z()}};
    }
    if (!(dabs(norm - D(1.0f)) > MIN_VAL)) {
        return q;
    }
    real inv = D(1.0f) / norm;
    return d4{{q.v[0] * inv, q.v[1] * inv, q.v[2] * inv, q.v[3] * inv}};
}

inline d3 normalize3(d3 v, thread real &norm) {
    norm = dsqrt(dot3(v, v));
    if (norm < MIN_VAL) {
        return d3{{D(1.0f), Z(), Z()}};
    }
    real inv = D(1.0f) / norm;
    return scl3(v, inv);
}

inline real poly_sin(real x) {
    real z = x * x;
    real w = z * z;
    real r = TRIG_S1 + z * (TRIG_S2 + z * TRIG_S3) + z * w * (TRIG_S4 + z * TRIG_S5);
    return x + z * x * (TRIG_S0 + z * r);
}

inline real poly_cos(real x) {
    real z = x * x;
    real w = z * z;
    real r = z * (TRIG_C0 + z * (TRIG_C1 + z * TRIG_C2)) + w * w * (TRIG_C3 + z * (TRIG_C4 + z * TRIG_C5));
    real hz = halve(z);
    real one = D(1.0f);
    real ww = one - hz;
    return ww + (((one - ww) - hz) + z * r);
}

inline void sin_cos(real x, thread real &s, thread real &co) {
    float k = rint((x * TWO_OVER_PI).hi);
    real r = (x - TRIG_PIO2_1 * k) - TRIG_PIO2_1T * k;
    real a = poly_sin(r);
    real b = poly_cos(r);
    int q = ((int)k % 4 + 4) % 4;
    s = q == 0 ? a : (q == 1 ? b : (q == 2 ? -a : -b));
    co = q == 0 ? b : (q == 1 ? -a : (q == 2 ? -b : a));
}

inline d4 axis_angle_quat(d3 axis, real angle) {
    if (angle == Z()) {
        return d4{{D(1.0f), Z(), Z(), Z()}};
    }
    real s, co;
    sin_cos(halve(angle), s, co);
    return d4{{co, axis.v[0] * s, axis.v[1] * s, axis.v[2] * s}};
}
