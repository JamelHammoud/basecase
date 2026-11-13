use super::demos::{Demos, Rows};
use crate::adam::Adam;
use crate::clock::Instant;
use crate::deployed::{Deployed, Squash};
use crate::kernels::Math;
use crate::mlp::{BackwardSets, Mlp, Scratch};
use crate::normalizer::Normalizer;
use crate::rng::Rng;
use crate::update::{sized, ACTOR_OUT_GAIN};
use std::ops::Range;

pub const MAX_EPOCHS: usize = 600;
pub const PATIENCE: usize = 40;
pub const BATCH: usize = 64;
const LEARN_RATE: f32 = 1e-3;
pub const STD_FLOOR: f64 = 1e-2;
const CONSTANT_STD: f64 = 1e-6;
const INIT_STREAM: u64 = 1_000_000;
const SHUFFLE_STREAM: u64 = 3_000_000;
const NOISE_STREAM: u64 = 4_000_000;

pub struct Settings<'a> {
    pub seed: u64,
    pub max_epochs: usize,
    pub budget_s: f64,
    pub mask: &'a [usize],
    pub state_noise: f32,
    pub noisy: Range<usize>,
}

pub struct Epoch {
    pub epoch: usize,
    pub rows_seen: u64,
    pub elapsed_s: f64,
    pub train_loss: f64,
    pub held_loss: f64,
}

pub struct Fitted {
    pub policy: Deployed,
    pub norm: Normalizer,
    pub epochs: usize,
    pub best_epoch: usize,
    pub train_loss: f64,
    pub held_loss: f64,
    pub rows_seen: u64,
    pub stopped: bool,
}

pub fn normalizer(rows: &Rows, nobs: usize) -> (Normalizer, Vec<usize>) {
    let count = rows.count.max(1) as f64;
    let mut mean = vec![0.0f64; nobs];
    let mut var = vec![0.0f64; nobs];

    for row in rows.obs.chunks_exact(nobs) {
        mean.iter_mut().zip(row).for_each(|(m, x)| *m += *x as f64 / count);
    }

    for row in rows.obs.chunks_exact(nobs) {
        for ((v, x), m) in var.iter_mut().zip(row).zip(&mean) {
            *v += (*x as f64 - m).powi(2) / count;
        }
    }

    let constant = (0..nobs).filter(|&i| var[i].sqrt() < CONSTANT_STD).collect();
    let floored = var.iter().map(|v| v.max(STD_FLOOR * STD_FLOOR)).collect();

    (Normalizer::restored(mean, floored, count), constant)
}

fn normalized(norm: &Normalizer, rows: &Rows) -> Vec<f32> {
    let mut out = vec![0.0f32; rows.obs.len()];

    norm.apply(&rows.obs, &mut out);

    out
}

struct Learner {
    net: Mlp,
    params: Vec<f32>,
    grads: Vec<f32>,
    adam: Adam,
    math: Math,
    scratch: Scratch,
    nobs: usize,
    nact: usize,
}

impl Learner {
    fn new(demos: &Demos, mask: &[usize], seed: u64) -> Self {
        let mut net = Mlp::plan(&sized(demos.nobs, demos.nact), 0);
        let mut params = vec![0.0f32; net.param_end()];

        net.initialize(&mut params, ACTOR_OUT_GAIN, &mut Rng::new(seed, INIT_STREAM));
        net.mask_inputs(mask);
        net.zero_masked(&mut params);

        Self {
            scratch: net.scratch(BATCH),
            grads: vec![0.0; params.len()],
            adam: Adam::new(params.len()),
            math: Math::native(1),
            nobs: demos.nobs,
            nact: demos.nact,
            net,
            params,
        }
    }

    fn step(&mut self, obs: &[f32], targets: &[f32], rows: usize) -> f64 {
        self.net.forward(&self.math, &self.params, obs, rows, &mut self.scratch);

        let scale = 2.0 / (rows * self.nact) as f32;
        let (out, seed) = self.net.output_and_seed(rows, &mut self.scratch);
        let mut squared = 0.0f64;

        for ((s, o), t) in seed.iter_mut().zip(out).zip(targets) {
            let error = o - t;

            squared += (error as f64).powi(2);
            *s = error * scale;
        }

        let sets = BackwardSets {
            params: &self.params,
            grads: &mut self.grads,
            input: obs,
        };

        self.net.backward(&self.math, sets, rows, &mut self.scratch);
        self.adam.step(&mut self.params, &self.grads, LEARN_RATE);

        squared
    }

    fn loss(&mut self, params: &[f32], obs: &[f32], targets: &[f32]) -> f64 {
        let mut squared = 0.0f64;

        for (x, y) in obs.chunks(BATCH * self.nobs).zip(targets.chunks(BATCH * self.nact)) {
            let rows = y.len() / self.nact;
            let out = self.net.forward(&self.math, params, x, rows, &mut self.scratch);

            squared += out
                .iter()
                .zip(y)
                .map(|(o, t)| (o.clamp(-1.0, 1.0) - t) as f64)
                .map(|e| e * e)
                .sum::<f64>();
        }

        squared / targets.len().max(1) as f64
    }

    fn current_loss(&mut self, obs: &[f32], targets: &[f32]) -> f64 {
        let params = std::mem::take(&mut self.params);
        let loss = self.loss(&params, obs, targets);

        self.params = params;

        loss
    }
}

struct Batches {
    order: Vec<u32>,
    rng: Rng,
    obs: Vec<f32>,
    targets: Vec<f32>,
    noise: Noise,
}

struct Noise {
    std: f32,
    columns: Range<usize>,
    rng: Rng,
}

impl Noise {
    fn perturb(&mut self, row: &mut [f32]) {
        if self.std <= 0.0 {
            return;
        }

        for value in &mut row[self.columns.clone()] {
            *value += self.std * self.rng.normal() as f32;
        }
    }
}

impl Batches {
    fn epoch(&mut self, learner: &mut Learner, obs: &[f32], targets: &[f32]) -> f64 {
        let (nobs, nact) = (learner.nobs, learner.nact);
        let mut squared = 0.0f64;

        self.rng.shuffle(&mut self.order);

        for chunk in self.order.chunks(BATCH) {
            self.obs.clear();
            self.targets.clear();

            for &row in chunk {
                let row = row as usize;

                let at = self.obs.len();

                self.obs.extend_from_slice(&obs[row * nobs..(row + 1) * nobs]);
                self.noise.perturb(&mut self.obs[at..]);
                self.targets.extend_from_slice(&targets[row * nact..(row + 1) * nact]);
            }

            squared += learner.step(&self.obs, &self.targets, chunk.len());
        }

        squared / targets.len().max(1) as f64
    }
}

struct Best {
    params: Vec<f32>,
    loss: f64,
    epoch: usize,
}

pub fn fit(demos: &Demos, settings: &Settings, watch: &mut dyn FnMut(&Epoch) -> bool) -> Fitted {
    let (norm, constant) = normalizer(&demos.train, demos.nobs);
    let mask: Vec<usize> = settings.mask.iter().chain(&constant).copied().collect();
    let mut learner = Learner::new(demos, &mask, settings.seed);
    let (train_obs, held_obs) = (normalized(&norm, &demos.train), normalized(&norm, &demos.held));
    let mut batches = Batches {
        order: (0..demos.train.count as u32).collect(),
        rng: Rng::new(settings.seed, SHUFFLE_STREAM),
        obs: Vec::with_capacity(BATCH * demos.nobs),
        targets: Vec::with_capacity(BATCH * demos.nact),
        noise: Noise {
            std: settings.state_noise,
            columns: settings.noisy.clone(),
            rng: Rng::new(settings.seed, NOISE_STREAM),
        },
    };
    let mut best = Best {
        params: learner.params.clone(),
        loss: f64::INFINITY,
        epoch: 0,
    };
    let started = Instant::now();
    let (mut epoch, mut stopped) = (0usize, false);

    while epoch < settings.max_epochs.max(1) && epoch < best.epoch + PATIENCE {
        let train_loss = batches.epoch(&mut learner, &train_obs, &demos.train.actions);
        let held_loss = learner.current_loss(&held_obs, &demos.held.actions);

        epoch += 1;

        if held_loss < best.loss {
            best = Best {
                params: learner.params.clone(),
                loss: held_loss,
                epoch,
            };
        }

        let report = Epoch {
            epoch,
            rows_seen: (epoch * demos.train.count) as u64,
            elapsed_s: started.elapsed().as_secs_f64(),
            train_loss,
            held_loss,
        };

        stopped = !watch(&report);

        if stopped || report.elapsed_s >= settings.budget_s {
            break;
        }
    }

    let train_loss = learner.loss(&best.params, &train_obs, &demos.train.actions);

    Fitted {
        policy: Deployed::new(learner.net, best.params, Squash::Clip),
        norm,
        epochs: epoch,
        best_epoch: best.epoch,
        train_loss,
        held_loss: best.loss,
        rows_seen: (epoch * demos.train.count) as u64,
        stopped,
    }
}
