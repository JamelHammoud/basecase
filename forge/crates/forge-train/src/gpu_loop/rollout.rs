use super::buffers::{Buffers, Dims, Nets, Rollout};
use super::nets::{Input, Output, Pass, Side};
use super::source::K;
use crate::mlp::Mlp;
use forge_sim::metal::gpu::{Arg, BufferId, Dispatch, Kernel};
use forge_sim::metal::{Outputs, Worlds};

const REDUCE: usize = 256;

pub struct Encoder<'a> {
    pub kernels: &'a [Kernel],
    pub buffers: &'a Buffers,
    pub worlds: &'a Worlds,
    pub nets: [&'a Mlp; 2],
    pub dims: &'a Dims,
}

impl<'a> Encoder<'a> {
    pub fn kernel(&self, k: K, args: Vec<Arg<'static>>, threads: (usize, usize)) -> Dispatch<'a> {
        Dispatch {
            kernel: &self.kernels[k as usize],
            args,
            threads: threads.0,
            group: threads.1,
        }
    }

    pub fn pass(&self, nets: &Nets, rows: usize) -> Pass<'a> {
        Pass {
            kernels: self.kernels,
            buffers: self.buffers,
            params: nets.params,
            rows,
        }
    }

    fn normalize(&self, into: BufferId<f32>, at: usize) -> Dispatch<'a> {
        let b = self.buffers;
        let count = self.dims.envs * self.dims.nobs;
        let words = vec![count as u32, at as u32];

        self.kernel(
            K::Normalize,
            vec![self.worlds.obs().arg(), b.stats.arg(), into.arg(), Arg::Owned(words)],
            (count, 256),
        )
    }

    pub fn norm_update(&self) -> Dispatch<'a> {
        let words = vec![self.dims.envs as u32];
        let args = vec![self.worlds.obs().arg(), self.buffers.stats.arg(), Arg::Owned(words)];

        self.kernel(K::NormUpdate, args, (self.dims.nobs * REDUCE, REDUCE))
    }

    fn sample(&self, r: &Rollout, row: usize) -> Dispatch<'a> {
        let c = &self.buffers.collector;
        let words = vec![self.dims.envs as u32, row as u32];
        let args = vec![
            c.actor.out.arg(),
            c.params.arg(),
            r.act.arg(),
            r.rows.arg(),
            self.buffers.noise.arg(),
            Arg::Owned(words),
        ];

        self.kernel(K::Sample, args, (self.dims.envs, 64))
    }

    fn step(&self, r: &Rollout, t: usize, out: &mut Vec<Dispatch<'a>>) {
        let (c, w, n) = (&self.buffers.collector, self.worlds, self.dims.envs);
        let row = t * n;
        let obs = Input {
            buffer: r.obs,
            at: row * self.dims.nobs,
        };
        let pass = self.pass(c, n);
        let outputs = Outputs {
            rew: r.rew,
            done: r.done,
            timeout: r.timeout,
            fell: r.fell,
        };
        let mean = Output {
            buffer: c.actor.out,
            at: 0,
        };

        let sides = [
            Side {
                mlp: self.nets[0],
                net: &c.actor,
                input: obs,
                output: mean,
            },
            Side {
                mlp: self.nets[1],
                net: &c.critic,
                input: obs,
                output: Output { buffer: r.val, at: row },
            },
        ];

        out.push(self.normalize(r.obs, row * self.dims.nobs));
        out.extend(pass.forward(&sides));
        out.push(self.sample(r, row));
        out.push(w.act(r.act, row));
        out.push(w.physics());
        out.push(w.after(&outputs, row));
        out.push(w.observe());
        out.push(self.norm_update());
    }

    pub fn rollout(&self, r: &Rollout) -> Vec<Dispatch<'a>> {
        let c = &self.buffers.collector;
        let mut out = Vec::new();

        for t in 0..self.dims.horizon {
            self.step(r, t, &mut out);
        }

        let last = Input {
            buffer: r.final_obs,
            at: 0,
        };
        let value = Output {
            buffer: r.final_val,
            at: 0,
        };

        out.push(self.normalize(r.final_obs, 0));
        let side = Side {
            mlp: self.nets[1],
            net: &c.critic,
            input: last,
            output: value,
        };

        out.extend(self.pass(c, self.dims.envs).forward(&[side]));
        out
    }

    pub fn start(&self) -> Vec<Dispatch<'a>> {
        vec![self.worlds.reset_all(), self.worlds.observe(), self.norm_update()]
    }
}
