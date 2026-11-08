use crate::host::HostModel;
use forge_sim::rowmap::RowMap;
use forge_sim::wgsl::Parts;
use forge_sim::world_params::WorldParams;
use forge_sim::{Offsets, WgslBatch};

pub enum Engine {
    Wgsl,
}

impl Engine {
    pub fn status(&self) -> Option<String> {
        Some("Stepping physics on Forge's WGSL engine in this tab".to_owned())
    }
}

pub struct Physics {
    batch: Box<WgslBatch>,
}

impl Physics {
    pub fn new(model: &HostModel, _engine: &Engine, layout: &Offsets, size: (usize, usize)) -> Result<Self, String> {
        let count = size.0;
        let map = RowMap::new(&model.fields)?;

        if map.offsets() != *layout {
            return Err("Forge's engine reads state rows differently from MuJoCo".to_owned());
        }

        let parts = Parts {
            start: vec![0.0; map.nstate],
            params: WorldParams::new(&model.fields, count)?,
            map,
        };
        let batch = WgslBatch::with_backend(parts, model.kernel.clone(), count, (model.launch)()?)?;

        Ok(Self { batch: Box::new(batch) })
    }

    pub fn row(&mut self, sim: usize) -> &mut [f64] {
        self.batch.row(sim)
    }

    pub fn step(&mut self, nstep: usize) -> usize {
        self.batch.step(nstep)
    }

    pub fn expand(&mut self, field: &str) -> Result<(&mut [f64], usize), String> {
        self.batch.expand(field)
    }

    pub fn rethread(&mut self, _threads: usize, _fields: &[&str]) -> Result<(), String> {
        Ok(())
    }

    pub fn first_error(&self) -> Option<String> {
        self.batch.first_error()
    }
}
