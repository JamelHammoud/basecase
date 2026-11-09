use super::buffers::{Buffers, Dims};
use super::learn::Settings;
use super::qualify::{self, Device};
use super::rollout::Encoder;
use super::source::{source, Ctrl, Sizes, NAMES};
use super::{task, GpuPpo};
use crate::episodes::Episodes;
use crate::events::Phases;
use crate::kernels::Math;
use crate::mask::actor_mask;
use crate::physics::{Engine, Physics};
use crate::randomize::randomize;
use crate::rng::Rng;
use crate::robot::Robot;
use crate::update::{Hyper, Learner, HYPER};
use forge_sim::metal::gpu::Gpu;
use forge_sim::metal::{seed_streams, Worlds};
use forge_sim::MetalBatch;

const INIT_STREAM: u64 = 1_000_000;
const NOISE_STREAM: u64 = 2_000_000;
const SHUFFLE_STREAM: u64 = 3_000_000;
const NORM_COUNT: f32 = 1e-4;
const LARGE_BATCH: usize = 2048;
const LARGE_HORIZON: usize = 4;
const LARGE_EPOCHS: usize = 5;
const LARGE_MINIBATCHES: usize = 16;
const LARGE_KL: f32 = 0.1;

pub struct Start<'a> {
    pub robot: &'a Robot,
    pub envs: usize,
    pub env_seed: u64,
    pub seed: u64,
    pub math: Math,
}

pub fn hyper(envs: usize) -> Hyper {
    if envs < LARGE_BATCH {
        return Hyper::for_envs(envs);
    }

    Hyper {
        horizon: LARGE_HORIZON,
        epochs: LARGE_EPOCHS,
        minibatches: LARGE_MINIBATCHES,
        desired_kl: LARGE_KL,
        ..HYPER
    }
}

pub(super) fn worlds(start: &Start, task: &forge_ir::task::Task) -> Result<(Gpu, Worlds, String), String> {
    let robot = start.robot;
    let Engine::Metal { device, .. } = &robot.engine else {
        return Err("Forge's GPU loop needs the Metal engine".to_owned());
    };
    let mut physics = Physics::new(&robot.model, &robot.engine, &robot.layout, (start.envs, 1))?;
    let mut rngs: Vec<Rng> = (0..start.envs).map(|i| Rng::new(start.env_seed, i as u64)).collect();

    randomize(&mut physics, robot.nu, &mut rngs)?;

    for sim in 0..start.envs {
        physics.row(sim).copy_from_slice(&robot.start_row);
    }

    let Physics::Metal(batch) = physics else {
        return Err("Forge's GPU loop needs the Metal engine".to_owned());
    };
    let (gpu, worlds) = MetalBatch::into_worlds(*batch, task, start.env_seed)?;

    Ok((gpu, worlds, device.clone()))
}

fn upload(gpu: &mut Gpu, buffers: &Buffers, learner: &Learner, seed: u64) {
    let nobs = learner.nobs;

    gpu.slice_mut(buffers.learner.params).copy_from_slice(&learner.params);
    gpu.slice_mut(buffers.ctrl)[Ctrl::Lr as usize] = learner.learn_rate;

    let stats = gpu.slice_mut(buffers.stats);

    stats[nobs..2 * nobs].fill(1.0);
    stats[2 * nobs..].fill(NORM_COUNT);

    let mask = gpu.slice_mut(buffers.mask);

    mask.fill(1.0);
    learner.actor.masked.iter().for_each(|&i| mask[i] = 0.0);
    seed_streams(gpu.slice_mut(buffers.noise), seed, NOISE_STREAM);
}

pub fn start(start: Start) -> Result<GpuPpo, String> {
    let robot = start.robot;
    let task = task::lower(robot)?;
    let (mut gpu, worlds, device) = worlds(&start, &task)?;
    let hyper = hyper(start.envs);
    let (nobs, nact) = (robot.nobs(), robot.nact);
    let total = hyper.horizon * start.envs;
    let mut learner = Learner::new(nobs, nact, 1, &mut Rng::new(start.seed, INIT_STREAM));

    learner.mask_actor(actor_mask(&robot.job.options));

    if let Some(floor) = robot.job.log_std_min {
        learner.floor_log_std(floor);
    }

    let dims = Dims {
        envs: start.envs,
        horizon: hyper.horizon,
        minibatch: total / hyper.minibatches,
        epochs: hyper.epochs,
        nobs,
        nact,
        nparams: learner.params.len(),
    };
    let sizes = Sizes {
        nobs,
        nact,
        log_std_at: learner.critic.param_end(),
        nparams: dims.nparams,
    };
    let kernels = gpu.compile(&source(&sizes), &NAMES)?;
    let settings = Settings {
        hyper,
        log_std_min: robot.job.log_std_min.unwrap_or(f32::NEG_INFINITY),
        masked: !learner.actor.masked.is_empty(),
        squashed: task.squash,
    };
    let checked = Device {
        kernels: &kernels,
        worlds: &worlds,
        settings: &settings,
    };

    qualify::learner(&mut gpu, &checked, &learner)
        .map_err(|why| format!("{device} failed the GPU loop's qualification vectors: {why}"))?;

    let buffers = Buffers::new(&mut gpu, &dims, [&learner.actor, &learner.critic])?;

    upload(&mut gpu, &buffers, &learner, start.seed);

    let encoder = Encoder {
        kernels: &kernels,
        buffers: &buffers,
        worlds: &worlds,
        nets: [&learner.actor, &learner.critic],
        dims: &dims,
    };

    gpu.run(&encoder.start())?;

    let norm = super::sync::normalizer(&gpu, &buffers, nobs);

    Ok(GpuPpo {
        settings,
        episodes: Episodes::new(start.envs, robot.control_dt),
        shuffle: Rng::new(start.seed, SHUFFLE_STREAM),
        order: (0..total as u32).collect(),
        steps: 0,
        phases: Phases::default(),
        reward_mean: 0.0,
        actor: learner.actor.clone(),
        critic: learner.critic.clone(),
        math: start.math,
        gpu,
        worlds,
        kernels,
        buffers,
        dims,
        norm,
        device,
    })
}
