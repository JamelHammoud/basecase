use super::source::source;
use crate::gpu::layout::Layout;
use crate::gpu::tables::{imps, supported};
use crate::plan::Plan;
use forge_metal::{Arg, BufferId, Dispatch, Gpu, Kernel, Timing};

pub const GROUP: usize = 16;
pub const BLOCK: usize = crate::gpu::BLOCK;

pub struct Engine {
    pub plan: Plan,
    pub layout: Layout,
    gpu: Gpu,
    kernels: Vec<Kernel>,
    io: BufferId<f32>,
    scratch: BufferId<f32>,
    ints: BufferId<u32>,
    order: BufferId<u32>,
    stats: BufferId<u32>,
    worlds: usize,
}

pub fn refusal(plan: &Plan) -> Option<String> {
    imps(plan)
        .iter()
        .any(|i| !supported(i))
        .then(|| "a solimp power other than 1 or 2 needs pow, which Forge's Metal engine doesn't evaluate".to_owned())
}

pub fn probe(kernel: &forge_ir::Kernel) -> Result<String, String> {
    if let Some(why) = refusal(&Plan::new(kernel.clone())) {
        return Err(why);
    }

    Gpu::new().map(|g| g.name())
}

impl Engine {
    pub fn new(plan: Plan, worlds: usize) -> Result<Self, String> {
        if let Some(why) = refusal(&plan) {
            return Err(format!("Forge's Metal engine refuses this model: {why}"));
        }

        let layout = Layout::new(&plan);
        let mut gpu = Gpu::new()?;
        let kernels = gpu.compile(&source(&plan, &layout), &["step", "forward_only", "profile"])?;
        let worlds = worlds.max(1);
        let io = gpu.alloc::<f32>(2 * layout.nstate * worlds)?;
        let padded = worlds.div_ceil(BLOCK) * BLOCK;
        let scratch = gpu.alloc::<f32>(2 * layout.reals * padded)?;
        let ints = gpu.alloc::<u32>(layout.nints * padded)?;
        let order = gpu.alloc::<u32>(worlds)?;
        let stats = gpu.alloc::<u32>(2 * worlds)?;

        for (i, o) in gpu.slice_mut(order).iter_mut().enumerate() {
            *o = i as u32;
        }

        Ok(Self {
            plan,
            layout,
            gpu,
            kernels,
            io,
            scratch,
            ints,
            order,
            stats,
            worlds,
        })
    }

    pub fn device(&self) -> String {
        self.gpu.name()
    }

    pub fn io(&mut self) -> &mut [f32] {
        self.gpu.slice_mut(self.io)
    }

    pub fn io_view(&self) -> &[f32] {
        self.gpu.slice(self.io)
    }

    pub fn order(&mut self) -> &mut [u32] {
        self.gpu.slice_mut(self.order)
    }

    pub fn stats(&self) -> &[u32] {
        self.gpu.slice(self.stats)
    }

    fn run(&mut self, kernel: usize, nstep: usize) -> Result<Timing, String> {
        self.run_upto(kernel, nstep, 0)
    }

    fn run_upto(&mut self, kernel: usize, nstep: usize, upto: usize) -> Result<Timing, String> {
        let words = [self.worlds as u32, nstep as u32, upto as u32];
        let dispatch = Dispatch {
            kernel: &self.kernels[kernel],
            args: vec![
                self.io.arg(),
                self.scratch.arg(),
                self.ints.arg(),
                self.order.arg(),
                self.stats.arg(),
                Arg::Words(&words),
            ],
            threads: self.worlds,
            group: GROUP,
        };

        self.gpu.run(&[dispatch])
    }

    pub fn step(&mut self, nstep: usize) -> Result<Timing, String> {
        self.run(0, nstep)
    }

    pub fn forward(&mut self) -> Result<Timing, String> {
        self.run(1, 0)
    }

    pub fn profile(&mut self, nstep: usize, upto: usize) -> Result<Timing, String> {
        self.run_upto(2, nstep, upto)
    }

    pub fn field(&self, name: &str, thread: usize) -> Vec<f64> {
        let (at, len) = self.layout.at(name);
        let s = self.gpu.slice(self.scratch);

        (0..len)
            .map(|i| {
                let k = 2 * (((thread / BLOCK) * self.layout.reals + at + i) * BLOCK + thread % BLOCK);

                f64::from(s[k]) + f64::from(s[k + 1])
            })
            .collect()
    }
}
