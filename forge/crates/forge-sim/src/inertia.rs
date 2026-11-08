use crate::block::Block;
use crate::lanes::{V, ZERO};
use crate::plan::Plan;
use crate::spatial::{dot6, get, mul_inert_vec, V10, V6};

pub fn crb(plan: &Plan, b: &mut Block) {
    let k = &plan.kernel;

    b.crb.copy_from_slice(&b.cinert);

    for i in (1..plan.nbody).rev() {
        let p = k.bodies[i].parent;

        if p > 0 {
            for c in 0..10 {
                let v = b.crb[10 * i + c];

                b.crb[10 * p + c] += v;
            }
        }
    }

    b.m.fill(ZERO);

    for i in 0..k.nv {
        let dof = &k.dofs[i];
        let mut adr = plan.diag(i);
        let crb_i: V10 = get(&b.crb, dof.body);
        let cdof_i: V6 = get(&b.cdof, i);
        let buf = mul_inert_vec(&crb_i, &cdof_i);

        b.m[adr] = V::splat(dof.armature);

        let mut j = Some(i);

        while let Some(jj) = j {
            let cdof_j: V6 = get(&b.cdof, jj);

            b.m[adr] += dot6(&cdof_j, &buf);
            adr = adr.wrapping_sub(1);
            j = k.dofs[jj].parent;
        }
    }
}

pub fn factor(plan: &Plan, mat: &mut [V], diag_inv: &mut [V]) {
    plan.pattern.factor(mat, diag_inv);
}

pub fn solve(plan: &Plan, ld: &[V], diag_inv: &[V], x: &mut [V]) {
    plan.pattern.solve(ld, diag_inv, x);
}

pub fn mul_sym(plan: &Plan, mat: &[V], x: &[V], out: &mut [V]) {
    plan.pattern.mul_sym(mat, x, out);
}

pub fn factor_m(plan: &Plan, b: &mut Block) {
    b.ld.copy_from_slice(&b.m);
    factor(plan, &mut b.ld, &mut b.ld_inv);
}
