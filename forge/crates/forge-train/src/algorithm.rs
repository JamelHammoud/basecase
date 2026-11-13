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
    fn follow_progress(&mut self, _progress: f64) {}
    fn leaves_the_cpu_free(&self) -> bool {
        false
    }
}

pub fn build<'a>(algo: Algo, envs: Envs<'a>, seed: u64, math: Math) -> Result<Box<dyn Algorithm + 'a>, String> {
    match algo {
        Algo::Ppo => Ok(Box::new(Ppo::new(envs, seed, math))),
        Algo::FastSac => Ok(Box::new(Sac::new(envs, seed, math, Recipe::fast()))),
        Algo::FlashSac => Ok(Box::new(Sac::new(envs, seed, math, Recipe::flash()))),
        Algo::Shac => Err("SHAC needs Forge's gradients, which this build doesn't carry".to_owned()),
    }
}
