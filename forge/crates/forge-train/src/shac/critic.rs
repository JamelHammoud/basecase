use super::nets::Net;
use super::rollout::Rollout;
use crate::kernels::Math;
use crate::normalizer::Normalizer;
use crate::rng::Rng;

pub struct Td {
    pub gamma: f64,
    pub lambda: f64,
}

fn next_values(rollout: &Rollout, target: &mut Net, math: &Math, norm: &Normalizer) -> Vec<Vec<f64>> {
    let horizon = rollout.steps.len();
    let count = rollout.steps[0].reward.len();
    let mut out = Vec::with_capacity(horizon);

    for t in 0..horizon {
        let step = &rollout.steps[t];
        let following = match rollout.steps.get(t + 1) {
            Some(next) => target.forward(math, &next.norm, count),
            None => target.forward(math, &rollout.last_norm, count),
        };
        let mut terminal = vec![0.0f32; step.next_obs.len()];

        norm.apply(&step.next_obs, &mut terminal);

        let at_end = target.forward(math, &terminal, count);
        let values = (0..count)
            .map(|e| match (step.fell[e], step.timeout[e]) {
                (true, _) => 0.0,
                (false, true) => f64::from(at_end[e]),
                (false, false) => f64::from(following[e]),
            })
            .collect();

        out.push(values);
    }

    out
}

pub fn targets(rollout: &Rollout, (target, math, norm): (&mut Net, &Math, &Normalizer), td: &Td) -> Vec<f32> {
    let horizon = rollout.steps.len();
    let count = rollout.steps[0].reward.len();
    let next = next_values(rollout, target, math, norm);
    let mut out = vec![0.0f32; horizon * count];

    for e in 0..count {
        let (mut ai, mut bi, mut lam) = (0.0, 0.0, 1.0);

        for t in (0..horizon).rev() {
            let step = &rollout.steps[t];
            let done = f64::from(u8::from(step.done(e)));
            let reward = step.reward[e];

            lam = lam * td.lambda * (1.0 - done) + done;
            ai = (1.0 - done)
                * (td.lambda * td.gamma * ai + td.gamma * next[t][e] + (1.0 - lam) / (1.0 - td.lambda) * reward);
            bi = td.gamma * (next[t][e] * done + bi * (1.0 - done)) + reward;
            out[t * count + e] = ((1.0 - td.lambda) * ai + lam * bi) as f32;
        }
    }

    out
}

pub struct Fit {
    pub iterations: usize,
    pub batches: usize,
    pub rate: f32,
    pub max_norm: f64,
}

pub fn train(
    critic: &mut Net,
    math: &Math,
    (rollout, targets): (&Rollout, &[f32]),
    (fit, rng): (&Fit, &mut Rng),
) -> f64 {
    let nobs = rollout.last_obs.len() / rollout.steps[0].reward.len();
    let inputs: Vec<f32> = rollout.steps.iter().flat_map(|s| s.norm.iter().copied()).collect();
    let total = targets.len();
    let size = total / fit.batches;
    let mut order: Vec<u32> = (0..total as u32).collect();
    let mut loss = 0.0;

    for _ in 0..fit.iterations {
        rng.shuffle(&mut order);

        for batch in order.chunks_exact(size) {
            let rows: Vec<f32> = batch
                .iter()
                .flat_map(|&i| inputs[i as usize * nobs..(i as usize + 1) * nobs].iter().copied())
                .collect();
            let values = critic.forward(math, &rows, size);
            let seed: Vec<f32> = values
                .iter()
                .zip(batch)
                .map(|(v, &i)| 2.0 * (v - targets[i as usize]) / size as f32)
                .collect();

            loss = values
                .iter()
                .zip(batch)
                .map(|(v, &i)| f64::from((v - targets[i as usize]).powi(2)))
                .sum::<f64>()
                / size as f64;
            critic.backward(math, (&rows, &seed), size);
            critic.step(fit.rate, fit.max_norm);
        }
    }

    loss
}

pub fn blend(target: &mut Net, critic: &Net, keep: f32) {
    target
        .params
        .iter_mut()
        .zip(&critic.params)
        .for_each(|(t, c)| *t = keep * *t + (1.0 - keep) * c);
}
