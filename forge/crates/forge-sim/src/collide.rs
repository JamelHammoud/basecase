use crate::block::Block;
use crate::convex::{dot, plane_convex, Found, Frames, F3};
use crate::lanes::{LANES, V, ZERO};
use crate::plan::Plan;
use crate::primitives::{plane_box, plane_capsule, plane_cylinder, plane_sphere};
use forge_ir::{Collider, Pair, Shape};

const MIN_VAL: f64 = 1e-15;

fn lane3(v: &[V], i: usize, lane: usize) -> [f64; 3] {
    [v[3 * i].0[lane], v[3 * i + 1].0[lane], v[3 * i + 2].0[lane]]
}

fn lane9(v: &[V], i: usize, lane: usize) -> [f64; 9] {
    std::array::from_fn(|k| v[9 * i + k].0[lane])
}

fn normalize(v: &mut F3) {
    let norm = dot(v, v).sqrt();

    *v = if norm < MIN_VAL {
        [1.0, 0.0, 0.0]
    } else {
        v.map(|x| x / norm)
    };
}

fn make_frame(normal: &F3, tangent: &F3) -> [f64; 9] {
    let mut x = *normal;

    normalize(&mut x);

    let mut y = *tangent;

    if dot(&y, &y) < 0.25 {
        y = if x[1] < 0.5 && x[1] > -0.5 {
            [0.0, 1.0, 0.0]
        } else {
            [0.0, 0.0, 1.0]
        };
    }

    let d = dot(&x, &y);

    y = [y[0] - x[0] * d, y[1] - x[1] * d, y[2] - x[2] * d];
    normalize(&mut y);

    let z = [
        x[1] * y[2] - x[2] * y[1],
        x[2] * y[0] - x[0] * y[2],
        x[0] * y[1] - x[1] * y[0],
    ];

    [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]]
}

fn record(b: &mut Block, slot: usize, lane: usize, found: &[Found], normal: &F3) {
    for (c, f) in found.iter().enumerate() {
        let s = slot + c;
        let frame = make_frame(normal, &f.tangent);

        b.con_found[s].0[lane] = 1.0;
        b.con_dist[s].0[lane] = f.dist;

        for a in 0..3 {
            b.con_pos[3 * s + a].0[lane] = f.pos[a];
        }

        for a in 0..9 {
            b.con_frame[9 * s + a].0[lane] = frame[a];
        }
    }
}

fn detect(plan: &Plan, pair: &Pair, frames: &Frames, out: &mut [Found]) -> usize {
    let k = &plan.kernel;
    let geom = &k.geoms[pair.geoms[1]];
    let margin = pair.margin + pair.gap;

    match (pair.collider, geom.shape) {
        (Collider::PlaneConvex, Shape::Mesh(m)) => plane_convex(&k.meshes[m], frames, margin, out),
        (Collider::PlaneSphere, _) => plane_sphere(frames, &geom.size, margin, out),
        (Collider::PlaneCapsule, _) => plane_capsule(frames, &geom.size, margin, out),
        (Collider::PlaneCylinder, _) => plane_cylinder(frames, &geom.size, margin, out),
        (Collider::PlaneBox, _) => plane_box(frames, &geom.size, margin, out),
        _ => 0,
    }
}

#[inline(never)]
pub fn collide(plan: &Plan, b: &mut Block) {
    let mut found = [Found::default(); 4];
    let mut slot = 0;

    b.con_found.fill(ZERO);
    b.ncon = ZERO;

    for pair in &plan.kernel.pairs {
        let [g1, g2] = pair.geoms;

        for lane in 0..LANES {
            let plane_mat = lane9(&b.geom_xmat, g1, lane);
            let frames = Frames {
                plane_pos: &lane3(&b.geom_xpos, g1, lane),
                plane_mat: &plane_mat,
                pos: &lane3(&b.geom_xpos, g2, lane),
                mat: &lane9(&b.geom_xmat, g2, lane),
            };
            let n = detect(plan, pair, &frames, &mut found);
            let normal = [plane_mat[2], plane_mat[5], plane_mat[8]];

            b.ncon.0[lane] += n as f64;
            record(b, slot, lane, &found[..n], &normal);
        }

        slot += pair.max_contacts;
    }
}
