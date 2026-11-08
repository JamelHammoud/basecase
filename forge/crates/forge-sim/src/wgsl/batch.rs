use super::engine::{Backend, Engine};
use crate::gpu::pack::{group_order, Pack, Slots};
use crate::plan::Plan;
use crate::row_batch::Offsets;
use crate::rowmap::RowMap;
use crate::world_params::WorldParams;
use forge_ir::Kernel;

pub struct WgslBatch {
    engine: Engine,
    map: RowMap,
    rows: Vec<Vec<f64>>,
    params: WorldParams,
    contacts: Vec<f64>,
    work: Vec<f64>,
    error: Option<String>,
    gpu_seconds: f64,
}

pub struct Parts {
    pub map: RowMap,
    pub params: WorldParams,
    pub start: Vec<f64>,
}

impl WgslBatch {
    pub fn with_backend(parts: Parts, kernel: Kernel, nsim: usize, backend: Box<dyn Backend>) -> Result<Self, String> {
        Ok(Self {
            engine: Engine::new(Plan::new(kernel), nsim, backend)?,
            params: parts.params,
            rows: vec![parts.start; nsim.max(1)],
            contacts: vec![0.0; nsim.max(1)],
            work: vec![0.0; nsim.max(1)],
            map: parts.map,
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

    pub fn expand(&mut self, field: &str) -> Result<(&mut [f64], usize), String> {
        self.params.expand(field)
    }

    pub fn gpu_seconds(&self) -> f64 {
        self.gpu_seconds
    }

    pub fn first_error(&self) -> Option<String> {
        self.error.clone()
    }

    fn upload(&mut self) {
        self.params.refresh();

        let slots = Slots::new(&self.engine.layout);
        let pack = Pack::new(&self.map, &slots, &self.engine.plan);
        let width = 2 * self.engine.layout.nstate;

        for (sim, (block, row)) in self.engine.io.chunks_mut(width).zip(&self.rows).enumerate() {
            pack.load(row, &self.params.view(sim), block);
        }
    }

    fn download(&mut self) -> usize {
        let slots = Slots::new(&self.engine.layout);
        let pack = Pack::new(&self.map, &slots, &self.engine.plan);
        let width = 2 * self.engine.layout.nstate;

        self.rows
            .iter_mut()
            .zip(self.engine.io.chunks(width))
            .map(|(row, block)| usize::from(!pack.store(block, row)))
            .sum()
    }

    fn record_stats(&mut self) {
        for (s, pair) in self.engine.stats.as_chunks::<2>().0.iter().enumerate() {
            self.contacts[s] = f64::from(pair[0]);
            self.work[s] = f64::from(pair[1]);
        }
    }

    pub fn step(&mut self, nstep: usize) -> usize {
        group_order(&self.contacts, &self.work, &mut self.engine.order);
        self.upload();

        match self.engine.step(nstep) {
            Ok(seconds) => self.gpu_seconds += seconds,
            Err(e) => {
                self.error = Some(e);
                return self.rows.len();
            }
        }

        let failed = self.download();

        self.record_stats();
        self.error = (failed > 0).then(|| format!("Forge's WGSL engine diverged on {failed} robots"));
        failed
    }

    pub fn profile(&mut self, nstep: usize, upto: usize) -> Result<f64, String> {
        group_order(&self.contacts, &self.work, &mut self.engine.order);
        self.upload();
        self.engine.profile(nstep, upto)
    }

    pub fn forward_fields(&mut self, sim: usize, names: &[&str]) -> Result<(Vec<Vec<f64>>, usize), String> {
        for (t, slot) in self.engine.order.iter_mut().enumerate() {
            *slot = t as u32;
        }

        self.upload();
        self.engine.forward()?;

        let fields = names.iter().map(|n| self.engine.field(n, sim)).collect();

        Ok((fields, self.engine.stats[2 * sim] as usize))
    }
}
