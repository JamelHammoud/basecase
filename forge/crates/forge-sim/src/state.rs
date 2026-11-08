use crate::block::{Block, History};
use crate::lanes::{LANES, V, ZERO};
use crate::plan::Plan;
use crate::tables::Tables;

#[derive(Clone, Debug)]
pub struct State {
    pub qpos: Vec<V>,
    pub qvel: Vec<V>,
    pub ctrl: Vec<V>,
    pub warm: Vec<V>,
    pub time: V,
    pub history: Vec<History>,
    pub tables: Tables,
}

fn initial_times(n: usize, dt: f64) -> Vec<f64> {
    (0..n).map(|j| -((n - j) as f64) * dt).collect()
}

impl State {
    pub fn new(plan: &Plan) -> Self {
        let k = &plan.kernel;
        let history = k
            .actuators
            .iter()
            .enumerate()
            .filter_map(|(i, a)| {
                let n = a.delay.as_ref()?.samples;
                let times = initial_times(n, k.options.timestep);

                Some(History {
                    actuator: i,
                    times: std::array::from_fn(|_| times.clone()),
                    values: std::array::from_fn(|_| vec![0.0; n]),
                    cursor: [n - 1; LANES],
                })
            })
            .collect();

        Self {
            qpos: k.qpos0.iter().map(|&q| V::splat(q)).collect(),
            qvel: vec![ZERO; k.nv],
            ctrl: vec![ZERO; k.nu],
            warm: vec![ZERO; k.nv],
            time: ZERO,
            history,
            tables: Tables::new(k),
        }
    }

    pub fn set_ctrl(&mut self, lane: usize, ctrl: &[f64]) {
        for (c, v) in self.ctrl.iter_mut().zip(ctrl) {
            c.0[lane] = *v;
        }
    }

    pub fn set_qvel(&mut self, lane: usize, qvel: &[f64]) {
        for (c, v) in self.qvel.iter_mut().zip(qvel) {
            c.0[lane] = *v;
        }
    }

    pub fn reset(&mut self, plan: &Plan, lane: usize, qpos: &[f64]) {
        let dt = plan.kernel.options.timestep;

        for (q, v) in self.qpos.iter_mut().zip(qpos) {
            q.0[lane] = *v;
        }

        for v in self
            .qvel
            .iter_mut()
            .chain(self.warm.iter_mut())
            .chain(self.ctrl.iter_mut())
        {
            v.0[lane] = 0.0;
        }

        self.time.0[lane] = 0.0;

        for h in &mut self.history {
            let n = h.times[lane].len();

            h.times[lane] = initial_times(n, dt);
            h.values[lane].fill(0.0);
            h.cursor[lane] = n - 1;
        }
    }

    pub fn swap(&mut self, b: &mut Block) {
        std::mem::swap(&mut self.qpos, &mut b.qpos);
        std::mem::swap(&mut self.qvel, &mut b.qvel);
        std::mem::swap(&mut self.ctrl, &mut b.ctrl);
        std::mem::swap(&mut self.warm, &mut b.warm);
        std::mem::swap(&mut self.time, &mut b.time);
        std::mem::swap(&mut self.history, &mut b.history);
        std::mem::swap(&mut self.tables, &mut b.tables);
    }
}
