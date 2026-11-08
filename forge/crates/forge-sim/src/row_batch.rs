use crate::lanes::LANES;
use crate::plan::Plan;
use crate::rowmap::RowMap;
use crate::state::State;
use crate::step::{step, Workspace};
use crate::tables::WorldTables;
use forge_ir::Kernel;
use forge_mujoco::{Data, Model};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

pub const EXPANDABLE: [&str; 4] = ["geom_friction", "body_mass", "actuator_gainprm", "actuator_biasprm"];
const GAIN_WIDTH: usize = 10;

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
    rows: Vec<f64>,
}

pub struct RowBatch {
    plan: Plan,
    map: RowMap,
    units: Vec<Mutex<Unit>>,
    spaces: Vec<Mutex<Workspace>>,
    nsim: usize,
    expanded: [Option<(Vec<f64>, usize)>; 4],
    defaults: [Vec<f64>; 4],
    dirty: bool,
    error: Option<String>,
}

fn default_row(model: &Model, nstate: usize) -> Vec<f64> {
    let data = Data::new(model);
    let mut row = vec![0.0; nstate];

    data.get_state(model, &mut row, forge_mujoco::integration_state());
    row
}

fn defaults(model: &Model) -> Result<[Vec<f64>; 4], String> {
    let read = |name: &str| {
        model
            .array(name)
            .and_then(|a| a.f64s())
            .map(<[f64]>::to_vec)
            .ok_or_else(|| format!("This MuJoCo build has no model field {name}"))
    };

    Ok([
        read(EXPANDABLE[0])?,
        read(EXPANDABLE[1])?,
        read(EXPANDABLE[2])?,
        read(EXPANDABLE[3])?,
    ])
}

impl RowBatch {
    pub fn new(model: &Model, kernel: Kernel, nsim: usize, threads: usize) -> Result<Self, String> {
        let plan = Plan::new(kernel);
        let map = RowMap::new(model)?;
        let row = default_row(model, map.nstate);
        let units = (0..nsim.div_ceil(LANES))
            .map(|_| {
                let mut state = State::new(&plan);

                for lane in 0..LANES {
                    map.load(&mut state, lane, &row);
                }

                Mutex::new(Unit {
                    state,
                    rows: row.repeat(LANES),
                })
            })
            .collect();
        let spaces = (0..threads.max(1)).map(|_| Mutex::new(Workspace::new(&plan))).collect();

        Ok(Self {
            defaults: defaults(model)?,
            plan,
            map,
            units,
            spaces,
            nsim,
            expanded: [None, None, None, None],
            dirty: false,
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
        let unit = self.units[sim / LANES].get_mut().expect("unit lock");
        let at = (sim % LANES) * n;

        &mut unit.rows[at..at + n]
    }

    pub fn expand(&mut self, field: &str) -> Result<(&mut [f64], usize), String> {
        let k = EXPANDABLE
            .iter()
            .position(|f| *f == field)
            .ok_or_else(|| format!("Forge's engine can't vary {field} per robot"))?;
        let width = self.defaults[k].len();
        let nsim = self.nsim;
        let defaults = &self.defaults[k];
        let (values, _) = self.expanded[k].get_or_insert_with(|| (defaults.repeat(nsim), width));

        self.dirty = true;

        Ok((values.as_mut_slice(), width))
    }

    pub fn rethread(&mut self, threads: usize) {
        let plan = &self.plan;

        self.spaces
            .resize_with(threads.max(1), || Mutex::new(Workspace::new(plan)));
    }

    pub fn first_error(&self) -> Option<String> {
        self.error.clone()
    }

    fn table(&self, k: usize, sim: usize) -> &[f64] {
        match &self.expanded[k] {
            Some((values, width)) => &values[sim * width..(sim + 1) * width],
            None => &self.defaults[k],
        }
    }

    fn apply_tables(&mut self) {
        let nu = self.plan.kernel.nu;

        for sim in 0..self.nsim {
            let friction: Vec<f64> = self.table(0, sim).iter().step_by(3).copied().collect();
            let mass = self.table(1, sim).to_vec();
            let gain: Vec<f64> = (0..nu).map(|a| self.table(2, sim)[GAIN_WIDTH * a]).collect();
            let bias: Vec<[f64; 3]> = (0..nu)
                .map(|a| {
                    let p = &self.table(3, sim)[GAIN_WIDTH * a..];

                    [p[0], p[1], p[2]]
                })
                .collect();
            let unit = self.units[sim / LANES].get_mut().expect("unit lock");
            let world = WorldTables {
                mass: &mass,
                friction: &friction,
                gain: &gain,
                bias: &bias,
            };

            unit.state.tables.set_lane(sim % LANES, &world);
        }

        self.dirty = false;
    }

    fn advance(&self, unit: &mut Unit, first: usize, nstep: usize, w: &mut Workspace) -> usize {
        let n = self.map.nstate;
        let real = self.nsim.saturating_sub(first).min(LANES);

        for lane in 0..LANES {
            self.map
                .load(&mut unit.state, lane, &unit.rows[lane * n..(lane + 1) * n]);
        }

        for _ in 0..nstep {
            step(&self.plan, &mut unit.state, w);
        }

        let (nq, nv) = (self.plan.kernel.nq, self.plan.kernel.nv);
        let mut failed = 0;

        for lane in 0..LANES {
            let row = &mut unit.rows[lane * n..(lane + 1) * n];

            self.map.store(&unit.state, lane, row);

            if lane < real && !self.map.finite(row, nq, nv) {
                failed += 1;
            }
        }

        failed
    }

    pub fn step(&mut self, nstep: usize) -> usize {
        if self.dirty {
            self.apply_tables();
        }

        let next = AtomicUsize::new(0);
        let failed = AtomicUsize::new(0);

        std::thread::scope(|scope| {
            for space in &self.spaces {
                scope.spawn(|| {
                    let mut w = space.lock().expect("workspace lock");

                    loop {
                        let i = next.fetch_add(1, Ordering::Relaxed);
                        let Some(unit) = self.units.get(i) else { break };
                        let mut unit = unit.lock().expect("unit lock");

                        failed.fetch_add(self.advance(&mut unit, i * LANES, nstep, &mut w), Ordering::Relaxed);
                    }
                });
            }
        });

        let failed = failed.into_inner();

        self.error = (failed > 0).then(|| format!("Forge's engine diverged on {failed} robots"));
        failed
    }
}
