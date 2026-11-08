use super::emit::split;
use super::engine::Engine;
use super::layout::Layout;
use crate::plan::Plan;
use crate::row_batch::Offsets;
use crate::rowmap::RowMap;
use crate::tables::WorldTables;
use crate::world_params::WorldParams;
use forge_ir::Kernel;
use forge_mujoco::{Data, Model};
use rayon::prelude::*;

pub struct MetalBatch {
    engine: Engine,
    map: RowMap,
    rows: Vec<Vec<f64>>,
    params: WorldParams,
    contacts: Vec<f64>,
    work: Vec<f64>,
    error: Option<String>,
    gpu_seconds: f64,
}

struct Slots {
    qpos: usize,
    qvel: usize,
    ctrl: usize,
    warm: usize,
    time: usize,
    hist: usize,
    tables: [usize; 4],
}

impl Slots {
    fn new(l: &Layout) -> Self {
        let at = |n: &str| l.at(n).0;

        Self {
            qpos: at("QPOS"),
            qvel: at("QVEL"),
            ctrl: at("CTRL"),
            warm: at("WARM"),
            time: at("TIME"),
            hist: at("HIST"),
            tables: [at("TMASS"), at("TFRIC"), at("TGAIN"), at("TBIAS")],
        }
    }
}

fn put(out: &mut [f32], at: usize, values: &[f64]) {
    for (k, v) in values.iter().enumerate() {
        let (hi, lo) = split(*v);

        out[2 * (at + k)] = hi;
        out[2 * (at + k) + 1] = lo;
    }
}

fn get(block: &[f32], at: usize, out: &mut [f64]) {
    for (k, v) in out.iter_mut().enumerate() {
        *v = f64::from(block[2 * (at + k)]) + f64::from(block[2 * (at + k) + 1]);
    }
}

struct Pack<'a> {
    map: &'a RowMap,
    slots: &'a Slots,
    nq: usize,
    nv: usize,
    nu: usize,
}

impl Pack<'_> {
    fn load(&self, row: &[f64], tables: &WorldTables, out: &mut [f32]) {
        let (m, s) = (self.map, self.slots);

        put(out, s.qpos, &row[m.qpos..m.qpos + self.nq]);
        put(out, s.qvel, &row[m.qvel..m.qvel + self.nv]);
        put(out, s.ctrl, &row[m.ctrl..m.ctrl + self.nu]);
        put(out, s.warm, &row[m.warm..m.warm + self.nv]);
        put(out, s.time, &row[m.time..=m.time]);

        let mut at = s.hist;

        for buf in &m.buffers {
            let base = m.history + buf.adr;
            let n = buf.samples;

            put(out, at, &row[base + 2..base + 2 + 2 * n]);
            put(out, at + 2 * n, &row[base + 1..base + 2]);
            at += 2 * n + 1;
        }

        put(out, s.tables[0], tables.mass);
        put(out, s.tables[1], tables.friction);
        put(out, s.tables[2], tables.gain);

        let bias: Vec<f64> = tables.bias.iter().flatten().copied().collect();

        put(out, s.tables[3], &bias);
    }

    fn store(&self, block: &[f32], row: &mut [f64]) {
        let (m, s) = (self.map, self.slots);

        get(block, s.qpos, &mut row[m.qpos..m.qpos + self.nq]);
        get(block, s.qvel, &mut row[m.qvel..m.qvel + self.nv]);
        get(block, s.warm, &mut row[m.warm..m.warm + self.nv]);
        get(block, s.time, &mut row[m.time..=m.time]);

        let mut at = s.hist;

        for buf in &m.buffers {
            let base = m.history + buf.adr;
            let n = buf.samples;

            get(block, at, &mut row[base + 2..base + 2 + 2 * n]);
            get(block, at + 2 * n, &mut row[base + 1..base + 2]);
            at += 2 * n + 1;
        }
    }
}

impl MetalBatch {
    pub fn new(model: &Model, kernel: Kernel, nsim: usize) -> Result<Self, String> {
        let map = RowMap::new(model)?;
        let data = Data::new(model);
        let mut start = vec![0.0; map.nstate];

        data.get_state(model, &mut start, forge_mujoco::integration_state());

        Ok(Self {
            engine: Engine::new(Plan::new(kernel), nsim)?,
            params: WorldParams::new(model, nsim)?,
            rows: vec![start; nsim],
            contacts: vec![0.0; nsim],
            work: vec![0.0; nsim],
            map,
            error: None,
            gpu_seconds: 0.0,
        })
    }

    pub fn device(&self) -> String {
        self.engine.device()
    }

    pub fn plan(&self) -> &Plan {
        &self.engine.plan
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
        self.rows.len()
    }

    pub fn row(&mut self, sim: usize) -> &mut [f64] {
        &mut self.rows[sim]
    }

    pub fn contacts(&self, sim: usize) -> f64 {
        self.contacts[sim]
    }

    pub fn work(&self, sim: usize) -> f64 {
        self.work[sim]
    }

    pub fn expand(&mut self, field: &str) -> Result<(&mut [f64], usize), String> {
        self.params.expand(field)
    }

    pub fn gpu_seconds(&self) -> f64 {
        self.gpu_seconds
    }

    pub fn first_error(&self) -> Option<String> {
        self.error.clone()
    }

    fn group(&mut self) {
        let keys: Vec<f64> = (0..self.rows.len())
            .map(|s| self.contacts[s] * 1000.0 + self.work[s])
            .collect();
        let mut order: Vec<usize> = (0..keys.len()).collect();

        order.sort_by(|a, b| keys[*b].total_cmp(&keys[*a]));

        for (slot, sim) in self.engine.order().iter_mut().zip(order) {
            *slot = sim as u32;
        }
    }

    fn upload(&mut self) {
        self.params.refresh();

        let slots = Slots::new(&self.engine.layout);
        let k = &self.engine.plan.kernel;
        let pack = Pack {
            map: &self.map,
            slots: &slots,
            nq: k.nq,
            nv: k.nv,
            nu: k.nu,
        };
        let width = 2 * self.engine.layout.nstate;
        let (rows, params) = (&self.rows, &self.params);

        self.engine
            .io()
            .par_chunks_mut(width)
            .zip(rows.par_iter())
            .enumerate()
            .for_each(|(sim, (block, row))| pack.load(row, &params.view(sim), block));
    }

    fn download(&mut self) -> usize {
        let slots = Slots::new(&self.engine.layout);
        let k = &self.engine.plan.kernel;
        let (nq, nv) = (k.nq, k.nv);
        let pack = Pack {
            map: &self.map,
            slots: &slots,
            nq,
            nv,
            nu: k.nu,
        };
        let width = 2 * self.engine.layout.nstate;
        let map = &self.map;
        let io = self.engine.io_view();

        self.rows
            .par_iter_mut()
            .zip(io.par_chunks(width))
            .map(|(row, block)| {
                pack.store(block, row);
                usize::from(!map.finite(row, nq, nv))
            })
            .sum()
    }

    fn record_stats(&mut self) {
        let stats = self.engine.stats();

        for (s, pair) in stats.chunks_exact(2).enumerate() {
            self.contacts[s] = f64::from(pair[0]);
            self.work[s] = f64::from(pair[1]);
        }
    }

    pub fn step(&mut self, nstep: usize) -> usize {
        self.group();
        self.upload();

        match self.engine.step(nstep) {
            Ok(t) => self.gpu_seconds += t.gpu_seconds,
            Err(e) => {
                self.error = Some(e);
                return self.rows.len();
            }
        }

        let failed = self.download();

        self.record_stats();
        self.error = (failed > 0).then(|| format!("Forge's Metal engine diverged on {failed} robots"));
        failed
    }

    pub fn profile(&mut self, nstep: usize, upto: usize) -> Result<f64, String> {
        self.group();
        self.upload();

        Ok(self.engine.profile(nstep, upto)?.gpu_seconds)
    }

    pub fn forward_fields(&mut self, sim: usize, names: &[&str]) -> Result<(Vec<Vec<f64>>, usize), String> {
        for (t, slot) in self.engine.order().iter_mut().enumerate() {
            *slot = t as u32;
        }

        self.upload();
        self.engine.forward()?;

        let fields = names.iter().map(|n| self.engine.field(n, sim)).collect();

        Ok((fields, self.engine.stats()[2 * sim] as usize))
    }
}
