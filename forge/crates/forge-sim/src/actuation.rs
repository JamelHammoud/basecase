use crate::block::Block;
use crate::history;
use crate::lanes::{LANES, V, ZERO};
use crate::plan::Plan;
use forge_ir::Interp;

const MAX_VAL: f64 = 1e10;

fn delayed_ctrl(plan: &Plan, b: &mut Block, ctrl: &mut [V]) {
    let k = &plan.kernel;
    let time = b.time;

    for h in &mut b.history {
        let a = &k.actuators[h.actuator];
        let Some(delay) = &a.delay else { continue };
        let linear = delay.interp == Interp::Linear;

        for lane in 0..LANES {
            let t = time.0[lane] - delay.seconds;

            ctrl[h.actuator].0[lane] = history::lane(h, lane).read(t, linear);
        }
    }
}

fn zero_bad_lanes(ctrl: &mut [V]) {
    for lane in 0..LANES {
        let bad = ctrl.iter().any(|c| {
            let x = c.0[lane];

            x.is_nan() || !(-MAX_VAL..=MAX_VAL).contains(&x)
        });

        if bad {
            for c in ctrl.iter_mut() {
                c.0[lane] = 0.0;
            }
        }
    }
}

pub fn effective_ctrl(plan: &Plan, b: &mut Block, ctrl: &mut [V]) {
    let k = &plan.kernel;

    ctrl.copy_from_slice(&b.ctrl);
    delayed_ctrl(plan, b, ctrl);

    if k.options.clamp_ctrl {
        for (c, a) in ctrl.iter_mut().zip(&k.actuators) {
            if let Some(r) = a.ctrl_range {
                *c = c.clip(V::splat(r[0]), V::splat(r[1]));
            }
        }
    }

    zero_bad_lanes(ctrl);
}

pub fn actuation(plan: &Plan, b: &mut Block, ctrl: &mut [V]) {
    let k = &plan.kernel;

    effective_ctrl(plan, b, ctrl);
    b.qfrc_actuator.fill(ZERO);

    for (i, a) in k.actuators.iter().enumerate() {
        let length = b.qpos[a.qposadr] * a.gear;
        let velocity = b.qvel[a.dof] * a.gear;
        let p = b.tables.bias[i];
        let bias = p[0] + length * p[1] + velocity * p[2];
        let mut force = ctrl[i] * b.tables.gain[i] + bias;

        if let Some(r) = a.force_range {
            force = force.clip(V::splat(r[0]), V::splat(r[1]));
        }

        b.act_force[i] = force;
        b.qfrc_actuator[a.dof] += force * a.gear;
    }
}

pub fn record_ctrl(b: &mut Block) {
    let time = b.time;

    for h in &mut b.history {
        let value = b.ctrl[h.actuator];

        for lane in 0..LANES {
            history::lane(h, lane).insert(time.0[lane], value.0[lane]);
        }
    }
}
