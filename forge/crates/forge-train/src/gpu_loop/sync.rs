use super::buffers::{Buffers, Dims, Rollout};
use super::source::Ctrl;
use crate::episodes::Episodes;
use crate::mlp::Mlp;
use crate::normalizer::Normalizer;
use crate::update::{LEARN_RATE_MAX, LEARN_RATE_MIN, LOG_STD_MAX};
use crate::warm::{Net, Snapshot, WarmStart};
use forge_sim::metal::gpu::Gpu;

const ALGO: &str = "ppo";

pub fn reward_mean(gpu: &Gpu, r: &Rollout) -> f64 {
    let rew = gpu.slice(r.rew);

    rew.iter().map(|v| f64::from(*v)).sum::<f64>() / rew.len().max(1) as f64
}

pub fn track(gpu: &Gpu, r: &Rollout, dims: &Dims, episodes: &mut Episodes) {
    let n = dims.envs;
    let (fell, timeout) = (gpu.slice(r.fell), gpu.slice(r.timeout));

    for t in 0..dims.horizon {
        let rows = t * n..(t + 1) * n;
        let fell: Vec<bool> = fell[rows.clone()].iter().map(|v| *v != 0.0).collect();
        let timeout: Vec<bool> = timeout[rows].iter().map(|v| *v != 0.0).collect();

        episodes.track(&fell, &timeout);
    }
}

pub fn normalizer(gpu: &Gpu, b: &Buffers, nobs: usize) -> Normalizer {
    let stats = gpu.slice(b.stats);
    let wide = |range: std::ops::Range<usize>| stats[range].iter().map(|v| f64::from(*v)).collect();

    Normalizer::restored(wide(0..nobs), wide(nobs..2 * nobs), f64::from(stats[2 * nobs]))
}

pub fn write_normalizer(gpu: &mut Gpu, b: &Buffers, norm: &Normalizer) {
    let nobs = norm.mean.len();
    let stats = gpu.slice_mut(b.stats);

    for i in 0..nobs {
        stats[i] = norm.mean[i] as f32;
        stats[nobs + i] = norm.var[i] as f32;
        stats[2 * nobs + i] = norm.count() as f32;
    }
}

pub fn snapshot(gpu: &Gpu, b: &Buffers, nets: [&Mlp; 2]) -> Snapshot {
    let params = gpu.slice(b.learner.params);
    let log_std_at = nets[1].param_end();

    Snapshot {
        algo: ALGO.to_owned(),
        actor: Net::of(nets[0], params),
        critic: Net::of(nets[1], params),
        log_std: params[log_std_at..].to_vec(),
        learn_rate: Some(gpu.slice(b.ctrl)[Ctrl::Lr as usize]),
        log_alpha: None,
    }
}

pub fn warm_start(
    gpu: &mut Gpu,
    b: &Buffers,
    nets: [&Mlp; 2],
    source: (&WarmStart, f32),
) -> Result<Vec<String>, String> {
    let (source, floor) = source;
    let [actor, critic] = nets;
    let state = &source.state;
    let nact = actor.outs();
    let log_std_at = critic.param_end();
    let mut params = gpu.slice(b.learner.params).to_vec();
    let mut notes = Vec::new();

    state.actor.load_into(actor, &mut params, nact)?;
    actor.zero_masked(&mut params);

    if state.algo == ALGO && state.critic.sizes == critic.sizes() {
        state.critic.load_into(critic, &mut params, 1)?;
    } else {
        notes.push("Its value estimate starts fresh".to_owned());
    }

    if state.log_std.len() == nact {
        params[log_std_at..]
            .iter_mut()
            .zip(&state.log_std)
            .for_each(|(p, s)| *p = s.clamp(floor, LOG_STD_MAX));
    }

    gpu.slice_mut(b.learner.params).copy_from_slice(&params);

    if let Some(rate) = state.learn_rate {
        gpu.slice_mut(b.ctrl)[Ctrl::Lr as usize] = rate.clamp(LEARN_RATE_MIN, LEARN_RATE_MAX);
    }

    write_normalizer(gpu, b, &source.norm);

    Ok(notes)
}
