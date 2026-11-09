use super::engine::Engine;
use crate::gpu::pack::{group_order, Pack, Slots};
use crate::plan::Plan;
use crate::row_batch::Offsets;
use crate::rowmap::RowMap;
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

    pub fn qualify_arithmetic(&mut self) -> Result<(), String> {
        self.engine.qualify_arithmetic()
    }

    pub fn first_error(&self) -> Option<String> {
        self.error.clone()
    }

    fn group(&mut self) {
        group_order(&self.contacts, &self.work, self.engine.order());
    }

    fn upload(&mut self) {
        self.params.refresh();

        let slots = Slots::new(&self.engine.layout);
        let pack = Pack::new(&self.map, &slots, &self.engine.plan);
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
        let pack = Pack::new(&self.map, &slots, &self.engine.plan);
        let width = 2 * self.engine.layout.nstate;
        let io = self.engine.io_view();

        self.rows
            .par_iter_mut()
            .zip(io.par_chunks(width))
            .map(|(row, block)| usize::from(!pack.store(block, row)))
            .sum()
    }

    fn record_stats(&mut self) {
        let stats = self.engine.stats();

        for (s, [contacts, work]) in stats.as_chunks::<2>().0.iter().enumerate() {
            self.contacts[s] = f64::from(*contacts);
            self.work[s] = f64::from(*work);
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
