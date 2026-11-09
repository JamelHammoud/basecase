use super::body::{kinematics, normalize4};
use super::coeffs::Coeffs;
use super::dual::Real;
use super::dynamics::{dynamics, Inputs};
use super::frozen::Frozen;
use super::rows::{rows, Row, RowInputs};
use super::solve::{chol_solve, law, residual, spd_solve, Problem, Smooth};
use crate::plan::Plan;
use crate::spatial::mul_quat;
use forge_ir::JointKind;

const SERIES_BELOW: f64 = 1e-6;

pub struct World<'a, S> {
    pub qpos: &'a [S],
    pub qvel: &'a [S],
    pub ctrl: &'a [S],
    pub coeffs: &'a Coeffs<S>,
}

fn real_row<S: Real>(r: &Row<S>) -> Row<f64> {
    Row {
        kind: r.kind,
        jac: r.jac.iter().map(|(d, j)| (*d, j.re())).collect(),
        aref: r.aref.re(),
        r: r.r.re(),
        floss: r.floss.re(),
    }
}

fn rotation<S: Real>(w: &[S; 3], dt: f64) -> [S; 4] {
    let theta2 = (w[0] * w[0] + w[1] * w[1] + w[2] * w[2]) * (dt * dt);
    let (c, s) = if theta2.re() < SERIES_BELOW {
        let q = theta2 * 0.25;

        (
            S::c(1.0) - q * 0.5 + q * q * (1.0 / 24.0),
            (S::c(1.0) - q * (1.0 / 6.0) + q * q * (1.0 / 120.0)) * (0.5 * dt),
        )
    } else {
        let half = theta2.sqrt() * 0.5;
        let (sin, cos) = half.sin_cos();

        (cos, sin / half * (0.5 * dt))
    };

    [c, w[0] * s, w[1] * s, w[2] * s]
}

pub fn integrate<S: Real>(plan: &Plan, qpos: &[S], qvel: &[S]) -> Vec<S> {
    let k = &plan.kernel;
    let dt = k.options.timestep;
    let mut out = qpos.to_vec();

    for j in &k.joints {
        let (p, v) = (j.qposadr, j.dofadr);

        if j.kind != JointKind::Free {
            out[p] = qpos[p] + qvel[v] * dt;
            continue;
        }

        for i in 0..3 {
            out[p + i] = qpos[p + i] + qvel[v + i] * dt;
        }

        let rot = rotation(&[qvel[v + 3], qvel[v + 4], qvel[v + 5]], dt);
        let quat = normalize4(&[qpos[p + 3], qpos[p + 4], qpos[p + 5], qpos[p + 6]]);

        out[p + 3..p + 7].copy_from_slice(&mul_quat(&quat, &rot));
    }

    out
}

fn constraint_force<S: Real>(n: usize, rows: &[Row<S>], a: &[S], smoothing: f64) -> Vec<S> {
    let mut out = vec![S::c(0.0); n];

    for row in rows {
        let f = law(row, residual(row, a), smoothing).force;

        for (d, j) in &row.jac {
            out[*d] += *j * f;
        }
    }

    out
}

pub struct Next<S> {
    pub qpos: Vec<S>,
    pub qvel: Vec<S>,
    pub qacc: Vec<f64>,
}

pub fn substep<S: Real>(plan: &Plan, x: &World<S>, frozen: &Frozen, shape: Smooth) -> Option<Next<S>> {
    let smoothing = shape.force;
    let k = &plan.kernel;
    let n = k.nv;
    let kin = kinematics(k, x.qpos, x.coeffs);
    let inputs = Inputs {
        qpos: x.qpos,
        qvel: x.qvel,
        ctrl: x.ctrl,
        coeffs: x.coeffs,
    };
    let dynamics = dynamics(k, &kin, &inputs);
    let rows_s = rows(
        plan,
        &kin,
        &RowInputs {
            qpos: x.qpos,
            qvel: x.qvel,
            coeffs: x.coeffs,
            contacts: &frozen.contacts,
        },
    );
    let m: Vec<f64> = dynamics.m.iter().map(|v| v.re()).collect();
    let smooth: Vec<f64> = dynamics.smooth.iter().map(|v| v.re()).collect();
    let rows_re: Vec<Row<f64>> = rows_s.iter().map(real_row).collect();
    let problem = Problem {
        n,
        m: &m,
        smooth: &smooth,
        rows: &rows_re,
        smoothing,
    };
    let (a, h) = problem.solve(&frozen.qacc)?;
    let mut g: Vec<S> = (0..n)
        .map(|i| (0..n).fold(-dynamics.smooth[i], |s, j| s + dynamics.m[i * n + j] * a[j]))
        .collect();
    let lifted: Vec<S> = a.iter().map(|v| S::c(*v)).collect();

    for (gi, fi) in g.iter_mut().zip(constraint_force(n, &rows_s, &lifted, smoothing)) {
        *gi -= fi;
    }

    chol_solve(&h, n, &mut g);

    let qacc: Vec<S> = lifted.iter().zip(&g).map(|(a, d)| *a - *d).collect();
    let force = constraint_force(n, &rows_s, &qacc, smoothing);
    let dt = k.options.timestep;
    let mut implicit = dynamics.m.clone();

    for i in 0..n {
        implicit[i * n + i] -= dynamics.deriv[i] * dt;
    }

    let rhs: Vec<S> = dynamics.smooth.iter().zip(&force).map(|(s, f)| *s + *f).collect();
    let accel = spd_solve(&implicit, n, &rhs)?;
    let qvel: Vec<S> = x.qvel.iter().zip(&accel).map(|(v, a)| *v + *a * dt).collect();

    Some(Next {
        qpos: integrate(plan, x.qpos, &qvel),
        qvel,
        qacc: a,
    })
}
