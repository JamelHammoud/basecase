use crate::job::Backend;
use forge_ir::Kernel;
use forge_mujoco::{Batch, Model, StateLayout};
use forge_sim::{MetalBatch, Offsets, RowBatch, WgslBatch};

pub enum Engine {
    Mujoco { refusal: Option<String> },
    Simd(Box<Kernel>),
    Metal { kernel: Box<Kernel>, device: String },
    Wgpu { kernel: Box<Kernel>, device: String },
}

fn on_gpu(kernel: Kernel, backend: Backend) -> Engine {
    let probed = if backend == Backend::Metal {
        forge_sim::metal::probe(&kernel)
    } else {
        forge_sim::wgsl::probe(&kernel)
    };
    let kernel = Box::new(kernel);

    match (probed, backend) {
        (Ok(device), Backend::Metal) => Engine::Metal { kernel, device },
        (Ok(device), _) => Engine::Wgpu { kernel, device },
        (Err(why), Backend::Metal) => Engine::Mujoco {
            refusal: Some(format!("Forge's Metal engine can't step this job: {why}")),
        },
        (Err(why), _) => Engine::Mujoco {
            refusal: Some(format!("Forge's WGSL engine can't step this job: {why}")),
        },
    }
}

impl Engine {
    pub fn choose(model: &Model, backend: Backend) -> Self {
        if backend == Backend::Mujoco {
            return Engine::Mujoco { refusal: None };
        }

        match (forge_ir::lower(model), backend) {
            (Ok(kernel), Backend::Metal | Backend::Wgpu) => on_gpu(kernel, backend),
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
            Engine::Wgpu { device, .. } => Some(format!("Stepping physics on Forge's WGSL engine ({device})")),
            Engine::Mujoco { refusal: Some(why) } => Some(format!("{why}. Stepping physics on C MuJoCo")),
            Engine::Mujoco { refusal: None } => None,
        }
    }
}

pub enum Physics {
    Mujoco(Batch),
    Simd(Box<RowBatch>),
    Metal(Box<MetalBatch>),
    Wgpu(Box<WgslBatch>),
}

fn same_layout(o: Offsets, layout: &Offsets) -> Result<(), String> {
    if o == *layout {
        Ok(())
    } else {
        Err("Forge's engine reads state rows differently from MuJoCo".to_owned())
    }
}

fn mujoco_layout(layout: StateLayout) -> Offsets {
    Offsets {
        nstate: layout.nstate,
        time: layout.time,
        qpos: layout.qpos,
        qvel: layout.qvel,
        warm: layout.warmstart,
        ctrl: layout.ctrl,
    }
}

impl Physics {
    pub fn new(model: &Model, engine: &Engine, layout: &Offsets, size: (usize, usize)) -> Result<Self, String> {
        let (count, threads) = size;

        match engine {
            Engine::Mujoco { .. } => {
                let batch = Batch::new(model, count, threads)?;

                same_layout(mujoco_layout(batch.layout()), layout)?;

                Ok(Physics::Mujoco(batch))
            }
            Engine::Simd(kernel) => {
                let simd = RowBatch::new(model, (**kernel).clone(), count, threads)?;

                same_layout(simd.offsets(), layout)?;

                Ok(Physics::Simd(Box::new(simd)))
            }
            Engine::Metal { kernel, .. } => {
                let metal = MetalBatch::new(model, (**kernel).clone(), count)?;

                same_layout(metal.offsets(), layout)?;

                Ok(Physics::Metal(Box::new(metal)))
            }
            Engine::Wgpu { kernel, .. } => {
                let wgsl = WgslBatch::new(model, (**kernel).clone(), count)?;

                same_layout(wgsl.offsets(), layout)?;

                Ok(Physics::Wgpu(Box::new(wgsl)))
            }
        }
    }

    pub fn row(&mut self, sim: usize) -> &mut [f64] {
        match self {
            Physics::Mujoco(b) => b.row(sim),
            Physics::Simd(b) => b.row(sim),
            Physics::Metal(b) => b.row(sim),
            Physics::Wgpu(b) => b.row(sim),
        }
    }

    pub fn step(&mut self, nstep: usize) -> usize {
        match self {
            Physics::Mujoco(b) => b.step(nstep),
            Physics::Simd(b) => b.step(nstep),
            Physics::Metal(b) => b.step(nstep),
            Physics::Wgpu(b) => b.step(nstep),
        }
    }

    pub fn expand(&mut self, field: &str) -> Result<(&mut [f64], usize), String> {
        match self {
            Physics::Mujoco(b) => b.expand(field),
            Physics::Simd(b) => b.expand(field),
            Physics::Metal(b) => b.expand(field),
            Physics::Wgpu(b) => b.expand(field),
        }
    }

    pub fn rethread(&mut self, threads: usize, fields: &[&str]) -> Result<(), String> {
        match self {
            Physics::Mujoco(b) => b.rethread(threads, fields),
            Physics::Simd(b) => b.rethread(threads),
            Physics::Metal(_) | Physics::Wgpu(_) => Ok(()),
        }
    }

    pub fn first_error(&self) -> Option<String> {
        match self {
            Physics::Mujoco(b) => b.first_error(),
            Physics::Simd(b) => b.first_error(),
            Physics::Metal(b) => b.first_error(),
            Physics::Wgpu(b) => b.first_error(),
        }
    }
}
