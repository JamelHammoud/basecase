use crate::block::Block;
use crate::lanes::{V, ZERO};
use crate::plan::Plan;
use crate::spatial::{cross_force, cross_motion, dot6, get, mul_inert_vec, put, V10, V6};
use forge_ir::JointKind;

fn add_dofs(b: &Block, cvel: &mut V6, first: usize, count: usize) {
    let mut tmp = [ZERO; 6];

    for r in 0..count {
        let q = b.qvel[first + r];

        for (c, t) in tmp.iter_mut().enumerate() {
            *t += b.cdof[6 * (first + r) + c] * q;
        }
    }

    for c in 0..6 {
        cvel[c] += tmp[c];
    }
}

fn body_velocity(plan: &Plan, b: &mut Block, i: usize) {
    let k = &plan.kernel;
    let body = &k.bodies[i];
    let mut cvel: V6 = get(&b.cvel, body.parent);
    let mut d = body.dofadr;
    let end = body.dofadr + body.dofnum;

    while d < end {
        let kind = k.joints[k.dofs[d].joint].kind;

        if kind == JointKind::Free {
            put(&mut b.cdof_dot, d, &[ZERO; 6]);
            put(&mut b.cdof_dot, d + 1, &[ZERO; 6]);
            put(&mut b.cdof_dot, d + 2, &[ZERO; 6]);
            add_dofs(b, &mut cvel, d, 3);

            for r in 0..3 {
                let cdof: V6 = get(&b.cdof, d + 3 + r);

                put(&mut b.cdof_dot, d + 3 + r, &cross_motion(&cvel, &cdof));
            }

            add_dofs(b, &mut cvel, d + 3, 3);
            d += 6;
            continue;
        }

        let cdof: V6 = get(&b.cdof, d);

        put(&mut b.cdof_dot, d, &cross_motion(&cvel, &cdof));
        add_dofs(b, &mut cvel, d, 1);
        d += 1;
    }

    put(&mut b.cvel, i, &cvel);
}

pub fn com_vel(plan: &Plan, b: &mut Block) {
    put(&mut b.cvel, 0, &[ZERO; 6]);

    for i in 1..plan.nbody {
        body_velocity(plan, b, i);
    }
}

pub fn rne(plan: &Plan, b: &mut Block, cacc: &mut [V], cfrc: &mut [V]) {
    let k = &plan.kernel;
    let g = k.options.gravity;

    put(
        cacc,
        0,
        &[ZERO, ZERO, ZERO, V::splat(-g[0]), V::splat(-g[1]), V::splat(-g[2])],
    );

    for i in 1..plan.nbody {
        let body = &k.bodies[i];
        let mut acc: V6 = get(cacc, body.parent);
        let mut tmp = [ZERO; 6];

        for r in 0..body.dofnum {
            let q = b.qvel[body.dofadr + r];

            for (c, t) in tmp.iter_mut().enumerate() {
                *t += b.cdof_dot[6 * (body.dofadr + r) + c] * q;
            }
        }

        for c in 0..6 {
            acc[c] += tmp[c];
        }

        put(cacc, i, &acc);

        let inert: V10 = get(&b.cinert, i);
        let vel: V6 = get(&b.cvel, i);
        let f = mul_inert_vec(&inert, &acc);
        let iv = mul_inert_vec(&inert, &vel);
        let cf = cross_force(&vel, &iv);

        put(cfrc, i, &std::array::from_fn::<V, 6, _>(|c| f[c] + cf[c]));
    }

    put(cfrc, 0, &[ZERO; 6]);

    for i in (1..plan.nbody).rev() {
        let p = k.bodies[i].parent;

        if p > 0 {
            for c in 0..6 {
                let v = cfrc[6 * i + c];

                cfrc[6 * p + c] += v;
            }
        }
    }

    for d in 0..k.nv {
        let cdof: V6 = get(&b.cdof, d);
        let f: V6 = get(cfrc, k.dofs[d].body);

        b.qfrc_bias[d] = dot6(&cdof, &f);
    }
}

pub fn passive(plan: &Plan, b: &mut Block) {
    for (d, dof) in plan.kernel.dofs.iter().enumerate() {
        b.qfrc_passive[d] = if dof.damping != 0.0 {
            -b.qvel[d] * dof.damping
        } else {
            ZERO
        };
    }
}
