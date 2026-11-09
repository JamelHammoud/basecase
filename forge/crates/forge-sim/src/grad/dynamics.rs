use super::body::Kin;
use super::coeffs::Coeffs;
use super::dual::Real;
use crate::spatial::{cross_force, cross_motion, dot6, mul_inert_vec};
use forge_ir::{JointKind, Kernel};

const MAX_VAL: f64 = 1e10;

pub struct Dyn<S> {
    pub m: Vec<S>,
    pub smooth: Vec<S>,
    pub deriv: Vec<S>,
}

pub fn mass_matrix<S: Real>(k: &Kernel, kin: &Kin<S>, c: &Coeffs<S>) -> Vec<S> {
    let nv = k.nv;
    let mut crb = kin.cinert.clone();
    let mut m = vec![S::c(0.0); nv * nv];

    for i in (1..k.bodies.len()).rev() {
        let p = k.bodies[i].parent;

        if p > 0 {
            for t in 0..10 {
                let v = crb[i][t];

                crb[p][t] += v;
            }
        }
    }

    for i in 0..nv {
        let buf = mul_inert_vec(&crb[k.dofs[i].body], &kin.cdof[i]);
        let mut j = Some(i);

        m[i * nv + i] = c.armature[i];

        while let Some(jj) = j {
            let value = dot6(&kin.cdof[jj], &buf);

            m[i * nv + jj] += value;

            if jj != i {
                m[jj * nv + i] += value;
            }

            j = k.dofs[jj].parent;
        }
    }

    m
}

fn add_dofs<S: Real>(kin: &Kin<S>, qvel: &[S], cvel: &mut [S; 6], (first, count): (usize, usize)) {
    for r in 0..count {
        for t in 0..6 {
            cvel[t] += kin.cdof[first + r][t] * qvel[first + r];
        }
    }
}

fn velocities<S: Real>(k: &Kernel, kin: &Kin<S>, qvel: &[S]) -> (Vec<[S; 6]>, Vec<[S; 6]>) {
    let zero = [S::c(0.0); 6];
    let mut cvel = vec![zero; k.bodies.len()];
    let mut cdof_dot = vec![zero; k.nv];

    for i in 1..k.bodies.len() {
        let body = &k.bodies[i];
        let mut v = cvel[body.parent];
        let mut d = body.dofadr;

        while d < body.dofadr + body.dofnum {
            if k.joints[k.dofs[d].joint].kind == JointKind::Free {
                add_dofs(kin, qvel, &mut v, (d, 3));

                for r in 0..3 {
                    cdof_dot[d + 3 + r] = cross_motion(&v, &kin.cdof[d + 3 + r]);
                }

                add_dofs(kin, qvel, &mut v, (d + 3, 3));
                d += 6;
                continue;
            }

            cdof_dot[d] = cross_motion(&v, &kin.cdof[d]);
            add_dofs(kin, qvel, &mut v, (d, 1));
            d += 1;
        }

        cvel[i] = v;
    }

    (cvel, cdof_dot)
}

pub fn bias_forces<S: Real>(k: &Kernel, kin: &Kin<S>, qvel: &[S]) -> Vec<S> {
    let g = k.options.gravity;
    let nb = k.bodies.len();
    let (cvel, cdof_dot) = velocities(k, kin, qvel);
    let zero = S::c(0.0);
    let mut cacc = vec![[zero; 6]; nb];
    let mut cfrc = vec![[zero; 6]; nb];

    cacc[0] = [zero, zero, zero, S::c(-g[0]), S::c(-g[1]), S::c(-g[2])];

    for i in 1..nb {
        let body = &k.bodies[i];
        let mut acc = cacc[body.parent];

        for r in 0..body.dofnum {
            for t in 0..6 {
                acc[t] += cdof_dot[body.dofadr + r][t] * qvel[body.dofadr + r];
            }
        }

        cacc[i] = acc;

        let f = mul_inert_vec(&kin.cinert[i], &acc);
        let cf = cross_force(&cvel[i], &mul_inert_vec(&kin.cinert[i], &cvel[i]));

        cfrc[i] = std::array::from_fn(|t| f[t] + cf[t]);
    }

    for i in (1..nb).rev() {
        let p = k.bodies[i].parent;

        if p > 0 {
            for t in 0..6 {
                let v = cfrc[i][t];

                cfrc[p][t] += v;
            }
        }
    }

    (0..k.nv).map(|d| dot6(&kin.cdof[d], &cfrc[k.dofs[d].body])).collect()
}

fn effective_ctrl<S: Real>(k: &Kernel, ctrl: &[S]) -> Vec<S> {
    let bad = ctrl
        .iter()
        .any(|c| c.re().is_nan() || !(-MAX_VAL..=MAX_VAL).contains(&c.re()));

    if bad {
        return vec![S::c(0.0); ctrl.len()];
    }

    ctrl.iter()
        .zip(&k.actuators)
        .map(|(c, a)| match a.ctrl_range {
            Some(r) if k.options.clamp_ctrl && c.re() < r[0] => S::c(r[0]),
            Some(r) if k.options.clamp_ctrl && c.re() > r[1] => S::c(r[1]),
            _ => *c,
        })
        .collect()
}

pub struct Inputs<'a, S> {
    pub qpos: &'a [S],
    pub qvel: &'a [S],
    pub ctrl: &'a [S],
    pub coeffs: &'a Coeffs<S>,
}

pub fn dynamics<S: Real>(k: &Kernel, kin: &Kin<S>, x: &Inputs<S>) -> Dyn<S> {
    let c = x.coeffs;
    let nv = k.nv;
    let bias = bias_forces(k, kin, x.qvel);
    let ctrl = effective_ctrl(k, x.ctrl);
    let mut smooth: Vec<S> = (0..nv).map(|d| -(x.qvel[d] * c.damping[d]) - bias[d]).collect();
    let mut deriv: Vec<S> = (0..nv).map(|d| -c.damping[d]).collect();

    for (i, a) in k.actuators.iter().enumerate() {
        let gear = c.gear[i];
        let p = c.bias[i];
        let mut force = ctrl[i] * c.gain[i] + p[0] + x.qpos[a.qposadr] * gear * p[1] + x.qvel[a.dof] * gear * p[2];
        let mut free = true;

        if let Some(r) = a.force_range {
            if force.re() < r[0] || force.re() > r[1] {
                force = S::c(force.re().clamp(r[0], r[1]));
                free = false;
            }

            free &= force.re() > r[0] && force.re() < r[1];
        }

        smooth[a.dof] += force * gear;

        if free && !(a.bias[2] == 0.0 && p[2].re() == 0.0) {
            deriv[a.dof] += p[2] * (gear * gear);
        }
    }

    Dyn {
        m: mass_matrix(k, kin, c),
        smooth,
        deriv,
    }
}
