use crate::block::Block;
use crate::lanes::{ONE, V, ZERO};
use crate::params::MIN_VAL;
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
    let nv = plan.kernel.nv;

    for k in (0..nv).rev() {
        let start = plan.m_adr[k];
        let end = plan.diag(k);
        let pivot = mat[end].max(V::splat(MIN_VAL));
        let pivot = mat[end].lt(V::splat(MIN_VAL)).select(pivot, mat[end]);

        mat[end] = pivot;

        let inv = ONE / pivot;

        diag_inv[k] = inv;

        for adr in (start..end).rev() {
            let i = plan.m_col[adr];
            let s = mat[adr] * inv;
            let (ri, ni) = (plan.m_adr[i], plan.m_nnz[i]);

            for t in 0..ni {
                let v = mat[start + t] * s;

                mat[ri + t] -= v;
            }
        }

        for v in &mut mat[start..end] {
            *v *= inv;
        }
    }
}

pub fn solve(plan: &Plan, ld: &[V], diag_inv: &[V], x: &mut [V]) {
    let nv = plan.kernel.nv;

    for i in (0..nv).rev() {
        let xi = x[i];

        for adr in plan.m_adr[i]..plan.diag(i) {
            let v = ld[adr] * xi;

            x[plan.m_col[adr]] -= v;
        }
    }

    for i in 0..nv {
        x[i] *= diag_inv[i];
    }

    for i in 0..nv {
        let mut s = ZERO;

        for adr in plan.m_adr[i]..plan.diag(i) {
            s += ld[adr] * x[plan.m_col[adr]];
        }

        x[i] -= s;
    }
}

pub fn mul_sym(plan: &Plan, mat: &[V], x: &[V], out: &mut [V]) {
    let nv = plan.kernel.nv;

    for i in 0..nv {
        out[i] = mat[plan.diag(i)] * x[i];
    }

    for i in 0..nv {
        for adr in plan.m_adr[i]..plan.diag(i) {
            let j = plan.m_col[adr];

            out[i] += mat[adr] * x[j];
            out[j] += mat[adr] * x[i];
        }
    }
}

pub fn factor_m(plan: &Plan, b: &mut Block) {
    b.ld.copy_from_slice(&b.m);
    factor(plan, &mut b.ld, &mut b.ld_inv);
}
