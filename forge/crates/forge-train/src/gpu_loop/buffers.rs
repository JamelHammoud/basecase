use super::gemm::slices_for;
use super::source::CTRL_LEN;
use crate::mlp::Mlp;
use forge_sim::metal::gpu::{BufferId, Gpu};

const WIDEST: usize = 256;
const NORM_CHUNK: usize = 4096;

pub struct Dims {
    pub envs: usize,
    pub horizon: usize,
    pub minibatch: usize,
    pub epochs: usize,
    pub nobs: usize,
    pub nact: usize,
    pub nparams: usize,
}

impl Dims {
    pub fn total(&self) -> usize {
        self.envs * self.horizon
    }

    pub fn capacity(&self) -> usize {
        self.envs.max(self.minibatch)
    }
}

pub struct Net {
    pub hidden: Vec<BufferId<f32>>,
    pub out: BufferId<f32>,
    pub seed: BufferId<f32>,
}

pub struct Buffers {
    pub params: BufferId<f32>,
    pub grads: BufferId<f32>,
    pub first: BufferId<f32>,
    pub second: BufferId<f32>,
    pub ctrl: BufferId<f32>,
    pub stats: BufferId<f32>,
    pub mask: BufferId<f32>,
    pub obs: BufferId<f32>,
    pub act: BufferId<f32>,
    pub val: BufferId<f32>,
    pub rows: BufferId<f32>,
    pub rew: BufferId<f32>,
    pub done: BufferId<f32>,
    pub timeout: BufferId<f32>,
    pub fell: BufferId<f32>,
    pub final_obs: BufferId<f32>,
    pub final_val: BufferId<f32>,
    pub mb_obs: BufferId<f32>,
    pub mb_act: BufferId<f32>,
    pub mb_rows: BufferId<f32>,
    pub actor: Net,
    pub critic: Net,
    pub ping: BufferId<f32>,
    pub pong: BufferId<f32>,
    pub parts: BufferId<f32>,
    pub partials: BufferId<f32>,
    pub squares: BufferId<f32>,
    pub perm: BufferId<u32>,
    pub noise: BufferId<u32>,
}

fn net(gpu: &mut Gpu, mlp: &Mlp, capacity: usize) -> Result<Net, String> {
    let layers = &mlp.layers;
    let hidden = layers[..layers.len() - 1]
        .iter()
        .map(|l| gpu.alloc::<f32>(capacity * l.outs))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Net {
        hidden,
        out: gpu.alloc::<f32>(capacity * mlp.outs())?,
        seed: gpu.alloc::<f32>(capacity * mlp.outs())?,
    })
}

fn largest_layer(nets: [&Mlp; 2]) -> usize {
    nets.iter()
        .flat_map(|n| n.layers.iter())
        .map(|l| (l.ins + 1) * l.outs)
        .max()
        .unwrap_or(1)
}

impl Buffers {
    pub fn new(gpu: &mut Gpu, dims: &Dims, nets: [&Mlp; 2]) -> Result<Self, String> {
        let (total, cap, nobs, nact, p) = (dims.total(), dims.capacity(), dims.nobs, dims.nact, dims.nparams);
        let mut f = |len: usize| gpu.alloc::<f32>(len);

        Ok(Self {
            params: f(p)?,
            grads: f(p)?,
            first: f(p)?,
            second: f(p)?,
            ctrl: f(CTRL_LEN)?,
            stats: f(3 * nobs)?,
            mask: f(nobs)?,
            obs: f(total * nobs)?,
            act: f(total * nact)?,
            val: f(total)?,
            rows: f(3 * total)?,
            rew: f(total)?,
            done: f(total)?,
            timeout: f(total)?,
            fell: f(total)?,
            final_obs: f(dims.envs * nobs)?,
            final_val: f(dims.envs)?,
            mb_obs: f(cap * nobs)?,
            mb_act: f(cap * nact)?,
            mb_rows: f(3 * cap)?,
            ping: f(cap * WIDEST)?,
            pong: f(cap * WIDEST)?,
            parts: f(cap * (nact + 1))?,
            partials: f(slices_for(dims.minibatch) * largest_layer(nets))?,
            squares: f(p.div_ceil(NORM_CHUNK))?,
            actor: net(gpu, nets[0], cap)?,
            critic: net(gpu, nets[1], cap)?,
            perm: gpu.alloc::<u32>(dims.epochs * total)?,
            noise: gpu.alloc::<u32>(4 * dims.envs)?,
        })
    }
}

pub const SQUARE_CHUNK: usize = NORM_CHUNK;
