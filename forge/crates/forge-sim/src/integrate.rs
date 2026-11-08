use crate::actuation::record_ctrl;
use crate::block::Block;
use crate::inertia::{factor, solve};
use crate::lanes::{M, V};
use crate::plan::Plan;
use crate::spatial::{axis_angle_quat, mul_quat, normalize3, normalize4};
use forge_ir::JointKind;

pub struct Implicit {
    pub h: Vec<V>,
    pub h_inv: Vec<V>,
    pub qacc: Vec<V>,
    pub deriv: Vec<V>,
}

impl Implicit {
    pub fn new(plan: &Plan) -> Self {
        let nv = plan.kernel.nv;

        Self {
            h: vec![V::default(); plan.nm],
            h_inv: vec![V::default(); nv],
            qacc: vec![V::default(); nv],
            deriv: vec![V::default(); nv],
        }
    }
}

fn velocity_derivative(plan: &Plan, b: &Block, deriv: &mut [V]) {
    let k = &plan.kernel;

    deriv.fill(V::default());

    for (i, a) in k.actuators.iter().enumerate() {
        if a.bias[2] == 0.0 && b.tables.bias[i][2] == crate::lanes::ZERO {
            continue;
        }

        let active = match a.force_range {
            Some(r) => b.act_force[i].gt(V::splat(r[0])).and(b.act_force[i].lt(V::splat(r[1]))),
            None => M::ALL,
        };

        deriv[a.dof] += active.mask(b.tables.bias[i][2] * (a.gear * a.gear));
    }

    for (d, dof) in k.dofs.iter().enumerate() {
        deriv[d] -= V::splat(dof.damping);
    }
}

fn integrate_positions(plan: &Plan, b: &mut Block) {
    let k = &plan.kernel;
    let dt = k.options.timestep;

    for j in &k.joints {
        let (p, v) = (j.qposadr, j.dofadr);

        if j.kind != JointKind::Free {
            b.qpos[p] += b.qvel[v] * dt;
            continue;
        }

        for i in 0..3 {
            b.qpos[p + i] += b.qvel[v + i] * dt;
        }

        let (axis, speed) = normalize3(&[b.qvel[v + 3], b.qvel[v + 4], b.qvel[v + 5]]);
        let rot = axis_angle_quat(&axis, speed * dt);
        let quat = normalize4(&[b.qpos[p + 3], b.qpos[p + 4], b.qpos[p + 5], b.qpos[p + 6]]);
        let out = mul_quat(&quat, &rot);

        b.qpos[p + 3..p + 7].copy_from_slice(&out);
    }
}

pub fn implicit_step(plan: &Plan, b: &mut Block, w: &mut Implicit) {
    let k = &plan.kernel;
    let dt = k.options.timestep;

    velocity_derivative(plan, b, &mut w.deriv);
    w.h.copy_from_slice(&b.m);

    for i in 0..k.nv {
        let at = plan.diag(i);

        w.h[at] = b.m[at] + w.deriv[i] * (-dt);
    }

    factor(plan, &mut w.h, &mut w.h_inv);

    for i in 0..k.nv {
        w.qacc[i] = b.qfrc_smooth[i] + b.qfrc_constraint[i];
    }

    solve(plan, &w.h, &w.h_inv, &mut w.qacc);
    record_ctrl(b);

    for i in 0..k.nv {
        b.qvel[i] += w.qacc[i] * dt;
    }

    integrate_positions(plan, b);
    b.time += V::splat(dt);
    b.warm.copy_from_slice(&b.qacc);
}
