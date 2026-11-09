use super::batch::{Parts, WgslBatch};
use super::engine::{io_len, refusal, Backend, Call};
use super::source::{Program, ENTRIES};
use crate::gpu::BLOCK;
use crate::plan::Plan;
use crate::rowmap::RowMap;
use crate::world_params::WorldParams;
use forge_ir::Kernel;
use forge_mujoco::{Data, Model};
use forge_wgpu::{Access, Gpu, Target};

const ACCESS: [Access; 8] = [
    Access::ReadWrite,
    Access::ReadWrite,
    Access::ReadWrite,
    Access::ReadOnly,
    Access::ReadWrite,
    Access::ReadOnly,
    Access::ReadOnly,
    Access::Uniform,
];

const IO: usize = 0;
const SCRATCH: usize = 1;
const ORDER: usize = 3;
const STATS: usize = 4;
const PARAMS: usize = 7;

pub struct Native {
    gpu: Gpu,
    program: Option<forge_wgpu::Program>,
    slots: Vec<usize>,
    scratch_len: usize,
}

impl Native {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            gpu: Gpu::new()?,
            program: None,
            slots: Vec::new(),
            scratch_len: 0,
        })
    }

    fn sizes(program: &Program, worlds: usize) -> [u64; 8] {
        let padded = worlds.div_ceil(BLOCK) * BLOCK;
        let words = [
            io_len(program.nstate, worlds),
            2 * program.nreals * padded,
            program.nints * padded,
            worlds,
            2 * worlds,
            program.reals.len(),
            program.ints.len(),
            4,
        ];

        words.map(|w| 4 * w as u64)
    }
}

impl Backend for Native {
    fn device(&self) -> String {
        self.gpu.name()
    }

    fn workgroup_bytes(&self) -> usize {
        self.gpu.workgroup_bytes()
    }

    fn load(&mut self, program: &Program, worlds: usize) -> Result<(), String> {
        let mut compiled = self.gpu.compile(&program.source, &ENTRIES, &ACCESS)?;
        let sizes = Self::sizes(program, worlds);

        self.slots = ACCESS
            .iter()
            .zip(sizes)
            .map(|(access, bytes)| self.gpu.buffer(*access, bytes))
            .collect::<Result<_, _>>()?;
        self.scratch_len = (sizes[SCRATCH] / 4) as usize;
        self.gpu.write_f32(self.slots[5], &program.reals);
        self.gpu.write_u32(
            self.slots[6],
            &program.ints.iter().map(|&v| v as u32).collect::<Vec<_>>(),
        );
        self.gpu.bind(&mut compiled, &self.slots);
        self.program = Some(compiled);

        Ok(())
    }

    fn run(&mut self, call: Call<'_>) -> Result<f64, String> {
        let program = self.program.as_ref().ok_or("Forge's WGSL kernels aren't loaded")?;

        self.gpu.write_f32(self.slots[IO], call.io);
        self.gpu.write_u32(self.slots[ORDER], call.order);
        self.gpu.write_u32(self.slots[PARAMS], &call.params);

        let mut reads = [
            Target::F32(self.slots[IO], call.io),
            Target::I32(self.slots[STATS], call.stats),
        ];
        let timing = self.gpu.run(program, call.entry as usize, call.groups, &mut reads)?;

        Ok(timing.seconds)
    }

    fn scratch(&mut self) -> Result<Vec<f32>, String> {
        let mut out = vec![0.0; self.scratch_len];

        self.gpu.read(&mut [Target::F32(self.slots[SCRATCH], &mut out)])?;

        Ok(out)
    }
}

impl WgslBatch {
    pub fn new(model: &Model, kernel: Kernel, nsim: usize) -> Result<Self, String> {
        let map = RowMap::new(model)?;
        let data = Data::new(model);
        let mut start = vec![0.0; map.nstate];

        data.get_state(model, &mut start, forge_mujoco::integration_state());

        let parts = Parts {
            map,
            params: WorldParams::new(model, nsim)?,
            start,
        };

        Self::with_backend(parts, kernel, nsim, Box::new(Native::new()?))
    }
}

pub fn probe(kernel: &Kernel) -> Result<String, String> {
    if let Some(why) = refusal(&Plan::new(kernel.clone())) {
        return Err(why);
    }

    Native::new().map(|n| n.device())
}
