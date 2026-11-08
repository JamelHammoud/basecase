use forge_ir::{Climb, Mesh};

pub type F3 = [f64; 3];

#[derive(Clone, Copy, Debug, Default)]
pub struct Found {
    pub dist: f64,
    pub pos: F3,
    pub tangent: F3,
}

pub struct Frames<'a> {
    pub plane_pos: &'a F3,
    pub plane_mat: &'a [f64; 9],
    pub pos: &'a F3,
    pub mat: &'a [f64; 9],
}

pub fn dot(a: &F3, b: &F3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn dot_f(a: &F3, b: &[f32; 3]) -> f64 {
    a[0] * f64::from(b[0]) + a[1] * f64::from(b[1]) + a[2] * f64::from(b[2])
}

pub fn sub(a: &F3, b: &F3) -> F3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn mat_t_vec(m: &[f64; 9], v: &F3) -> F3 {
    [
        m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
        m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
        m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
    ]
}

fn local_to_global(m: &[f64; 9], v: &[f32; 3], pos: &F3) -> F3 {
    let d = v.map(f64::from);

    [
        m[0] * d[0] + m[1] * d[1] + m[2] * d[2] + pos[0],
        m[3] * d[0] + m[4] * d[1] + m[5] * d[2] + pos[1],
        m[6] * d[0] + m[7] * d[1] + m[8] * d[2] + pos[2],
    ]
}

fn exhaustive(mesh: &Mesh, dir: &F3) -> usize {
    let mut best = -f64::from(f32::MAX);
    let mut index = 0;

    for (i, v) in mesh.vertices.iter().enumerate() {
        let d = dot_f(dir, v);

        if d > best {
            best = d;
            index = i;
        }
    }

    index
}

fn grid(x: f64) -> usize {
    (usize::from(x > 0.4) + 1).saturating_sub(usize::from(x < -0.4))
}

fn hill_climb(mesh: &Mesh, climb: &Climb, dir: &F3) -> usize {
    let seed = climb.extrema[grid(dir[0]) * 9 + grid(dir[1]) * 3 + grid(dir[2])];
    let mut imax = seed;
    let mut best = dot_f(dir, &mesh.vertices[climb.vertex[imax]]);
    let mut prev = usize::MAX;

    while imax != prev {
        prev = imax;

        for &n in &climb.neighbours[prev] {
            let d = dot_f(dir, &mesh.vertices[climb.vertex[n]]);

            if d > best {
                best = d;
                imax = n;
            }
        }
    }

    climb.vertex[imax]
}

fn area4(mesh: &Mesh, idx: &[usize], q: [usize; 4]) -> f64 {
    let p = |k: usize| mesh.vertices[idx[k]].map(f64::from);
    let ca = sub(&p(q[0]), &p(q[2]));
    let db = sub(&p(q[1]), &p(q[3]));
    let c = [
        ca[1] * db[2] - ca[2] * db[1],
        ca[2] * db[0] - ca[0] * db[2],
        ca[0] * db[1] - ca[1] * db[0],
    ];

    0.5 * dot(&c, &c).sqrt()
}

fn grow(mesh: &Mesh, idx: &[usize], q: &mut [usize; 4], slot: usize, best: &mut f64) -> bool {
    let n = idx.len();
    let mut moved = false;

    loop {
        let mut next = *q;

        next[slot] = (q[slot] + 1) % n;

        let area = area4(mesh, idx, next);

        if area <= *best {
            return moved;
        }

        *q = next;
        *best = area;
        moved = true;

        if slot == 3 {
            return moved;
        }
    }
}

fn hull4(mesh: &Mesh, idx: &[usize], a: usize) -> Vec<usize> {
    let n = idx.len();
    let mut q = [a, (a + 1) % n, (a + 2) % n, (a + 3) % n];

    if n <= 4 {
        return q[..n].to_vec();
    }

    let mut best = area4(mesh, idx, q);

    while grow(mesh, idx, &mut q, 3, &mut best) {
        grow(mesh, idx, &mut q, 2, &mut best);
        grow(mesh, idx, &mut q, 1, &mut best);
    }

    q.to_vec()
}

fn best_face(mesh: &Mesh, vertex: usize, local_normal: &F3) -> Option<usize> {
    let mut best = None;
    let mut best_dot = 1.0;

    for &f in &mesh.vertex_faces[vertex] {
        let d = dot(&mesh.faces[f].normal, local_normal);

        if d < best_dot {
            best_dot = d;
            best = Some(f);
        }
    }

    best
}

pub fn plane_convex(mesh: &Mesh, frames: &Frames, margin: f64, out: &mut [Found]) -> usize {
    let pm = frames.plane_mat;
    let normal = [pm[2], pm[5], pm[8]];
    let dir = [-pm[2], -pm[5], -pm[8]];
    let local_dir = mat_t_vec(frames.mat, &dir);
    let vertex = match &mesh.climb {
        Some(c) => hill_climb(mesh, c, &local_dir),
        None => exhaustive(mesh, &local_dir),
    };
    let v = local_to_global(frames.mat, &mesh.vertices[vertex], frames.pos);
    let dist = dot(&normal, &sub(&v, frames.plane_pos));

    if dist > margin {
        return 0;
    }

    let shift = |p: &F3, d: f64| {
        [
            p[0] - 0.5 * d * normal[0],
            p[1] - 0.5 * d * normal[1],
            p[2] - 0.5 * d * normal[2],
        ]
    };

    out[0] = Found {
        dist,
        pos: shift(&v, dist),
        tangent: [0.0; 3],
    };

    let local_normal = mat_t_vec(frames.mat, &normal);
    let Some(face) = (!mesh.faces.is_empty())
        .then(|| best_face(mesh, vertex, &local_normal))
        .flatten()
    else {
        return 1;
    };
    let idx = &mesh.faces[face].vertices;
    let anchor = idx.iter().position(|&i| i == vertex).unwrap_or(0);
    let mut count = 1;

    for &k in hull4(mesh, idx, anchor).iter().skip(1) {
        let p = local_to_global(frames.mat, &mesh.vertices[idx[k]], frames.pos);
        let d = dot(&normal, &sub(&p, frames.plane_pos));

        if d > margin || dot(&normal, &sub(&p, frames.pos)) > 0.0 {
            continue;
        }

        out[count] = Found {
            dist: d,
            pos: shift(&p, d),
            tangent: [0.0; 3],
        };
        count += 1;
    }

    count
}
