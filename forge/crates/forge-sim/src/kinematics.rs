use crate::block::Block;
use crate::lanes::{ONE, V, ZERO};
use crate::params::MIN_VAL;
use crate::plan::Plan;
use crate::spatial::{
    add3, axis_angle_quat, cross, get, inert_com, mul_mat_vec, mul_quat, normalize4, put, quat2mat, rot_vec_quat, scl3,
    splat, sub3, V3, V4, V9,
};
use forge_ir::{JointKind, SameFrame};

const IDENTITY: [f64; 9] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];

fn body_pose(plan: &Plan, b: &mut Block, i: usize) -> (V3, V4) {
    let k = &plan.kernel;
    let body = &k.bodies[i];

    if body.joints.len() == 1 && k.joints[body.joints[0]].kind == JointKind::Free {
        let j = &k.joints[body.joints[0]];
        let a = j.qposadr;
        let pos = [b.qpos[a], b.qpos[a + 1], b.qpos[a + 2]];
        let quat = normalize4(&[b.qpos[a + 3], b.qpos[a + 4], b.qpos[a + 5], b.qpos[a + 6]]);

        put(&mut b.xanchor, body.joints[0], &pos);
        put(&mut b.xaxis, body.joints[0], &splat(&j.axis));

        return (pos, quat);
    }

    let p = body.parent;
    let (mut pos, mut quat) = if p != 0 {
        let pmat: V9 = get(&b.xmat, p);
        let ppos: V3 = get(&b.xpos, p);
        let pquat: V4 = get(&b.xquat, p);

        (
            add3(&mul_mat_vec(&pmat, &splat(&body.pos)), &ppos),
            mul_quat(&pquat, &splat(&body.quat)),
        )
    } else {
        (splat(&body.pos), splat(&body.quat))
    };

    for &jid in &body.joints {
        let j = &k.joints[jid];
        let axis = splat(&j.axis);
        let jpos = splat(&j.pos);
        let q = b.qpos[j.qposadr] - k.qpos0[j.qposadr];
        let xaxis = rot_vec_quat(&axis, &quat);
        let xanchor = add3(&rot_vec_quat(&jpos, &quat), &pos);

        if j.kind == JointKind::Slide {
            pos = add3(&pos, &scl3(&xaxis, q));
        } else {
            quat = mul_quat(&quat, &axis_angle_quat(&axis, q));
            pos = sub3(&xanchor, &rot_vec_quat(&jpos, &quat));
        }

        put(&mut b.xanchor, jid, &xanchor);
        put(&mut b.xaxis, jid, &xaxis);
    }

    (pos, normalize4(&quat))
}

fn local_to_global(b: &Block, body: usize, pos: &[f64; 3], quat: &[f64; 4], frame: SameFrame) -> (V3, V9) {
    let xmat: V9 = get(&b.xmat, body);
    let xpos: V3 = get(&b.xpos, body);
    let gpos = match frame {
        SameFrame::Body => xpos,
        SameFrame::Inertia => get(&b.xipos, body),
        _ => add3(&mul_mat_vec(&xmat, &splat(pos)), &xpos),
    };
    let gmat = match frame {
        SameFrame::None => quat2mat(&mul_quat(&get(&b.xquat, body), &splat(quat))),
        SameFrame::Body | SameFrame::BodyRot => xmat,
        SameFrame::Inertia | SameFrame::InertiaRot => get(&b.ximat, body),
    };

    (gpos, gmat)
}

#[inline(never)]
pub fn kinematics(plan: &Plan, b: &mut Block) {
    let k = &plan.kernel;

    put(&mut b.xpos, 0, &[ZERO; 3]);
    put(&mut b.xquat, 0, &[ONE, ZERO, ZERO, ZERO]);
    put(&mut b.xmat, 0, &splat(&IDENTITY));
    put(&mut b.xipos, 0, &[ZERO; 3]);
    put(&mut b.ximat, 0, &splat(&IDENTITY));

    for i in 1..plan.nbody {
        let (pos, quat) = body_pose(plan, b, i);

        put(&mut b.xquat, i, &quat);
        put(&mut b.xpos, i, &pos);
        put(&mut b.xmat, i, &quat2mat(&quat));
    }

    for i in 1..plan.nbody {
        let body = &k.bodies[i];
        let (p, m) = local_to_global(b, i, &body.ipos, &body.iquat, body.inertial_frame);

        put(&mut b.xipos, i, &p);
        put(&mut b.ximat, i, &m);
    }

    for (g, geom) in k.geoms.iter().enumerate() {
        let (p, m) = local_to_global(b, geom.body, &geom.pos, &geom.quat, geom.frame);

        put(&mut b.geom_xpos, g, &p);
        put(&mut b.geom_xmat, g, &m);
    }
}

fn subtree_com(plan: &Plan, b: &mut Block) {
    let k = &plan.kernel;

    for i in 0..plan.nbody {
        let xipos: V3 = get(&b.xipos, i);

        put(&mut b.subtree_com, i, &scl3(&xipos, V::splat(k.bodies[i].mass)));
    }

    for i in (1..plan.nbody).rev() {
        let p = k.bodies[i].parent;
        let child: V3 = get(&b.subtree_com, i);
        let parent: V3 = get(&b.subtree_com, p);

        put(&mut b.subtree_com, p, &add3(&parent, &child));
    }

    for i in 0..plan.nbody {
        let m = k.bodies[i].subtree_mass;
        let value: V3 = if m < MIN_VAL {
            get(&b.xipos, i)
        } else {
            scl3(&get(&b.subtree_com, i), V::splat(1.0 / m))
        };

        put(&mut b.subtree_com, i, &value);
    }
}

fn dof_com(b: &mut Block, dof: usize, axis: &V3, offset: Option<&V3>) {
    let row = match offset {
        Some(o) => {
            let c = cross(axis, o);

            [axis[0], axis[1], axis[2], c[0], c[1], c[2]]
        }
        None => [ZERO, ZERO, ZERO, axis[0], axis[1], axis[2]],
    };

    put(&mut b.cdof, dof, &row);
}

fn motion_dofs(plan: &Plan, b: &mut Block, i: usize) {
    let k = &plan.kernel;
    let root: V3 = get(&b.subtree_com, k.bodies[i].root);
    let xmat: V9 = get(&b.xmat, i);

    for &jid in &k.bodies[i].joints {
        let j = &k.joints[jid];
        let da = j.dofadr;
        let offset = sub3(&root, &get(&b.xanchor, jid));
        let xaxis: V3 = get(&b.xaxis, jid);

        match j.kind {
            JointKind::Free => {
                for t in 0..3 {
                    let mut unit = [ZERO; 3];

                    unit[t] = ONE;
                    dof_com(b, da + t, &unit, None);
                }

                for r in 0..3 {
                    dof_com(b, da + 3 + r, &[xmat[r], xmat[r + 3], xmat[r + 6]], Some(&offset));
                }
            }
            JointKind::Slide => dof_com(b, da, &xaxis, None),
            _ => dof_com(b, da, &xaxis, Some(&offset)),
        }
    }
}

#[inline(never)]
pub fn com_pos(plan: &Plan, b: &mut Block) {
    let k = &plan.kernel;

    subtree_com(plan, b);
    put(&mut b.cinert, 0, &[ZERO; 10]);

    for i in 1..plan.nbody {
        let body = &k.bodies[i];
        let offset = sub3(&get(&b.xipos, i), &get(&b.subtree_com, body.root));
        let c = inert_com(&splat(&body.inertia), &get(&b.ximat, i), &offset, V::splat(body.mass));

        put(&mut b.cinert, i, &c);
    }

    for i in 1..plan.nbody {
        motion_dofs(plan, b, i);
    }
}
