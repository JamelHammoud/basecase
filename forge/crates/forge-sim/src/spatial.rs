use crate::lanes::{LANES, ONE, V, ZERO};
use crate::params::MIN_VAL;

pub type V3 = [V; 3];
pub type V4 = [V; 4];
pub type V6 = [V; 6];
pub type V9 = [V; 9];
pub type V10 = [V; 10];

#[inline(always)]
pub fn get<const N: usize>(v: &[V], i: usize) -> [V; N] {
    let mut out = [ZERO; N];

    out.copy_from_slice(&v[N * i..N * i + N]);
    out
}

#[inline(always)]
pub fn put<const N: usize>(v: &mut [V], i: usize, x: &[V; N]) {
    v[N * i..N * i + N].copy_from_slice(x);
}

#[inline(always)]
pub fn splat<const N: usize>(x: &[f64; N]) -> [V; N] {
    x.map(V::splat)
}

#[inline(always)]
pub fn add3(a: &V3, b: &V3) -> V3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

#[inline(always)]
pub fn sub3(a: &V3, b: &V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

#[inline(always)]
pub fn scl3(a: &V3, s: V) -> V3 {
    [a[0] * s, a[1] * s, a[2] * s]
}

#[inline(always)]
pub fn dot3(a: &V3, b: &V3) -> V {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[inline(always)]
pub fn cross(a: &V3, b: &V3) -> V3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

#[inline(always)]
pub fn mul_mat_vec(m: &V9, v: &V3) -> V3 {
    [
        m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
        m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
        m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
    ]
}

#[inline(always)]
pub fn mul_quat(a: &V4, b: &V4) -> V4 {
    [
        a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
        a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
        a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
        a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
    ]
}

#[inline(always)]
pub fn rot_vec_quat(v: &V3, q: &V4) -> V3 {
    let t = [
        q[0] * v[0] + q[2] * v[2] - q[3] * v[1],
        q[0] * v[1] + q[3] * v[0] - q[1] * v[2],
        q[0] * v[2] + q[1] * v[1] - q[2] * v[0],
    ];

    [
        v[0] + (q[2] * t[2] - q[3] * t[1]) * 2.0,
        v[1] + (q[3] * t[0] - q[1] * t[2]) * 2.0,
        v[2] + (q[1] * t[1] - q[2] * t[0]) * 2.0,
    ]
}

#[inline(always)]
pub fn quat2mat(q: &V4) -> V9 {
    let q00 = q[0] * q[0];
    let q01 = q[0] * q[1];
    let q02 = q[0] * q[2];
    let q03 = q[0] * q[3];
    let q11 = q[1] * q[1];
    let q12 = q[1] * q[2];
    let q13 = q[1] * q[3];
    let q22 = q[2] * q[2];
    let q23 = q[2] * q[3];
    let q33 = q[3] * q[3];

    [
        q00 + q11 - q22 - q33,
        (q12 - q03) * 2.0,
        (q13 + q02) * 2.0,
        (q12 + q03) * 2.0,
        q00 - q11 + q22 - q33,
        (q23 - q01) * 2.0,
        (q13 - q02) * 2.0,
        (q23 + q01) * 2.0,
        q00 - q11 - q22 + q33,
    ]
}

pub fn normalize4(q: &V4) -> V4 {
    let norm = (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]).sqrt();
    let inv = ONE / norm;
    let scaled = [q[0] * inv, q[1] * inv, q[2] * inv, q[3] * inv];
    let tiny = norm.lt(V::splat(MIN_VAL));
    let off = (norm - 1.0).abs().gt(V::splat(MIN_VAL));
    let unit = [ONE, ZERO, ZERO, ZERO];

    std::array::from_fn(|k| tiny.select(unit[k], off.select(scaled[k], q[k])))
}

pub fn normalize3(v: &V3) -> (V3, V) {
    let norm = dot3(v, v).sqrt();
    let inv = ONE / norm;
    let tiny = norm.lt(V::splat(MIN_VAL));
    let unit = [ONE, ZERO, ZERO];

    (std::array::from_fn(|k| tiny.select(unit[k], v[k] * inv)), norm)
}

pub fn sin_cos(x: V) -> (V, V) {
    let mut s = ZERO;
    let mut c = ZERO;

    for i in 0..LANES {
        let (a, b) = x.0[i].sin_cos();

        s.0[i] = a;
        c.0[i] = b;
    }

    (s, c)
}

pub fn axis_angle_quat(axis: &V3, angle: V) -> V4 {
    let (s, c) = sin_cos(angle * 0.5);
    let zero = angle.eq(ZERO);

    [
        zero.select(ONE, c),
        zero.select(ZERO, axis[0] * s),
        zero.select(ZERO, axis[1] * s),
        zero.select(ZERO, axis[2] * s),
    ]
}

pub fn inert_com(inert: &V3, mat: &V9, dif: &V3, mass: V) -> V10 {
    let t = [
        mat[0] * inert[0],
        mat[3] * inert[0],
        mat[6] * inert[0],
        mat[1] * inert[1],
        mat[4] * inert[1],
        mat[7] * inert[1],
        mat[2] * inert[2],
        mat[5] * inert[2],
        mat[8] * inert[2],
    ];

    [
        mat[0] * t[0] + mat[1] * t[3] + mat[2] * t[6] + mass * (dif[1] * dif[1] + dif[2] * dif[2]),
        mat[3] * t[1] + mat[4] * t[4] + mat[5] * t[7] + mass * (dif[0] * dif[0] + dif[2] * dif[2]),
        mat[6] * t[2] + mat[7] * t[5] + mat[8] * t[8] + mass * (dif[0] * dif[0] + dif[1] * dif[1]),
        mat[0] * t[1] + mat[1] * t[4] + mat[2] * t[7] - mass * dif[0] * dif[1],
        mat[0] * t[2] + mat[1] * t[5] + mat[2] * t[8] - mass * dif[0] * dif[2],
        mat[3] * t[2] + mat[4] * t[5] + mat[5] * t[8] - mass * dif[1] * dif[2],
        mass * dif[0],
        mass * dif[1],
        mass * dif[2],
        mass,
    ]
}

#[inline(always)]
pub fn mul_inert_vec(i: &V10, v: &V6) -> V6 {
    [
        i[0] * v[0] + i[3] * v[1] + i[4] * v[2] - i[8] * v[4] + i[7] * v[5],
        i[3] * v[0] + i[1] * v[1] + i[5] * v[2] + i[8] * v[3] - i[6] * v[5],
        i[4] * v[0] + i[5] * v[1] + i[2] * v[2] - i[7] * v[3] + i[6] * v[4],
        i[8] * v[1] - i[7] * v[2] + i[9] * v[3],
        i[6] * v[2] - i[8] * v[0] + i[9] * v[4],
        i[7] * v[0] - i[6] * v[1] + i[9] * v[5],
    ]
}

#[inline(always)]
pub fn cross_motion(vel: &V6, v: &V6) -> V6 {
    [
        -vel[2] * v[1] + vel[1] * v[2],
        vel[2] * v[0] - vel[0] * v[2],
        -vel[1] * v[0] + vel[0] * v[1],
        -vel[2] * v[4] + vel[1] * v[5] + (-vel[5] * v[1] + vel[4] * v[2]),
        vel[2] * v[3] - vel[0] * v[5] + (vel[5] * v[0] - vel[3] * v[2]),
        -vel[1] * v[3] + vel[0] * v[4] + (-vel[4] * v[0] + vel[3] * v[1]),
    ]
}

#[inline(always)]
pub fn cross_force(vel: &V6, f: &V6) -> V6 {
    [
        -vel[2] * f[1] + vel[1] * f[2] + (-vel[5] * f[4] + vel[4] * f[5]),
        vel[2] * f[0] - vel[0] * f[2] + (vel[5] * f[3] - vel[3] * f[5]),
        -vel[1] * f[0] + vel[0] * f[1] + (-vel[4] * f[3] + vel[3] * f[4]),
        -vel[2] * f[4] + vel[1] * f[5],
        vel[2] * f[3] - vel[0] * f[5],
        -vel[1] * f[3] + vel[0] * f[4],
    ]
}

#[inline(always)]
pub fn dot6(a: &V6, b: &V6) -> V {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] + a[4] * b[4] + a[5] * b[5]
}

pub fn make_frame(normal: &V3) -> V9 {
    let (x, _) = normalize3(normal);
    let small = x[1].lt(V::splat(0.5)).and(x[1].gt(V::splat(-0.5)));
    let y0 = [ZERO, small.select(ONE, ZERO), small.select(ZERO, ONE)];
    let d = dot3(&x, &y0);
    let y1 = sub3(&y0, &scl3(&x, d));
    let (y, _) = normalize3(&y1);
    let z = cross(&x, &y);

    [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]]
}
