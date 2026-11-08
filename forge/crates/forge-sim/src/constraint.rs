use crate::block::Block;
use crate::lanes::{M, ONE, V, ZERO};
use crate::params::{impedance_v, Imp, MIN_VAL};
use crate::plan::{ContactSlot, Plan};
use crate::spatial::{cross, dot3, get, sub3, V3, V9};

fn row_vel(plan: &Plan, b: &Block, row: usize) -> V {
    let chain = &plan.chains[plan.row_chain[row]];
    let adr = plan.row_jadr[row];
    let mut v = ZERO;

    for (t, &d) in chain.dofs.iter().enumerate() {
        v += b.jac[adr + t] * b.qvel[d];
    }

    v
}

struct RowValues {
    active: M,
    pos: V,
    r: V,
    aref_pos: V,
}

fn finish_row(plan: &Plan, b: &mut Block, row: usize, values: &RowValues, imp: &Imp) {
    let vel = row_vel(plan, b, row);
    let aref = -(vel * imp.b) - values.aref_pos;
    let active = values.active;

    b.row_active[row] = active.select(ONE, ZERO);
    b.row_any[row] = active.any();
    b.row_pos[row] = values.pos;
    b.row_r[row] = active.select(values.r, ONE);
    b.row_d[row] = active.select(ONE / values.r, ZERO);
    b.row_aref[row] = active.select(aref, -ONE);
}

fn friction(plan: &Plan, b: &mut Block) {
    for (row, f) in plan.friction.iter().enumerate() {
        let adr = plan.row_jadr[row];

        b.jac[adr] = ONE;
        b.row_floss[row] = V::splat(f.loss);
        b.row_active[row] = ONE;
        b.row_any[row] = true;
        b.row_pos[row] = ZERO;
        b.row_r[row] = V::splat(f.r);
        b.row_d[row] = V::splat(1.0 / f.r);
        b.row_aref[row] = -(b.qvel[f.dof] * f.b);
    }
}

fn limits(plan: &Plan, b: &mut Block) {
    let first = plan.friction.len();

    for (i, l) in plan.limits.iter().enumerate() {
        let row = first + i;
        let value = b.qpos[l.qposadr];
        let dist = (V::splat(l.bound) - value) * l.sign;
        let margin = V::splat(l.margin);
        let active = dist.lt(margin);
        let imp = impedance_v(&l.imp, dist, margin);
        let r = ((ONE - imp) * l.diag / imp).max(V::splat(MIN_VAL));

        b.jac[plan.row_jadr[row]] = active.select(V::splat(-l.sign), ZERO);
        b.row_floss[row] = ZERO;

        let values = RowValues {
            active,
            pos: dist,
            r,
            aref_pos: imp * l.imp.k * (dist - margin),
        };

        finish_row(plan, b, row, &values, &l.imp);
    }
}

fn point_jacobian(plan: &Plan, b: &Block, slot: &ContactSlot, pos: &V3, out: &mut [V3]) {
    let chain = &plan.chains[slot.chain];

    for (t, terms) in chain.terms.iter().enumerate() {
        let mut jp = [ZERO; 3];

        for term in terms {
            let cdof: [V; 6] = get(&b.cdof, term.dof);
            let offset = sub3(pos, &get(&b.subtree_com, term.root));
            let c = cross(&[cdof[0], cdof[1], cdof[2]], &offset);

            for a in 0..3 {
                jp[a] += (cdof[3 + a] + c[a]) * term.sign;
            }
        }

        out[t] = jp;
    }
}

fn contact_rows(plan: &Plan, b: &mut Block, s: usize, jp: &mut [V3]) {
    let slot = &plan.contacts[s];
    let n = plan.chains[slot.chain].dofs.len();
    let dist = b.con_dist[s];
    let margin = V::splat(slot.include_margin);
    let active = b.con_found[s].gt(ZERO).and(dist.lt(margin));

    if !active.any() {
        for r in 0..slot.rows {
            b.row_any[slot.row + r] = false;
            b.row_active[slot.row + r] = ZERO;
            b.row_aref[slot.row + r] = -ONE;
            b.row_d[slot.row + r] = ZERO;
        }

        return;
    }

    let pos: V3 = get(&b.con_pos, s);
    let frame: V9 = get(&b.con_frame, s);

    point_jacobian(plan, b, slot, &pos, &mut jp[..n]);

    let imp = impedance_v(&slot.imp, dist, margin);
    let r0 = ((ONE - imp) * slot.diag / imp).max(V::splat(MIN_VAL));
    let r = if slot.rows == 1 {
        r0
    } else {
        r0 * (2.0 * slot.mu * slot.mu)
    };
    let values = RowValues {
        active,
        pos: dist,
        r,
        aref_pos: imp * slot.imp.k * (dist - margin),
    };

    for row in 0..slot.rows {
        let adr = plan.row_jadr[slot.row + row];

        for (t, p) in jp[..n].iter().enumerate() {
            let normal = dot3(&[frame[0], frame[1], frame[2]], p);
            let value = if slot.rows == 1 {
                normal
            } else {
                let dim = row / 2;
                let axis = [frame[3 + 3 * dim], frame[4 + 3 * dim], frame[5 + 3 * dim]];
                let mu = slot.frictions[dim] * if row % 2 == 0 { 1.0 } else { -1.0 };

                normal + dot3(&axis, p) * mu
            };

            b.jac[adr + t] = active.mask(value);
        }

        b.row_floss[slot.row + row] = ZERO;
        finish_row(plan, b, slot.row + row, &values, &slot.imp);
    }
}

pub fn assemble(plan: &Plan, b: &mut Block, scratch: &mut Vec<V3>) {
    let longest = plan.chains.iter().map(|c| c.dofs.len()).max().unwrap_or(0);

    scratch.resize(longest, [ZERO; 3]);
    friction(plan, b);
    limits(plan, b);

    for s in 0..plan.contacts.len() {
        contact_rows(plan, b, s, scratch);
    }
}
