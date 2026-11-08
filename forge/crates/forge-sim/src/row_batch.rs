use crate::lanes::LANES;
use crate::plan::Plan;
use crate::rowmap::RowMap;
use crate::state::State;
use crate::step::{step, Workspace};
use crate::world_params::WorldParams;
use forge_ir::Kernel;
use forge_mujoco::{Data, Model};
use rayon::prelude::*;
use rayon::{ThreadPool, ThreadPoolBuilder};
use std::sync::Mutex;

pub use crate::world_params::EXPANDABLE;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Offsets {
    pub nstate: usize,
    pub time: usize,
    pub qpos: usize,
    pub qvel: usize,
    pub warm: usize,
    pub ctrl: usize,
}

struct Unit {
    state: State,
    sims: [usize; LANES],
    real: usize,
}

struct SimRow {
    row: Vec<f64>,
    contacts: f64,
    work: f64,
    failed: bool,
}

pub struct RowBatch {
    plan: Plan,
    map: RowMap,
    rows: Vec<Mutex<SimRow>>,
    order: Vec<usize>,
    units: Vec<Mutex<Unit>>,
    spaces: Vec<Mutex<Workspace>>,
    pool: ThreadPool,
    nsim: usize,
    params: WorldParams,
    error: Option<String>,
}

fn pool(threads: usize) -> Result<ThreadPool, String> {
    ThreadPoolBuilder::new()
        .num_threads(threads.max(1))
        .build()
        .map_err(|e| format!("Couldn't start Forge's physics threads: {e}"))
}

fn default_row(model: &Model, nstate: usize) -> Vec<f64> {
    let data = Data::new(model);
    let mut row = vec![0.0; nstate];

    data.get_state(model, &mut row, forge_mujoco::integration_state());
    row
}

impl RowBatch {
    pub fn new(model: &Model, kernel: Kernel, nsim: usize, threads: usize) -> Result<Self, String> {
        let plan = Plan::new(kernel);
        let map = RowMap::new(model)?;
        let start = default_row(model, map.nstate);
        let rows = (0..nsim)
            .map(|_| {
                Mutex::new(SimRow {
                    row: start.clone(),
                    contacts: 0.0,
                    work: 0.0,
                    failed: false,
                })
            })
            .collect();
        let units = (0..nsim.div_ceil(LANES))
            .map(|_| {
                Mutex::new(Unit {
                    state: State::new(&plan),
                    sims: [0; LANES],
                    real: 0,
                })
            })
            .collect();
        let spaces = (0..threads.max(1)).map(|_| Mutex::new(Workspace::new(&plan))).collect();

        Ok(Self {
            pool: pool(threads)?,
            params: WorldParams::new(model, nsim)?,
            plan,
            map,
            rows,
            order: (0..nsim).collect(),
            units,
            spaces,
            nsim,
            error: None,
        })
    }

    pub fn offsets(&self) -> Offsets {
        let m = &self.map;

        Offsets {
            nstate: m.nstate,
            time: m.time,
            qpos: m.qpos,
            qvel: m.qvel,
            warm: m.warm,
            ctrl: m.ctrl,
        }
    }

    pub fn nsim(&self) -> usize {
        self.nsim
    }

    pub fn nthread(&self) -> usize {
        self.spaces.len()
    }

    pub fn row(&mut self, sim: usize) -> &mut [f64] {
        &mut self.rows[sim].get_mut().expect("row lock").row
    }

    pub fn contacts(&self, sim: usize) -> f64 {
        self.rows[sim].lock().expect("row lock").contacts
    }

    pub fn expand(&mut self, field: &str) -> Result<(&mut [f64], usize), String> {
        self.params.expand(field)
    }

    pub fn rethread(&mut self, threads: usize) -> Result<(), String> {
        let plan = &self.plan;

        self.spaces
            .resize_with(threads.max(1), || Mutex::new(Workspace::new(plan)));
        self.pool = pool(threads)?;
        Ok(())
    }

    pub fn first_error(&self) -> Option<String> {
        self.error.clone()
    }

    fn group(&mut self) {
        let keys: Vec<f64> = self
            .rows
            .iter_mut()
            .map(|r| r.get_mut().map_or(0.0, |r| r.contacts * 1000.0 + r.work))
            .collect();

        self.order.sort_by(|a, b| keys[*b].total_cmp(&keys[*a]));

        for (unit, sims) in self.units.iter_mut().zip(self.order.chunks(LANES)) {
            let unit = unit.get_mut().expect("unit lock");

            unit.real = sims.len();

            for lane in 0..LANES {
                unit.sims[lane] = sims[lane.min(sims.len() - 1)];
            }
        }
    }

    fn advance(&self, unit: &mut Unit, nstep: usize, w: &mut Workspace) {
        let (nq, nv) = (self.plan.kernel.nq, self.plan.kernel.nv);

        for lane in 0..LANES {
            let sim = unit.sims[lane];

            self.map
                .load(&mut unit.state, lane, &self.rows[sim].lock().expect("row lock").row);
            unit.state.tables.set_lane(lane, &self.params.view(sim));
        }

        w.solver.work = crate::lanes::ZERO;

        for _ in 0..nstep {
            step(&self.plan, &mut unit.state, w);
        }

        for lane in 0..unit.real {
            let mut sim = self.rows[unit.sims[lane]].lock().expect("row lock");

            self.map.store(&unit.state, lane, &mut sim.row);
            sim.contacts = w.block.ncon.0[lane];
            sim.work = w.solver.work.0[lane];
            sim.failed = !self.map.finite(&sim.row, nq, nv);
        }
    }

    pub fn step(&mut self, nstep: usize) -> usize {
        self.params.refresh();
        self.group();

        let this = &*self;

        this.pool.install(|| {
            this.units.par_iter().with_max_len(1).for_each(|unit| {
                let at = rayon::current_thread_index().unwrap_or(0) % this.spaces.len();
                let mut w = this.spaces[at].lock().expect("workspace lock");

                this.advance(&mut unit.lock().expect("unit lock"), nstep, &mut w);
            });
        });

        let failed = self
            .rows
            .iter_mut()
            .filter_map(|r| r.get_mut().ok())
            .filter(|r| r.failed)
            .count();

        self.error = (failed > 0).then(|| format!("Forge's engine diverged on {failed} robots"));
        failed
    }
}
