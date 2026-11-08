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

pub struct Waves {
    nu: usize,
    phase: Vec<[f64; 2]>,
    turn: Vec<[f64; 2]>,
    center: Vec<f64>,
    amplitude: Vec<f64>,
}

impl Waves {
    pub fn new(plan: &Plan, envs: usize) -> Self {
        let acts = &plan.kernel.actuators;
        let nu = acts.len();
        let mut waves = Self {
            nu,
            phase: Vec::with_capacity(envs * nu),
            turn: Vec::with_capacity(envs),
            center: Vec::with_capacity(envs * nu),
            amplitude: Vec::with_capacity(envs * nu),
        };

        for world in 0..envs {
            let rate = 0.02 * (1.5 + 0.1 * (world % 5) as f64) * std::f64::consts::TAU;

            waves.turn.push([rate.sin(), rate.cos()]);

            for (a, act) in acts.iter().enumerate() {
                let phase = (world * 7 + a * 13) as f64 * 0.37;
                let (center, amplitude) = match act.ctrl_range {
                    Some([lo, hi]) => (0.5 * (lo + hi), 0.05 * (world % 4) as f64 * (hi - lo)),
                    None => (0.0, 0.3),
                };

                waves.phase.push([phase.sin(), phase.cos()]);
                waves.center.push(center);
                waves.amplitude.push(amplitude);
            }
        }

        waves
    }

    pub fn write(&self, world: usize, out: &mut [f64]) {
        let at = world * self.nu;

        for (k, o) in out.iter_mut().enumerate().take(self.nu) {
            *o = self.center[at + k] + self.amplitude[at + k] * self.phase[at + k][0];
        }
    }

    pub fn advance(&mut self) {
        for (w, [ts, tc]) in self.turn.iter().enumerate() {
            for p in &mut self.phase[w * self.nu..(w + 1) * self.nu] {
                *p = [p[0] * tc + p[1] * ts, p[1] * tc - p[0] * ts];
            }
        }
    }
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
