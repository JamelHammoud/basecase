use super::body::{lift, Kin};
use super::coeffs::Coeffs;
use super::dual::Real;
use super::frozen::Contact;
use crate::params::{Imp, MIN_VAL};
use crate::plan::{ContactSlot, Plan};
use crate::spatial::{add3, cross, dot3, mul_mat_vec, scl3, sub3};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Friction,
    Limit,
    Contact,
}

#[derive(Clone, Debug)]
pub struct Row<S> {
    pub kind: Kind,
    pub jac: Vec<(usize, S)>,
    pub aref: S,
    pub r: S,
    pub floss: S,
}

fn abs<S: Real>(x: S) -> S {
    if x.re() < 0.0 {
        -x
    } else {
        x
    }
}

pub fn impedance<S: Real>(imp: &Imp, pos: S, margin: f64) -> S {
    let s = &imp.solimp;

    if imp.flat() {
        return S::c(0.5 * (s[0] + s[1]));
    }

    let x = abs((pos - S::c(margin)) * (1.0 / s[2]));

    if x.re() >= 1.0 {
        return S::c(s[1]);
    }

    if x.re() <= 0.0 {
        return S::c(s[0]);
    }

    let y = if s[4] == 1.0 {
        x
    } else if x.re() <= s[3] {
        x * x * (1.0 / s[3])
    } else {
        let rest = S::c(1.0) - x;

        S::c(1.0) - rest * rest * (1.0 / (1.0 - s[3]))
    };

    S::c(s[0]) + y * (s[1] - s[0])
}

fn floor<S: Real>(r: S) -> S {
    if r.re() < MIN_VAL {
        S::c(MIN_VAL)
    } else {
        r
    }
}

fn velocity<S: Real>(jac: &[(usize, S)], qvel: &[S]) -> S {
    jac.iter().fold(S::c(0.0), |s, (d, j)| s + *j * qvel[*d])
}

fn finish<S: Real>(kind: Kind, jac: Vec<(usize, S)>, qvel: &[S], (imp, r, pos): (&Imp, S, S)) -> Row<S> {
    let aref = -(velocity(&jac, qvel) * imp.b) - pos * imp.k;

    Row {
        kind,
        jac,
        aref,
        r,
        floss: S::c(0.0),
    }
}

fn friction_rows<S: Real>(plan: &Plan, qvel: &[S], c: &Coeffs<S>, out: &mut Vec<Row<S>>) {
    for f in &plan.friction {
        out.push(Row {
            kind: Kind::Friction,
            jac: vec![(f.dof, S::c(1.0))],
            aref: -(qvel[f.dof] * f.b),
            r: S::c(f.r),
            floss: c.floss[f.dof],
        });
    }
}

fn limit_rows<S: Real>(plan: &Plan, qpos: &[S], qvel: &[S], out: &mut Vec<Row<S>>) {
    for l in &plan.limits {
        let dist = (S::c(l.bound) - qpos[l.qposadr]) * l.sign;

        if dist.re() >= l.margin {
            continue;
        }

        let imp = impedance(&l.imp, dist, l.margin);
        let r = floor((S::c(1.0) - imp) * l.diag / imp);
        let pos = imp * (dist - S::c(l.margin));

        out.push(finish(
            Kind::Limit,
            vec![(l.dof, S::c(-l.sign))],
            qvel,
            (&l.imp, r, pos),
        ));
    }
}

fn point_jacobian<S: Real>(plan: &Plan, kin: &Kin<S>, slot: &ContactSlot, pos: &[S; 3]) -> Vec<(usize, [S; 3])> {
    let chain = &plan.chains[slot.chain];

    chain
        .dofs
        .iter()
        .zip(&chain.terms)
        .map(|(&d, terms)| {
            let mut jp = [S::c(0.0); 3];

            for term in terms {
                let cdof = kin.cdof[term.dof];
                let offset = sub3(pos, &kin.subtree_com[term.root]);
                let c = cross(&[cdof[0], cdof[1], cdof[2]], &offset);

                for a in 0..3 {
                    jp[a] += (cdof[3 + a] + c[a]) * term.sign;
                }
            }

            (d, jp)
        })
        .collect()
}

fn contact_rows<S: Real>(plan: &Plan, kin: &Kin<S>, qvel: &[S], con: &Contact, out: &mut Vec<Row<S>>) {
    let slot = &plan.contacts[con.slot];
    let normal: [S; 3] = lift(&[con.frame[0], con.frame[1], con.frame[2]]);
    let surface = add3(
        &kin.xpos[con.body],
        &mul_mat_vec(&kin.xmat[con.body], &lift(&con.local)),
    );
    let dist = dot3(&normal, &surface) - S::c(con.offset);
    let pos = sub3(&surface, &scl3(&normal, dist * 0.5));
    let axes: [[S; 3]; 3] =
        std::array::from_fn(|a| lift(&[con.frame[3 * a], con.frame[3 * a + 1], con.frame[3 * a + 2]]));
    let projected: Vec<(usize, [S; 3])> = point_jacobian(plan, kin, slot, &pos)
        .into_iter()
        .map(|(d, jp)| (d, axes.map(|axis| dot3(&axis, &jp))))
        .collect();
    let slide = con.slide;
    let diag = if slot.rows == 1 {
        slot.tran
    } else {
        slot.tran + slide * slide * slot.tran
    };
    let imp = impedance(&slot.imp, dist, slot.include_margin);
    let r0 = floor((S::c(1.0) - imp) * diag / imp);
    let mu = slide * slot.ratio;
    let r = if slot.rows == 1 { r0 } else { r0 * (mu * mu * 2.0) };
    let reference = imp * (dist - S::c(slot.include_margin));

    for row in 0..slot.rows {
        let dim = 1 + row / 2;
        let signed = if row % 2 == 0 { slide } else { -slide };
        let jac = projected
            .iter()
            .map(|(d, p)| (*d, if slot.rows == 1 { p[0] } else { p[0] + p[dim] * signed }))
            .collect();

        out.push(finish(Kind::Contact, jac, qvel, (&slot.imp, r, reference)));
    }
}

pub struct RowInputs<'a, S> {
    pub qpos: &'a [S],
    pub qvel: &'a [S],
    pub coeffs: &'a Coeffs<S>,
    pub contacts: &'a [Contact],
}

pub fn rows<S: Real>(plan: &Plan, kin: &Kin<S>, x: &RowInputs<S>) -> Vec<Row<S>> {
    let mut out = Vec::new();

    friction_rows(plan, x.qvel, x.coeffs, &mut out);
    limit_rows(plan, x.qpos, x.qvel, &mut out);

    for con in x.contacts {
        contact_rows(plan, kin, x.qvel, con, &mut out);
    }

    out
}
