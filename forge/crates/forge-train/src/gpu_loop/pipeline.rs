use super::rollout::Encoder;
use super::stats::{Statistic, Step, Tally};
use super::{sync, GpuPpo};

macro_rules! encoder {
    ($s:ident) => {
        Encoder {
            kernels: &$s.kernels,
            buffers: &$s.buffers,
            worlds: &$s.worlds,
            nets: [&$s.actor, &$s.critic],
            dims: &$s.dims,
        }
    };
}

impl GpuPpo {
    fn collected(&mut self) {
        let r = &self.buffers.rollout;

        self.reward_mean = sync::reward_mean(&self.gpu, r);
        sync::track(&self.gpu, r, &self.dims, &mut self.episodes);
        self.steps += self.dims.total() as u64;
    }

    fn collect(&mut self) -> Result<(), String> {
        let list = encoder!(self).rollout(&self.buffers.rollout);
        let timing = self.gpu.run(&list)?;

        self.phases.physics += timing.gpu_seconds;
        self.collected();

        Ok(())
    }

    fn shuffle_rows(&mut self) {
        let total = self.dims.total();
        let perm = self.gpu.slice_mut(self.buffers.perm);

        for epoch in 0..self.dims.epochs {
            self.shuffle.shuffle(&mut self.order);
            perm[epoch * total..(epoch + 1) * total].copy_from_slice(&self.order);
        }
    }

    pub(super) fn step(&mut self) -> Result<(), String> {
        self.collect()?;
        self.shuffle_rows();

        let list = encoder!(self).learn(&self.buffers.rollout, &self.settings);

        let timing = self.gpu.run(&list)?;

        self.phases.gradient += timing.gpu_seconds;

        Ok(())
    }

    pub fn horizon(&self) -> usize {
        self.dims.horizon
    }

    pub fn rollout_stats(&mut self, rounds: usize) -> Result<Vec<Statistic>, String> {
        let (n, nobs, nact) = (self.dims.envs, self.dims.nobs, self.dims.nact);
        let mut tally = Tally::new(n, nact);
        let mut raw = vec![0.0f32; nobs];

        for _ in 0..rounds {
            self.collect()?;

            let norm = sync::normalizer(&self.gpu, &self.buffers, nobs);
            let std = norm.std();
            let r = &self.buffers.rollout;
            let (obs, act) = (self.gpu.slice(r.obs), self.gpu.slice(r.act));
            let (rew, fell) = (self.gpu.slice(r.rew), self.gpu.slice(r.fell));

            for i in 0..self.dims.total() {
                for (k, x) in raw.iter_mut().enumerate() {
                    *x = (f64::from(obs[i * nobs + k]) * std[k] + norm.mean[k]) as f32;
                }

                let step = Step {
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
}
