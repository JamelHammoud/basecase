use crate::job::Backend;
use forge_ir::Kernel;
use forge_mujoco::{Batch, Model, StateLayout};
use forge_sim::{MetalBatch, RowBatch};

pub enum Engine {
    Mujoco { refusal: Option<String> },
    Simd(Box<Kernel>),
    Metal { kernel: Box<Kernel>, device: String },
}

fn on_metal(kernel: Kernel) -> Engine {
    match forge_sim::metal::probe(&kernel) {
        Ok(device) => Engine::Metal {
            kernel: Box::new(kernel),
            device,
        },
        Err(why) => Engine::Mujoco {
            refusal: Some(format!("Forge's Metal engine can't step this job: {why}")),
        },
    }
}

impl Engine {
    pub fn choose(model: &Model, backend: Backend) -> Self {
        if backend == Backend::Mujoco {
            return Engine::Mujoco { refusal: None };
        }

        match (forge_ir::lower(model), backend) {
            (Ok(kernel), Backend::Metal) => on_metal(kernel),
            (Ok(kernel), _) => Engine::Simd(Box::new(kernel)),
            (Err(refusal), _) => Engine::Mujoco {
                refusal: Some(refusal.to_string()),
            },
        }
    }

    pub fn status(&self) -> Option<String> {
        match self {
            Engine::Simd(_) => Some("Stepping physics on Forge's SIMD engine".to_owned()),
            Engine::Metal { device, .. } => Some(format!("Stepping physics on Forge's Metal engine ({device})")),
            Engine::Mujoco { refusal: Some(why) } => Some(format!("{why}. Stepping physics on C MuJoCo")),
            Engine::Mujoco { refusal: None } => None,
        }
    }
}

pub enum Physics {
    Mujoco(Batch),
    Simd(Box<RowBatch>),
    Metal(Box<MetalBatch>),
}

fn same_layout(o: forge_sim::Offsets, layout: &StateLayout) -> bool {
    (o.nstate, o.time, o.qpos, o.qvel, o.warm, o.ctrl)
        == (
            layout.nstate,
            layout.time,
            layout.qpos,
            layout.qvel,
            layout.warmstart,
            layout.ctrl,
        )
}

impl Physics {
    pub fn new(model: &Model, engine: &Engine, layout: &StateLayout, size: (usize, usize)) -> Result<Self, String> {
        let (count, threads) = size;

        match engine {
            Engine::Mujoco { .. } => Batch::new(model, count, threads).map(Physics::Mujoco),
            Engine::Simd(kernel) => {
                let simd = RowBatch::new(model, (**kernel).clone(), count, threads)?;

                if !same_layout(simd.offsets(), layout) {
                    return Err("Forge's engine reads state rows differently from MuJoCo".to_owned());
                }

                Ok(Physics::Simd(Box::new(simd)))
            }
            Engine::Metal { kernel, .. } => {
                let metal = MetalBatch::new(model, (**kernel).clone(), count)?;

                if !same_layout(metal.offsets(), layout) {
                    return Err("Forge's engine reads state rows differently from MuJoCo".to_owned());
                }

                Ok(Physics::Metal(Box::new(metal)))
            }
        }
    }

    pub fn row(&mut self, sim: usize) -> &mut [f64] {
        match self {
            Physics::Mujoco(b) => b.row(sim),
            Physics::Simd(b) => b.row(sim),
            Physics::Metal(b) => b.row(sim),
        }
    }

    pub fn step(&mut self, nstep: usize) -> usize {
        match self {
            Physics::Mujoco(b) => b.step(nstep),
            Physics::Simd(b) => b.step(nstep),
            Physics::Metal(b) => b.step(nstep),
        }
    }

    pub fn expand(&mut self, field: &str) -> Result<(&mut [f64], usize), String> {
        match self {
            Physics::Mujoco(b) => b.expand(field),
            Physics::Simd(b) => b.expand(field),
            Physics::Metal(b) => b.expand(field),
        }
    }

    pub fn rethread(&mut self, threads: usize, fields: &[&str]) -> Result<(), String> {
        match self {
            Physics::Mujoco(b) => b.rethread(threads, fields),
            Physics::Simd(b) => b.rethread(threads),
            Physics::Metal(_) => Ok(()),
        }
    }

    pub fn first_error(&self) -> Option<String> {
        match self {
            Physics::Mujoco(b) => b.first_error(),
            Physics::Simd(b) => b.first_error(),
            Physics::Metal(b) => b.first_error(),
        }
    }
}
