use forge_sim::Plan;

pub const DECIMATION: usize = 10;
pub const EPISODE_ROUNDS: usize = 100;

pub fn ctrl_for(world: usize, actuator: usize, round: usize, range: Option<[f64; 2]>) -> f64 {
    let phase = (world * 7 + actuator * 13) as f64 * 0.37;
    let t = round as f64 * 0.02;
    let wave = (t * (1.5 + 0.1 * (world % 5) as f64) * std::f64::consts::TAU + phase).sin();

    match range {
        Some([lo, hi]) => 0.5 * (lo + hi) + 0.05 * (world % 4) as f64 * (hi - lo) * wave,
        None => 0.3 * wave,
    }
}

pub fn controls(plan: &Plan, world: usize, round: usize) -> Vec<f64> {
    plan.kernel
        .actuators
        .iter()
        .enumerate()
        .map(|(a, act)| ctrl_for(world, a, round, act.ctrl_range))
        .collect()
}

pub fn start_pose(plan: &Plan, world: usize) -> Vec<f64> {
    let k = &plan.kernel;
    let mut qpos = k.qpos0.clone();

    for (j, joint) in k.joints.iter().enumerate() {
        if matches!(joint.kind, forge_ir::JointKind::Hinge | forge_ir::JointKind::Slide) {
            qpos[joint.qposadr] += 0.02 * ((world * 31 + j * 17) as f64).sin();
        }
    }

    qpos
}
