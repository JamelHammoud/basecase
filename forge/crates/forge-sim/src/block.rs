use crate::lanes::{LANES, V, ZERO};
use crate::plan::Plan;

#[derive(Clone, Debug)]
pub struct History {
    pub actuator: usize,
    pub times: [Vec<f64>; LANES],
    pub values: [Vec<f64>; LANES],
    pub cursor: [usize; LANES],
}

#[derive(Clone, Debug)]
pub struct Block {
    pub qpos: Vec<V>,
    pub qvel: Vec<V>,
    pub ctrl: Vec<V>,
    pub warm: Vec<V>,
    pub time: V,
    pub history: Vec<History>,
    pub xpos: Vec<V>,
    pub xquat: Vec<V>,
    pub xmat: Vec<V>,
    pub xipos: Vec<V>,
    pub ximat: Vec<V>,
    pub xanchor: Vec<V>,
    pub xaxis: Vec<V>,
    pub geom_xpos: Vec<V>,
    pub geom_xmat: Vec<V>,
    pub subtree_com: Vec<V>,
    pub cinert: Vec<V>,
    pub crb: Vec<V>,
    pub cdof: Vec<V>,
    pub cvel: Vec<V>,
    pub cdof_dot: Vec<V>,
    pub m: Vec<V>,
    pub ld: Vec<V>,
    pub ld_inv: Vec<V>,
    pub qfrc_bias: Vec<V>,
    pub qfrc_passive: Vec<V>,
    pub qfrc_actuator: Vec<V>,
    pub qfrc_smooth: Vec<V>,
    pub qacc_smooth: Vec<V>,
    pub qacc: Vec<V>,
    pub qfrc_constraint: Vec<V>,
    pub act_force: Vec<V>,
    pub con_dist: Vec<V>,
    pub con_pos: Vec<V>,
    pub con_frame: Vec<V>,
    pub con_found: Vec<V>,
    pub ncon: V,
    pub jac: Vec<V>,
    pub row_active: Vec<V>,
    pub row_any: Vec<bool>,
    pub row_pos: Vec<V>,
    pub row_r: Vec<V>,
    pub row_d: Vec<V>,
    pub row_aref: Vec<V>,
    pub row_floss: Vec<V>,
}

fn zeros(n: usize) -> Vec<V> {
    vec![ZERO; n]
}

fn initial_times(n: usize, dt: f64) -> Vec<f64> {
    (0..n).map(|j| -((n - j) as f64) * dt).collect()
}

impl Block {
    pub fn set_ctrl(&mut self, lane: usize, ctrl: &[f64]) {
        for (c, v) in self.ctrl.iter_mut().zip(ctrl) {
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

    pub fn new(plan: &Plan) -> Self {
        let k = &plan.kernel;
        let (nv, nu, nb) = (k.nv, k.nu, plan.nbody);
        let (nj, ng, ns, nr) = (k.joints.len(), k.geoms.len(), plan.contacts.len(), plan.nrows);
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
            qvel: zeros(nv),
            ctrl: zeros(nu),
            warm: zeros(nv),
            time: ZERO,
            history,
            xpos: zeros(3 * nb),
            xquat: zeros(4 * nb),
            xmat: zeros(9 * nb),
            xipos: zeros(3 * nb),
            ximat: zeros(9 * nb),
            xanchor: zeros(3 * nj),
            xaxis: zeros(3 * nj),
            geom_xpos: zeros(3 * ng),
            geom_xmat: zeros(9 * ng),
            subtree_com: zeros(3 * nb),
            cinert: zeros(10 * nb),
            crb: zeros(10 * nb),
            cdof: zeros(6 * nv),
            cvel: zeros(6 * nb),
            cdof_dot: zeros(6 * nv),
            m: zeros(plan.nm),
            ld: zeros(plan.nm),
            ld_inv: zeros(nv),
            qfrc_bias: zeros(nv),
            qfrc_passive: zeros(nv),
            qfrc_actuator: zeros(nv),
            qfrc_smooth: zeros(nv),
            qacc_smooth: zeros(nv),
            qacc: zeros(nv),
            qfrc_constraint: zeros(nv),
            act_force: zeros(nu),
            con_dist: zeros(ns),
            con_pos: zeros(3 * ns),
            con_frame: zeros(9 * ns),
            con_found: zeros(ns),
            ncon: ZERO,
            jac: zeros(plan.njac),
            row_active: zeros(nr),
            row_any: vec![false; nr],
            row_pos: zeros(nr),
            row_r: zeros(nr),
            row_d: zeros(nr),
            row_aref: zeros(nr),
            row_floss: zeros(nr),
        }
    }
}
