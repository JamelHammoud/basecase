use crate::adam::{square_sum, NORM_CHUNK};
use crate::heads::{
    gaussian_constant, log_prob, policy_gradient, value_gradient, Head, Minibatch, PolicyTerms, Widths,
};
use crate::kernels::Math;
use crate::mlp::{Mlp, Scratch};
use crate::pool::{Pool, SharedSlice};
use crate::update::Hyper;
use std::sync::{Mutex, MutexGuard};

const ROWS_PER_BLOCK: usize = 96;
const MAX_BLOCKS: usize = 8;
const CHUNKS_PER_SPAN: usize = 8;

pub struct Nets<'a> {
    pub actor: &'a Mlp,
    pub critic: &'a Mlp,
    pub params: &'a [f32],
    pub log_std_at: usize,
}

struct Lane {
    scratch: Scratch,
    grads: Vec<f32>,
    log_std_grads: Vec<f32>,
    kl: f64,
}

struct Work<'a> {
    math: &'a Math,
    nets: &'a Nets<'a>,
    hyper: &'a Hyper,
    scale: f32,
}

pub struct Refresh<'a> {
    pub obs: &'a [f32],
    pub act: &'a [f32],
    pub logp: &'a mut [f32],
    pub val: &'a mut [f32],
}

pub struct Blocks {
    pool: Pool,
    count: usize,
    lane_rows: usize,
    lanes: Vec<Mutex<Lane>>,
}

fn block_count(capacity: usize) -> usize {
    (capacity / ROWS_PER_BLOCK).clamp(1, MAX_BLOCKS)
}

fn pool_threads(tasks: usize) -> usize {
    let cores = std::thread::available_parallelism().map_or(4, |c| c.get());

    cores.div_ceil(2).min(tasks)
}

fn lane(net: &Mlp, rows: usize, log_std_size: usize) -> Mutex<Lane> {
    Mutex::new(Lane {
        scratch: net.scratch(rows),
        grads: vec![0.0; net.param_end() - net.first_param],
        log_std_grads: vec![0.0; log_std_size],
        kl: 0.0,
    })
}

fn policy_lane(lane: &mut Lane, work: &Work, part: &Minibatch, first: bool) {
    let Lane {
        scratch,
        grads,
        log_std_grads,
        kl,
    } = lane;
    let Work {
        math,
        nets,
        hyper,
        scale,
    } = *work;
    let ent_coef = if first { hyper.ent_coef } else { 0.0 };

    if part.rows == 0 {
        grads.fill(0.0);
        log_std_grads.fill(-ent_coef);
        *kl = 0.0;

        return;
    }

    let head = Head {
        net: nets.actor,
        scratch,
        params: nets.params,
        grads,
    };
    let terms = PolicyTerms {
        log_std: &nets.params[nets.log_std_at..],
        log_std_grads,
        clip: hyper.clip,
        ent_coef,
        scale,
    };

    *kl = policy_gradient(math, head, part, terms);
}

fn value_lane(lane: &mut Lane, work: &Work, part: &Minibatch) {
    if part.rows == 0 {
        lane.grads.fill(0.0);

        return;
    }

    let head = Head {
        net: work.nets.critic,
        scratch: &mut lane.scratch,
        params: work.nets.params,
        grads: &mut lane.grads,
    };

    value_gradient(work.math, head, part, work.scale);
}

fn grads_of<'a>(lanes: &[&'a Lane]) -> Vec<&'a [f32]> {
    lanes.iter().map(|lane| &lane.grads[..]).collect()
}

fn log_std_grads_of<'a>(lanes: &[&'a Lane]) -> Vec<&'a [f32]> {
    lanes.iter().map(|lane| &lane.log_std_grads[..]).collect()
}

fn add_part(target: &mut [f32], from: usize, offset: usize, sources: &[&[f32]]) {
    let start = from.max(offset);
    let end = (from + target.len()).min(offset + sources[0].len());

    if start >= end {
        return;
    }

    let out = &mut target[start - from..end - from];

    out.copy_from_slice(&sources[0][start - offset..end - offset]);

    for source in &sources[1..] {
        out.iter_mut()
            .zip(&source[start - offset..end - offset])
            .for_each(|(o, s)| *o += s);
    }
}

impl Blocks {
    pub fn new(actor: &Mlp, critic: &Mlp, capacity: usize) -> Self {
        let count = block_count(capacity);
        let rows = capacity.div_ceil(count);
        let nact = actor.outs();
        let actors = (0..count).map(|_| lane(actor, rows, nact));
        let critics = (0..count).map(|_| lane(critic, rows, 0));

        Self {
            pool: Pool::new(pool_threads(2 * count)),
            count,
            lane_rows: rows,
            lanes: actors.chain(critics).collect(),
        }
    }

    pub fn gradients(&self, math: &Math, nets: &Nets, batch: &Minibatch, hyper: &Hyper) -> f32 {
        let serial = math.serial();
        let count = self.count;
        let lanes = &self.lanes;
        let widths = Widths {
            obs: nets.actor.layers[0].ins,
            act: nets.actor.outs(),
        };
        let work = Work {
            math: &serial,
            nets,
            hyper,
            scale: 1.0 / batch.rows as f32,
        };

        self.pool.run(2 * count, |task| {
            let block = task % count;
            let part = batch.rows_between(block * batch.rows / count, (block + 1) * batch.rows / count, widths);
            let mut lane = lanes[task].lock().expect("a learner lane");

            if task < count {
                policy_lane(&mut lane, &work, &part, block == 0);
            } else {
                value_lane(&mut lane, &work, &part);
            }
        });

        let kl: f64 = self.lanes[..count]
            .iter()
            .map(|lane| lane.lock().expect("a learner lane").kl)
            .sum();

        (kl / batch.rows as f64) as f32
    }

    pub fn spans<F>(&self, len: usize, work: F)
    where
        F: Fn(usize, usize) + Sync,
    {
        let span = NORM_CHUNK * CHUNKS_PER_SPAN;

        self.pool.run(len.div_ceil(span), |task| {
            work(task * span, ((task + 1) * span).min(len))
        });
    }

    pub fn reduce(&self, grads: &mut [f32], nets: &Nets) -> f64 {
        let count = self.count;
        let guards: Vec<MutexGuard<Lane>> = self.lanes.iter().map(|l| l.lock().expect("a learner lane")).collect();
        let views: Vec<&Lane> = guards.iter().map(|guard| &**guard).collect();
        let parts = [
            (0, grads_of(&views[..count])),
            (nets.critic.first_param, grads_of(&views[count..])),
            (nets.log_std_at, log_std_grads_of(&views[..count])),
        ];
        let len = grads.len();
        let mut chunk_sums = vec![0.0f32; len.div_ceil(NORM_CHUNK)];
        let out = SharedSlice::new(grads);
        let sums = SharedSlice::new(&mut chunk_sums);

        self.spans(len, |from, to| {
            let target = unsafe { out.range(from, to) };
            let chunk_sums = unsafe { sums.range(from / NORM_CHUNK, to.div_ceil(NORM_CHUNK)) };

            for (offset, sources) in &parts {
                add_part(target, from, *offset, sources);
            }

            for (sum, chunk) in chunk_sums.iter_mut().zip(target.chunks(NORM_CHUNK)) {
                *sum = square_sum(chunk);
            }
        });

        chunk_sums.iter().map(|s| *s as f64).sum::<f64>().sqrt()
    }

    pub fn refresh(&self, math: &Math, nets: &Nets, targets: Refresh) {
        let serial = math.serial();
        let Refresh { obs, act, logp, val } = targets;
        let rows = logp.len();
        let (count, chunk) = (self.count, self.lane_rows);
        let chunks = rows.div_ceil(chunk);
        let log_std = &nets.params[nets.log_std_at..];
        let policy = Policy {
            inverse_std: log_std.iter().map(|s| (-s).exp()).collect(),
            constant: gaussian_constant(log_std),
        };
        let (nobs, nact) = (nets.actor.layers[0].ins, nets.actor.outs());
        let logp = SharedSlice::new(logp);
        let val = SharedSlice::new(val);

        self.pool.run(2 * count, |task| {
            let mut lane = self.lanes[task].lock().expect("a learner lane");

            for (from, to) in (task % count..chunks)
                .step_by(count)
                .map(|c| (c * chunk, ((c + 1) * chunk).min(rows)))
            {
                let input = &obs[from * nobs..to * nobs];

                if task >= count {
                    let values = nets
                        .critic
                        .forward(&serial, nets.params, input, to - from, &mut lane.scratch);

                    unsafe { val.range(from, to) }.copy_from_slice(values);

                    continue;
                }

                let mean = nets
                    .actor
                    .forward(&serial, nets.params, input, to - from, &mut lane.scratch);
                let taken = &act[from * nact..to * nact];
                let out = unsafe { logp.range(from, to) };

                policy.fill(out, mean, taken);
            }
        });
    }
}

struct Policy {
    inverse_std: Vec<f32>,
    constant: f32,
}

impl Policy {
    fn fill(&self, out: &mut [f32], mean: &[f32], taken: &[f32]) {
        let nact = self.inverse_std.len();
        let rows = mean.chunks_exact(nact).zip(taken.chunks_exact(nact));

        for (value, (m, a)) in out.iter_mut().zip(rows) {
            *value = log_prob(m, a, &self.inverse_std, self.constant);
        }
    }
}

#[cfg(test)]
#[path = "blocks_tests.rs"]
mod tests;
