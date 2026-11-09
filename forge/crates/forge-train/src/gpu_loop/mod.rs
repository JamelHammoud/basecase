mod buffers;
mod gemm;
mod learn;
mod nets;
mod pipeline;
mod qualify;
mod rollout;
mod setup;
mod source;
pub mod stats;
mod sync;
mod task;

use crate::algorithm::{Algorithm, Report};
use crate::deployed::{Deployed, Squash};
use crate::episodes::Episodes;
use crate::events::Phases;
use crate::kernels::Math;
use crate::mlp::Mlp;
use crate::normalizer::Normalizer;
use crate::rng::Rng;
use crate::warm::{Snapshot, WarmStart};
use buffers::{Buffers, Dims};
use forge_sim::metal::gpu::{Gpu, Kernel};
use forge_sim::metal::Worlds;
use learn::Settings;

pub use setup::{start, Start};

pub struct GpuPpo {
    gpu: Gpu,
    worlds: Worlds,
    kernels: Vec<Kernel>,
    buffers: Buffers,
    actor: Mlp,
    critic: Mlp,
    dims: Dims,
    settings: Settings,
    math: Math,
    norm: Normalizer,
    episodes: Episodes,
    shuffle: Rng,
    order: Vec<u32>,
    steps: u64,
    phases: Phases,
    reward_mean: f64,
    pub device: String,
}

impl Algorithm for GpuPpo {
    fn iterate(&mut self) -> Result<(), String> {
        self.step()
    }

    fn report(&mut self) -> Report {
        self.episodes.trim();
        self.norm = sync::normalizer(&self.gpu, &self.buffers, self.dims.nobs);

        Report {
            steps: self.steps,
            phases: self.phases,
            reward_mean: self.reward_mean,
            episode_seconds: self.episodes.mean_seconds(),
        }
    }

    fn deployed(&self) -> Deployed {
        let params = self.gpu.slice(self.buffers.learner.params).to_vec();

        Deployed::new(self.actor.clone(), params, Squash::Clip)
    }

    fn norm(&self) -> &Normalizer {
        &self.norm
    }

    fn math(&self) -> &Math {
        &self.math
    }

    fn snapshot(&self) -> Snapshot {
        sync::snapshot(&self.gpu, &self.buffers, [&self.actor, &self.critic])
    }

    fn warm_start(&mut self, source: &WarmStart) -> Result<Vec<String>, String> {
        let floor = self.settings.log_std_min;
        let notes = sync::warm_start(
            &mut self.gpu,
            &self.buffers,
            [&self.actor, &self.critic],
            (source, floor),
        )?;

        self.norm = sync::normalizer(&self.gpu, &self.buffers, self.dims.nobs);

        Ok(notes)
    }
}
