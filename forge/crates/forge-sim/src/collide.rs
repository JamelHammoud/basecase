use crate::block::Block;
use crate::convex::{plane_convex, Found, Frames};
use crate::lanes::{LANES, V, ZERO};
use crate::plan::Plan;
use crate::spatial::{make_frame, put};
use forge_ir::Shape;

fn lane3(v: &[V], i: usize, lane: usize) -> [f64; 3] {
    [v[3 * i].0[lane], v[3 * i + 1].0[lane], v[3 * i + 2].0[lane]]
}

fn lane9(v: &[V], i: usize, lane: usize) -> [f64; 9] {
    std::array::from_fn(|k| v[9 * i + k].0[lane])
}

fn record(b: &mut Block, slot: usize, lane: usize, found: &[Found]) {
    for (c, f) in found.iter().enumerate() {
        let s = slot + c;

        b.con_found[s].0[lane] = 1.0;
        b.con_dist[s].0[lane] = f.dist;

        for a in 0..3 {
            b.con_pos[3 * s + a].0[lane] = f.pos[a];
        }
    }
}

#[inline(never)]
pub fn collide(plan: &Plan, b: &mut Block) {
    let k = &plan.kernel;
    let mut found = [Found::default(); 4];
    let mut slot = 0;

    b.con_found.fill(ZERO);
    b.ncon = ZERO;

    for pair in &k.pairs {
        let [g1, g2] = pair.geoms;

        if let Shape::Mesh(m) = k.geoms[g2].shape {
            for lane in 0..LANES {
                let frames = Frames {
                    plane_pos: &lane3(&b.geom_xpos, g1, lane),
                    plane_mat: &lane9(&b.geom_xmat, g1, lane),
                    pos: &lane3(&b.geom_xpos, g2, lane),
                    mat: &lane9(&b.geom_xmat, g2, lane),
                };
                let n = plane_convex(&k.meshes[m], &frames, pair.margin + pair.gap, &mut found);

                b.ncon.0[lane] += n as f64;
                record(b, slot, lane, &found[..n]);
            }
        }

        let x = 9 * g1;
        let frame = make_frame(&[b.geom_xmat[x + 2], b.geom_xmat[x + 5], b.geom_xmat[x + 8]]);

        for c in 0..pair.max_contacts {
            put(&mut b.con_frame, slot + c, &frame);
        }

        slot += pair.max_contacts;
    }
}
