use super::engine::{Parts, GROUP};
use super::source::source;
use super::task;
use crate::gpu::layout::Layout;
use forge_ir::task::{Task, COUNTERS};
use forge_metal::{Arg, BufferId, Dispatch, Gpu, Kernel};

const KERNELS: [&str; 5] = ["step", "task_reset", "task_act", "task_after", "task_observe"];
const TASK_GROUP: usize = 64;

pub struct Worlds {
    kernels: Vec<Kernel>,
    io: BufferId<f32>,
    scratch: BufferId<f32>,
    ints: BufferId<u32>,
    order: BufferId<u32>,
    stats: BufferId<u32>,
    start: BufferId<f32>,
    env: BufferId<f32>,
    counters: BufferId<u32>,
    rngs: BufferId<u32>,
    obs: BufferId<f32>,
    pub worlds: usize,
    pub nobs: usize,
    pub nact: usize,
    pub nstate: usize,
    decimation: usize,
    layout: Layout,
}

pub struct Outputs {
    pub rew: BufferId<f32>,
    pub done: BufferId<f32>,
    pub timeout: BufferId<f32>,
    pub fell: BufferId<f32>,
}

fn split_mix(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);

    let mut z = *state;

    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);

    z ^ (z >> 31)
}

pub fn seed_streams(words: &mut [u32], seed: u64, stream: u64) {
    for (world, state) in words.as_chunks_mut::<4>().0.iter_mut().enumerate() {
        let mut mix =
            seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ (stream + world as u64).wrapping_mul(0xD6E8_FEB8_6659_FD93);
        let (a, b) = (split_mix(&mut mix), split_mix(&mut mix));

        state.copy_from_slice(&[a as u32, (a >> 32) as u32 | 1, b as u32, (b >> 32) as u32]);
    }
}

pub struct Start<'a> {
    pub parts: Parts,
    pub task: &'a Task,
    pub seed: u64,
}

pub fn build(start: Start) -> Result<(Gpu, Worlds), String> {
    let Start { parts, task, seed } = start;
    let Parts {
        plan,
        layout,
        mut gpu,
        io,
        scratch,
        ints,
        order,
        stats,
        worlds,
    } = parts;
    let text = format!("{}{}", source(&plan, &layout), task::source(task));
    let kernels = gpu.compile(&text, &KERNELS)?;
    let first = gpu.slice(io)[..2 * layout.nstate].to_vec();
    let start_row = gpu.alloc::<f32>(2 * layout.nstate)?;
    let env = gpu.alloc::<f32>(task.env_width() * worlds)?;
    let counters = gpu.alloc::<u32>(COUNTERS * worlds)?;
    let rngs = gpu.alloc::<u32>(4 * worlds)?;
    let obs = gpu.alloc::<f32>(task.nobs() * worlds)?;

    gpu.slice_mut(start_row).copy_from_slice(&first);
    gpu.slice_mut(order)
        .iter_mut()
        .enumerate()
        .for_each(|(i, o)| *o = i as u32);
    seed_streams(gpu.slice_mut(rngs), seed, 0);

    Ok((
        gpu,
        Worlds {
            kernels,
            io,
            scratch,
            ints,
            order,
            stats,
            start: start_row,
            env,
            counters,
            rngs,
            obs,
            worlds,
            nobs: task.nobs(),
            nact: task.nact(),
            nstate: layout.nstate,
            decimation: task.decimation,
            layout,
        },
    ))
}

impl Worlds {
    fn task(&self, kernel: usize, args: Vec<Arg<'static>>) -> Dispatch<'_> {
        Dispatch {
            kernel: &self.kernels[kernel],
            args,
            threads: self.worlds,
            group: TASK_GROUP,
        }
    }

    pub fn obs(&self) -> BufferId<f32> {
        self.obs
    }

    pub fn io(&self) -> BufferId<f32> {
        self.io
    }

    pub fn reset_all(&self) -> Dispatch<'_> {
        let words = vec![self.worlds as u32];
        let args = vec![
            self.io.arg(),
            self.start.arg(),
            self.env.arg(),
            self.counters.arg(),
            self.rngs.arg(),
            Arg::Owned(words),
        ];

        self.task(1, args)
    }

    pub fn act(&self, actions: BufferId<f32>, row: usize) -> Dispatch<'_> {
        let args = vec![
            self.io.arg(),
            self.env.arg(),
            self.counters.arg(),
            self.rngs.arg(),
            actions.arg(),
            Arg::Owned(vec![self.worlds as u32, row as u32]),
        ];

        self.task(2, args)
    }

    pub fn physics(&self) -> Dispatch<'_> {
        Dispatch {
            kernel: &self.kernels[0],
            args: vec![
                self.io.arg(),
                self.scratch.arg(),
                self.ints.arg(),
                self.order.arg(),
                self.stats.arg(),
                Arg::Owned(vec![self.worlds as u32, self.decimation as u32, 0]),
            ],
            threads: self.worlds,
            group: GROUP,
        }
    }

    pub fn after(&self, out: &Outputs, row: usize) -> Dispatch<'_> {
        let args = vec![
            self.io.arg(),
            self.start.arg(),
            self.env.arg(),
            self.counters.arg(),
            self.rngs.arg(),
            out.rew.arg(),
            out.done.arg(),
            out.timeout.arg(),
            out.fell.arg(),
            Arg::Owned(vec![self.worlds as u32, row as u32]),
        ];

        self.task(3, args)
    }

    pub fn observe_into(&self, obs: BufferId<f32>, row: usize) -> Dispatch<'_> {
        let args = vec![
            self.io.arg(),
            self.env.arg(),
            obs.arg(),
            Arg::Owned(vec![self.worlds as u32, row as u32]),
        ];

        self.task(4, args)
    }

    pub fn observe(&self) -> Dispatch<'_> {
        self.observe_into(self.obs, 0)
    }

    pub fn read(&self, gpu: &Gpu, world: usize, field: &str) -> Vec<f64> {
        let (at, len) = self.layout.at(field);
        let io = gpu.slice(self.io);
        let from = 2 * (world * self.nstate + at);

        io[from..from + 2 * len]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|p| f64::from(p[0]) + f64::from(p[1]))
            .collect()
    }
}
