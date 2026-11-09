use super::sink::{idx, Sink};
use crate::plan::Plan;
use forge_ir::Interp;

pub fn history_len(plan: &Plan) -> usize {
    plan.kernel
        .actuators
        .iter()
        .filter_map(|a| a.delay.as_ref())
        .map(|d| 2 * d.samples + 1)
        .sum()
}

fn delays(e: &mut impl Sink, plan: &Plan) {
    let mut act_delay = Vec::new();
    let (mut n, mut adr, mut linear, mut seconds) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let mut at = 0;

    for a in &plan.kernel.actuators {
        let Some(d) = &a.delay else {
            act_delay.push(-1);
            continue;
        };

        act_delay.push(idx(n.len()));
        n.push(idx(d.samples));
        adr.push(idx(at));
        linear.push(i64::from(d.interp == Interp::Linear));
        seconds.push(d.seconds);
        at += 2 * d.samples + 1;
    }

    e.ints("ACT_DELAY", act_delay);
    e.ints("DELAY_N", n);
    e.ints("DELAY_ADR", adr);
    e.ints("DELAY_LINEAR", linear);
    e.reals("DELAY_SECONDS", seconds);
}

fn ranges(e: &mut impl Sink, name: &str, ranges: &[Option<[f64; 2]>]) {
    e.ints(
        &format!("{name}_LIMITED"),
        ranges.iter().map(|r| i64::from(r.is_some())),
    );
    e.reals(&format!("{name}_LO"), ranges.iter().map(|r| r.map_or(0.0, |r| r[0])));
    e.reals(&format!("{name}_HI"), ranges.iter().map(|r| r.map_or(0.0, |r| r[1])));
}

pub fn emit(e: &mut impl Sink, plan: &Plan) {
    let acts = &plan.kernel.actuators;
    let ctrl: Vec<_> = acts.iter().map(|a| a.ctrl_range).collect();
    let force: Vec<_> = acts.iter().map(|a| a.force_range).collect();

    e.ints("ACT_DOF", acts.iter().map(|a| idx(a.dof)));
    e.ints("ACT_QPOSADR", acts.iter().map(|a| idx(a.qposadr)));
    e.reals("ACT_GEAR", acts.iter().map(|a| a.gear));
    e.reals("ACT_GEAR2", acts.iter().map(|a| a.gear * a.gear));
    ranges(e, "ACT_CTRL", &ctrl);
    ranges(e, "ACT_FORCE", &force);
    delays(e, plan);
}

pub fn options(e: &mut impl Sink, plan: &Plan) {
    let o = &plan.kernel.options;

    e.define("ITERATIONS", o.iterations);
    e.define("LS_ITERATIONS", o.ls_iterations);
    e.define("WARMSTART", i32::from(o.warmstart));
    e.define("CLAMP_CTRL", i32::from(o.clamp_ctrl));
    e.constant("DT", o.timestep);
    e.constant("TOLERANCE", o.tolerance);
    e.constant("TOL_LS", o.tolerance * o.ls_tolerance);
    e.reals("GRAVITY", o.gravity);
}
