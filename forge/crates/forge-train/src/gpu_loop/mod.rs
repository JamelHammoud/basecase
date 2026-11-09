mod buffers;
mod gemm;
mod learn;
mod nets;
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
use rollout::Encoder;

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

impl GpuPpo {
    fn collect(&mut self) -> Result<(), String> {
        let encoder = Encoder {
            kernels: &self.kernels,
            buffers: &self.buffers,
            worlds: &self.worlds,
            nets: [&self.actor, &self.critic],
            dims: &self.dims,
        };
        let timing = self.gpu.run(&encoder.rollout())?;

        self.phases.physics += timing.gpu_seconds;
        self.reward_mean = sync::reward_mean(&self.gpu, &self.buffers);
        sync::track(&self.gpu, &self.buffers, &self.dims, &mut self.episodes);
        self.steps += self.dims.total() as u64;

        Ok(())
    }

    pub fn horizon(&self) -> usize {
        self.dims.horizon
    }

    pub fn rollout_stats(&mut self, rounds: usize) -> Result<Vec<stats::Statistic>, String> {
        let (n, nobs, nact) = (self.dims.envs, self.dims.nobs, self.dims.nact);
        let mut tally = stats::Tally::new(n, nact);
        let mut raw = vec![0.0f32; nobs];

        for _ in 0..rounds {
            self.collect()?;

            let norm = sync::normalizer(&self.gpu, &self.buffers, nobs);
            let std = norm.std();
            let b = &self.buffers;
            let (obs, act) = (self.gpu.slice(b.obs), self.gpu.slice(b.act));
            let (rew, fell) = (self.gpu.slice(b.rew), self.gpu.slice(b.fell));

            for i in 0..self.dims.total() {
                for (k, r) in raw.iter_mut().enumerate() {
                    *r = (f64::from(obs[i * nobs + k]) * std[k] + norm.mean[k]) as f32;
                }

                let step = stats::Step {
                    obs: &raw,
                    action: &act[i * nact..(i + 1) * nact],
                    reward: rew[i],
                    fell: fell[i] != 0.0,
                };

                tally.add(i % n, &step);
            }
        }

        Ok(tally.summary())
    }

    fn shuffle_rows(&mut self) {
        let total = self.dims.total();
        let perm = self.gpu.slice_mut(self.buffers.perm);

        for epoch in 0..self.dims.epochs {
            self.shuffle.shuffle(&mut self.order);
            perm[epoch * total..(epoch + 1) * total].copy_from_slice(&self.order);
        }
    }

    fn update(&mut self) -> Result<(), String> {
        self.shuffle_rows();

        let encoder = Encoder {
            kernels: &self.kernels,
            buffers: &self.buffers,
            worlds: &self.worlds,
            nets: [&self.actor, &self.critic],
            dims: &self.dims,
        };
        let list = encoder.learn(&self.settings);

        let timing = self.gpu.run(&list)?;

        self.phases.gradient += timing.gpu_seconds;

        Ok(())
    }
}

impl Algorithm for GpuPpo {
    fn iterate(&mut self) -> Result<(), String> {
        self.collect()?;
        self.update()
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
        let params = self.gpu.slice(self.buffers.params).to_vec();

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
