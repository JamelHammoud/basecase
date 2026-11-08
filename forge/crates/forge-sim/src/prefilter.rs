use crate::block::Block;
use crate::lanes::{V, ZERO};
use crate::spatial::{dot3, get, sub3, V3, V9};
use forge_ir::{Geom, Mesh, Shape};

const SLACK: f64 = 1e-9;
const MESH_LIMIT: usize = 32;

fn column(m: &V9, c: usize) -> V3 {
    [m[c], m[c + 3], m[c + 6]]
}

fn mesh_reach(mesh: &Mesh, local: &V3) -> Option<V> {
    if mesh.vertices.len() > MESH_LIMIT {
        return None;
    }

    let mut low = V::splat(f64::INFINITY);

    for v in &mesh.vertices {
        let d = local[0] * f64::from(v[0]) + local[1] * f64::from(v[1]) + local[2] * f64::from(v[2]);

        low = low.min(d);
    }

    Some(low)
}

fn reach(geom: &Geom, meshes: &[Mesh], normal: &V3, mat: &V9) -> Option<V> {
    let s = geom.size;
    let along = |c: usize| dot3(normal, &column(mat, c));

    match geom.shape {
        Shape::Sphere => Some(V::splat(-s[0])),
        Shape::Capsule => Some(-(along(2).abs() * s[1]) - s[0]),
        Shape::Box => Some(-(along(0).abs() * s[0] + along(1).abs() * s[1] + along(2).abs() * s[2])),
        Shape::Cylinder => {
            let a = along(2);
            let side = (V::splat(1.0) - a * a).max(ZERO).sqrt();

            Some(-(a.abs() * s[1] + side * s[0]))
        }
        Shape::Mesh(m) => {
            let local = [along(0), along(1), along(2)];

            mesh_reach(&meshes[m], &local)
        }
        Shape::Plane => None,
    }
}

pub struct Probe<'a> {
    pub plane: usize,
    pub geom: usize,
    pub shape: &'a Geom,
    pub meshes: &'a [Mesh],
    pub margin: f64,
}

pub fn clear_of_plane(b: &Block, p: &Probe) -> bool {
    let pmat: V9 = get(&b.geom_xmat, p.plane);
    let normal = column(&pmat, 2);
    let mat: V9 = get(&b.geom_xmat, p.geom);
    let Some(low) = reach(p.shape, p.meshes, &normal, &mat) else {
        return false;
    };
    let center = dot3(&normal, &sub3(&get(&b.geom_xpos, p.geom), &get(&b.geom_xpos, p.plane)));

    (center + low).gt(V::splat(p.margin + SLACK)).all()
}
