use crate::block::Block;
use crate::lanes::{M, ONE, V, ZERO};
use crate::plan::Plan;

pub fn jac_mul(plan: &Plan, b: &Block, x: &[V], out: &mut [V]) {
    for (row, f) in plan.friction.iter().enumerate() {
        out[row] = x[f.dof];
    }

    for &row in &b.live {
        let (a, n) = (plan.row_jadr[row], plan.row_len[row]);
        let mut s = ZERO;

        for (j, &d) in b.jac[a..a + n].iter().zip(&plan.jcol[a..a + n]) {
            s += *j * x[d];
        }

        out[row] = s;
    }
}

pub fn jac_t_mul(plan: &Plan, b: &Block, force: &[V], out: &mut [V]) {
    out.fill(ZERO);

    for (row, f) in plan.friction.iter().enumerate() {
        out[f.dof] += force[row];
    }

    for &row in &b.live {
        let (a, n) = (plan.row_jadr[row], plan.row_len[row]);
        let f = force[row];

        for (j, &d) in b.jac[a..a + n].iter().zip(&plan.jcol[a..a + n]) {
            out[d] += *j * f;
        }
    }
}

pub fn update(plan: &Plan, b: &Block, jar: &[V], force: &mut [V], quadratic: &mut [V]) -> V {
    let mut cost = ZERO;

    for row in 0..plan.friction.len() {
        let (d, x) = (b.row_d[row], jar[row]);
        let f = b.row_floss[row];
        let rf = b.row_r[row] * f;
        let neg = x.le(-rf);
        let pos = x.ge(rf);
        let linear = neg.or(pos);
        let lin_cost = -(b.row_r[row] * f * f * 0.5) + neg.select(-(f * x), f * x);

        cost += linear.select(lin_cost, d * x * x * 0.5);
        force[row] = neg.select(f, pos.select(-f, -(d * x)));
        quadratic[row] = linear.select(ZERO, ONE);
    }

    for &row in &b.live {
        let (d, x) = (b.row_d[row], jar[row]);
        let satisfied = x.ge(ZERO);

        cost += satisfied.select(ZERO, d * x * x * 0.5);
        force[row] = satisfied.select(ZERO, -(d * x));
        quadratic[row] = satisfied.select(ZERO, ONE);
    }

    cost
}

pub fn any_active(plan: &Plan, b: &Block) -> M {
    let mut m = if plan.friction.is_empty() { M::NONE } else { M::ALL };

    for &row in &b.live {
        m = m.or(b.row_active[row].gt(ZERO));
    }

    m
}

pub fn for_rows(plan: &Plan, b: &Block, mut f: impl FnMut(usize)) {
    for row in 0..plan.friction.len() {
        f(row);
    }

    for &row in &b.live {
        f(row);
    }
}
