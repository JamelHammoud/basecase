use crate::block::Block;
use crate::lanes::{M, ONE, V, ZERO};
use crate::plan::{Plan, RowKind};

pub fn jac_mul(plan: &Plan, b: &Block, x: &[V], out: &mut [V]) {
    for row in 0..plan.nrows {
        if !b.row_any[row] {
            out[row] = ZERO;
            continue;
        }

        let dofs = &plan.chains[plan.row_chain[row]].dofs;
        let adr = plan.row_jadr[row];
        let mut s = ZERO;

        for (t, &d) in dofs.iter().enumerate() {
            s += b.jac[adr + t] * x[d];
        }

        out[row] = s;
    }
}

pub fn jac_t_mul(plan: &Plan, b: &Block, force: &[V], out: &mut [V]) {
    out.fill(ZERO);

    for row in 0..plan.nrows {
        if !b.row_any[row] {
            continue;
        }

        let dofs = &plan.chains[plan.row_chain[row]].dofs;
        let adr = plan.row_jadr[row];
        let f = force[row];

        for (t, &d) in dofs.iter().enumerate() {
            out[d] += b.jac[adr + t] * f;
        }
    }
}

pub struct Update {
    pub cost: V,
}

pub fn update(plan: &Plan, b: &Block, jar: &[V], force: &mut [V], quadratic: &mut [V]) -> Update {
    let mut cost = ZERO;

    for row in 0..plan.nrows {
        if !b.row_any[row] {
            force[row] = ZERO;
            quadratic[row] = ZERO;
            continue;
        }

        let (d, x) = (b.row_d[row], jar[row]);
        let half = d * x * x * 0.5;

        if plan.row_kind[row] == RowKind::Friction {
            let f = b.row_floss[row];
            let rf = b.row_r[row] * f;
            let neg = x.le(-rf);
            let pos = x.ge(rf);
            let linear = neg.or(pos);
            let lin_cost = -(b.row_r[row] * f * f * 0.5) + neg.select(-(f * x), f * x);

            cost += linear.select(lin_cost, half);
            force[row] = neg.select(f, pos.select(-f, -(d * x)));
            quadratic[row] = linear.select(ZERO, ONE);
            continue;
        }

        let satisfied = x.ge(ZERO);

        cost += satisfied.select(ZERO, half);
        force[row] = satisfied.select(ZERO, -(d * x));
        quadratic[row] = satisfied.select(ZERO, ONE);
    }

    Update { cost }
}

pub fn any_active(plan: &Plan, b: &Block) -> M {
    let mut m = M::NONE;

    for row in 0..plan.nrows {
        if b.row_any[row] {
            m = m.or(b.row_active[row].gt(ZERO));
        }
    }

    m
}
