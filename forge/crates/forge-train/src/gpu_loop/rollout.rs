use super::buffers::{Buffers, Dims};
use super::nets::{Input, Output, Pass};
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

    pub fn pass(&self, rows: usize) -> Pass<'a> {
        Pass {
            kernels: self.kernels,
            buffers: self.buffers,
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

    fn sample(&self, row: usize) -> Dispatch<'a> {
        let b = self.buffers;
        let words = vec![self.dims.envs as u32, row as u32];
        let args = vec![
            b.actor.out.arg(),
            b.params.arg(),
            b.act.arg(),
            b.rows.arg(),
            b.noise.arg(),
            Arg::Owned(words),
        ];

        self.kernel(K::Sample, args, (self.dims.envs, 64))
    }

    fn outputs(&self) -> Outputs {
        let b = self.buffers;

        Outputs {
            rew: b.rew,
            done: b.done,
            timeout: b.timeout,
            fell: b.fell,
        }
    }

    fn step(&self, t: usize, out: &mut Vec<Dispatch<'a>>) {
        let (b, w, n) = (self.buffers, self.worlds, self.dims.envs);
        let row = t * n;
        let obs = Input {
            buffer: b.obs,
            at: row * self.dims.nobs,
        };
        let pass = self.pass(n);

        out.push(self.normalize(b.obs, row * self.dims.nobs));
        out.extend(pass.forward(
            self.nets[0],
            &b.actor,
            &obs,
            &Output {
                buffer: b.actor.out,
                at: 0,
            },
        ));
        out.push(self.sample(row));
        out.extend(pass.forward(self.nets[1], &b.critic, &obs, &Output { buffer: b.val, at: row }));
        out.push(w.act(b.act, row));
        out.push(w.physics());
        out.push(w.after(&self.outputs(), row));
        out.push(w.observe());
        out.push(self.norm_update());
    }

    pub fn rollout(&self) -> Vec<Dispatch<'a>> {
        let b = self.buffers;
        let mut out = Vec::new();

        for t in 0..self.dims.horizon {
            self.step(t, &mut out);
        }

        let last = Input {
            buffer: b.final_obs,
            at: 0,
        };

        out.push(self.normalize(b.final_obs, 0));
        out.extend(self.pass(self.dims.envs).forward(
            self.nets[1],
            &b.critic,
            &last,
            &Output {
                buffer: b.final_val,
                at: 0,
            },
        ));
        out
    }

    pub fn start(&self) -> Vec<Dispatch<'a>> {
        vec![self.worlds.reset_all(), self.worlds.observe(), self.norm_update()]
    }
}
