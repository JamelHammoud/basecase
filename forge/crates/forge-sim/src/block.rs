use crate::lanes::{LANES, V, ZERO};
use crate::plan::Plan;
use crate::state::State;
use crate::tables::Tables;

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
    pub tables: Tables,
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
    pub live: Vec<usize>,
    pub live_limits: Vec<usize>,
    pub live_slots: Vec<usize>,
    pub row_pos: Vec<V>,
    pub row_r: Vec<V>,
    pub row_d: Vec<V>,
    pub row_aref: Vec<V>,
    pub row_floss: Vec<V>,
}

fn zeros(n: usize) -> Vec<V> {
    vec![ZERO; n]
}

impl Block {
    pub fn new(plan: &Plan) -> Self {
        let k = &plan.kernel;
        let (nv, nu, nb) = (k.nv, k.nu, plan.nbody);
        let (nj, ng, ns, nr) = (k.joints.len(), k.geoms.len(), plan.contacts.len(), plan.nrows);
        let state = State::new(plan);

        Self {
            qpos: state.qpos,
            qvel: state.qvel,
            ctrl: state.ctrl,
            warm: state.warm,
            time: state.time,
            history: state.history,
            tables: state.tables,
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
            live: Vec::with_capacity(nr),
            live_limits: Vec::with_capacity(nr),
            live_slots: Vec::with_capacity(ns),
            row_pos: zeros(nr),
            row_r: zeros(nr),
            row_d: zeros(nr),
            row_aref: zeros(nr),
            row_floss: zeros(nr),
        }
    }
}
