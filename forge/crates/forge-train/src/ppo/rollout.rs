pub struct Rollout {
    pub obs: Vec<f32>,
    pub act: Vec<f32>,
    pub logp: Vec<f32>,
    pub val: Vec<f32>,
    pub rew: Vec<f32>,
    pub done: Vec<f32>,
    pub timeout: Vec<f32>,
    pub adv: Vec<f32>,
    pub ret: Vec<f32>,
    pub final_values: Vec<f32>,
    pub final_obs: Vec<f32>,
    pub envs: usize,
}

impl Rollout {
    pub fn new(envs: usize, horizon: usize, nobs: usize, nact: usize) -> Self {
        let total = envs * horizon;

        Self {
            obs: vec![0.0; total * nobs],
            act: vec![0.0; total * nact],
            logp: vec![0.0; total],
            val: vec![0.0; total],
            rew: vec![0.0; total],
            done: vec![0.0; total],
            timeout: vec![0.0; total],
            adv: vec![0.0; total],
            ret: vec![0.0; total],
            final_values: vec![0.0; envs],
            final_obs: vec![0.0; envs * nobs],
            envs,
        }
    }

    pub fn len(&self) -> usize {
        self.rew.len()
    }

    pub fn reward_mean(&self) -> f64 {
        self.rew.iter().map(|v| *v as f64).sum::<f64>() / self.rew.len().max(1) as f64
    }

    pub fn advantages(&mut self, gamma: f32, lam: f32) {
        let n = self.envs;
        let horizon = self.len() / n;

        for i in 0..horizon * n {
            self.rew[i] += gamma * self.val[i] * self.timeout[i];
        }

        for sim in 0..n {
            let mut gae = 0.0f32;

            for t in (0..horizon).rev() {
                let at = t * n + sim;
                let next_value = if t == horizon - 1 {
                    self.final_values[sim]
                } else {
                    self.val[at + n]
                };
                let alive = 1.0 - self.done[at];
                let delta = self.rew[at] + gamma * next_value * alive - self.val[at];

                gae = delta + gamma * lam * alive * gae;
                self.adv[at] = gae;
                self.ret[at] = gae + self.val[at];
            }
        }
    }

    pub fn normalize_advantages(&mut self) {
        let total = self.adv.len() as f64;
        let mean = self.adv.iter().map(|v| *v as f64).sum::<f64>() / total;
        let var = self.adv.iter().map(|v| (*v as f64 - mean).powi(2)).sum::<f64>() / (total - 1.0).max(1.0);
        let std = var.sqrt() + 1e-8;

        self.adv.iter_mut().for_each(|v| *v = ((*v as f64 - mean) / std) as f32);
    }
}
