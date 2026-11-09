use crate::deployed::Deployed;
use crate::envs::Envs;
use crate::events::Phases;
use crate::job::Algo;
use crate::kernels::Math;
use crate::normalizer::Normalizer;
use crate::ppo::Ppo;
use crate::sac::{Recipe, Sac};
use crate::warm::{Snapshot, WarmStart};

pub struct Report {
    pub steps: u64,
    pub phases: Phases,
    pub reward_mean: f64,
    pub episode_seconds: f64,
}

pub trait Algorithm {
    fn iterate(&mut self) -> Result<(), String>;
    fn report(&mut self) -> Report;
    fn deployed(&self) -> Deployed;
    fn norm(&self) -> &Normalizer;
    fn math(&self) -> &Math;
    fn snapshot(&self) -> Snapshot;
    fn warm_start(&mut self, source: &WarmStart) -> Result<Vec<String>, String>;
    fn follow_progress(&mut self, progress: f64);
}

pub fn build<'a>(algo: Algo, envs: Envs<'a>, seed: u64, math: Math) -> Box<dyn Algorithm + 'a> {
    match algo {
        Algo::Ppo => Box::new(Ppo::new(envs, seed, math)),
        Algo::FastSac => Box::new(Sac::new(envs, seed, math, Recipe::fast())),
        Algo::FlashSac => Box::new(Sac::new(envs, seed, math, Recipe::flash())),
    }
}
