use crate::convex::{dot, sub, Found, Frames, F3};

const MIN_VAL: f64 = 1e-15;

fn plane_normal(f: &Frames) -> F3 {
    [f.plane_mat[2], f.plane_mat[5], f.plane_mat[8]]
}

fn axis(m: &[f64; 9]) -> F3 {
    [m[2], m[5], m[8]]
}

fn add_scaled(a: &F3, b: &F3, s: f64) -> F3 {
    [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]
}

fn sphere_at(f: &Frames, center: &F3, radius: f64, margin: f64) -> Option<Found> {
    let normal = plane_normal(f);
    let cdist = dot(&sub(center, f.plane_pos), &normal);

    if cdist > margin + radius {
        return None;
    }

    let dist = cdist - radius;

    Some(Found {
        dist,
        pos: add_scaled(center, &normal, -dist / 2.0 - radius),
        tangent: [0.0; 3],
    })
}

pub fn plane_sphere(f: &Frames, size: &F3, margin: f64, out: &mut [Found]) -> usize {
    sphere_at(f, f.pos, size[0], margin).map_or(0, |c| {
        out[0] = c;
        1
    })
}

pub fn plane_capsule(f: &Frames, size: &F3, margin: f64, out: &mut [Found]) -> usize {
    let a = axis(f.mat);
    let ends = [add_scaled(f.pos, &a, size[1]), add_scaled(f.pos, &a, -size[1])];
    let mut n = 0;

    for end in &ends {
        if let Some(mut c) = sphere_at(f, end, size[0], margin) {
            c.tangent = a;
            out[n] = c;
            n += 1;
        }
    }

    n
}

fn contact(pos: F3, dist: f64, normal: &F3) -> Found {
    Found {
        dist,
        pos: add_scaled(&pos, normal, -dist * 0.5),
        tangent: [0.0; 3],
    }
}

fn rim(f: &Frames, radius: f64, normal: &F3, prjaxis: f64, ax: &F3) -> F3 {
    let mut vec = sub(&[ax[0] * prjaxis, ax[1] * prjaxis, ax[2] * prjaxis], normal);
    let len_sqr = dot(&vec, &vec);

    if len_sqr >= MIN_VAL * MIN_VAL {
        let scl = radius / len_sqr.sqrt();

        vec = vec.map(|v| v * scl);
    } else {
        vec = [f.mat[0] * radius, f.mat[3] * radius, f.mat[6] * radius];
    }

    vec
}

fn cross(a: &F3, b: &F3) -> F3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn normalized(v: &F3) -> F3 {
    let norm = dot(v, v).sqrt();

    if norm < MIN_VAL {
        return [1.0, 0.0, 0.0];
    }

    v.map(|x| x / norm)
}

pub fn plane_cylinder(f: &Frames, size: &F3, margin: f64, out: &mut [Found]) -> usize {
    let normal = plane_normal(f);
    let mut ax = axis(f.mat);
    let mut prjaxis = dot(&normal, &ax);

    if prjaxis > 0.0 {
        ax = ax.map(|v| -v);
        prjaxis = -prjaxis;
    }

    let dist0 = dot(&sub(f.pos, f.plane_pos), &normal);
    let vec = rim(f, size[0], &normal, prjaxis, &ax);
    let prjvec = dot(&vec, &normal);
    let axis = ax.map(|v| v * size[1]);
    let prjaxis = prjaxis * size[1];
    let base = [f.pos[0] + vec[0], f.pos[1] + vec[1], f.pos[2] + vec[2]];

    if dist0 + prjaxis + prjvec > margin {
        return 0;
    }

    out[0] = contact(add_scaled(&base, &axis, 1.0), dist0 + prjaxis + prjvec, &normal);

    let mut n = 1;

    if dist0 - prjaxis + prjvec <= margin {
        out[n] = contact(add_scaled(&base, &axis, -1.0), dist0 - prjaxis + prjvec, &normal);
        n += 1;
    }

    let prjvec1 = -prjvec * 0.5;

    if dist0 + prjaxis + prjvec1 <= margin {
        let side = normalized(&cross(&vec, &axis)).map(|v| v * size[0] * 3f64.sqrt() / 2.0);
        let dist = dist0 + prjaxis + prjvec1;
        let center = add_scaled(&add_scaled(f.pos, &axis, 1.0), &vec, -0.5);

        out[n] = contact(add_scaled(&center, &side, 1.0), dist, &normal);
        out[n + 1] = contact(add_scaled(&center, &side, -1.0), dist, &normal);
        n += 2;
    }

    n
}

pub fn plane_box(f: &Frames, size: &F3, margin: f64, out: &mut [Found]) -> usize {
    let normal = plane_normal(f);
    let dist = dot(&sub(f.pos, f.plane_pos), &normal);
    let m = f.mat;
    let mut n = 0;

    for i in 0..8 {
        let v = [
            if i & 1 != 0 { size[0] } else { -size[0] },
            if i & 2 != 0 { size[1] } else { -size[1] },
            if i & 4 != 0 { size[2] } else { -size[2] },
        ];
        let corner = [
            m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
            m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
            m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
        ];
        let ldist = dot(&normal, &corner);

        if dist + ldist > margin || ldist > 0.0 {
            continue;
        }

        let d = dist + ldist;
        let world = [corner[0] + f.pos[0], corner[1] + f.pos[1], corner[2] + f.pos[2]];

        out[n] = contact(world, d, &normal);
        n += 1;

        if n >= 4 {
            return 4;
        }
    }

    n
}
