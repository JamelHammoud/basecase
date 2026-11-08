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
    buffer: Vec<f64>,
    sims: [usize; LANES],
    real: usize,
    contacts: [f64; LANES],
}

pub struct RowBatch {
    plan: Plan,
    map: RowMap,
    rows: Vec<f64>,
    contacts: Vec<f64>,
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
        let rows = default_row(model, map.nstate).repeat(nsim);
        let units = (0..nsim.div_ceil(LANES))
            .map(|_| {
                Mutex::new(Unit {
                    state: State::new(&plan),
                    buffer: vec![0.0; LANES * map.nstate],
                    sims: [0; LANES],
                    real: 0,
                    contacts: [0.0; LANES],
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
            contacts: vec![0.0; nsim],
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
        let n = self.map.nstate;

        &mut self.rows[sim * n..(sim + 1) * n]
    }

    pub fn contacts(&self, sim: usize) -> f64 {
        self.contacts[sim]
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
        let mut order: Vec<usize> = (0..self.nsim).collect();

        order.sort_by(|a, b| self.contacts[*a].total_cmp(&self.contacts[*b]));

        for (unit, sims) in self.units.iter_mut().zip(order.chunks(LANES)) {
            let unit = unit.get_mut().expect("unit lock");

            unit.real = sims.len();

            for lane in 0..LANES {
                unit.sims[lane] = sims[lane.min(sims.len() - 1)];
            }
        }
    }

    fn advance(&self, unit: &mut Unit, nstep: usize, w: &mut Workspace) {
        let n = self.map.nstate;

        for lane in 0..LANES {
            let sim = unit.sims[lane];

            self.map.load(&mut unit.state, lane, &self.rows[sim * n..(sim + 1) * n]);
            unit.state.tables.set_lane(lane, &self.params.view(sim));
        }

        for _ in 0..nstep {
            step(&self.plan, &mut unit.state, w);
        }

        for lane in 0..LANES {
            self.map
                .store(&unit.state, lane, &mut unit.buffer[lane * n..(lane + 1) * n]);
            unit.contacts[lane] = w.block.ncon.0[lane];
        }
    }

    fn gather(&mut self) -> usize {
        let n = self.map.nstate;
        let (nq, nv) = (self.plan.kernel.nq, self.plan.kernel.nv);
        let mut failed = 0;

        for unit in &mut self.units {
            let unit = unit.get_mut().expect("unit lock");

            for lane in 0..unit.real {
                let sim = unit.sims[lane];
                let row = &unit.buffer[lane * n..(lane + 1) * n];

                self.rows[sim * n..(sim + 1) * n].copy_from_slice(row);
                self.contacts[sim] = unit.contacts[lane];
                failed += usize::from(!self.map.finite(row, nq, nv));
            }
        }

        failed
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

        let failed = self.gather();

        self.error = (failed > 0).then(|| format!("Forge's engine diverged on {failed} robots"));
        failed
    }
}
