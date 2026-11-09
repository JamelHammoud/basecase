use super::buffers::{Buffers, Net};
use super::gemm::{dispatch, slices_for, used_slices, Finish, Gemm, Offsets, Ones, Operands, Shape, AT_ZERO};
use super::source::K;
use crate::mlp::Mlp;
use forge_sim::metal::gpu::{Arg, BufferId, Dispatch, Kernel};

pub struct Input {
    pub buffer: BufferId<f32>,
    pub at: usize,
}

pub struct Output {
    pub buffer: BufferId<f32>,
    pub at: usize,
}

pub struct Pass<'a> {
    pub kernels: &'a [Kernel],
    pub buffers: &'a Buffers,
    pub rows: usize,
}

fn layer_input(net: &Net, input: &Input, index: usize) -> (BufferId<f32>, usize) {
    if index == 0 {
        (input.buffer, input.at)
    } else {
        (net.hidden[index - 1], 0)
    }
}

impl<'a> Pass<'a> {
    pub fn forward(&self, mlp: &Mlp, net: &Net, input: &Input, output: &Output) -> Vec<Dispatch<'a>> {
        let last = mlp.layers.len() - 1;

        mlp.layers
            .iter()
            .enumerate()
            .map(|(i, layer)| {
                let (a, a_at) = layer_input(net, input, i);
                let (c, c_at) = if i == last {
                    (output.buffer, output.at)
                } else {
                    (net.hidden[i], 0)
                };
                let gemm = Gemm {
                    kernel: K::GemmNn,
                    shape: Shape {
                        m: self.rows,
                        n: layer.outs,
                        k: layer.ins + 1,
                        lda: layer.ins,
                        ldb: layer.outs,
                        ldc: layer.outs,
                    },
                    at: Offsets {
                        a: a_at,
                        b: layer.weights_at,
                        c: c_at,
                        ..AT_ZERO
                    },
                    ones: Ones::Column,
                    finish: if i == last { Finish::Store } else { Finish::Elu },
                    slices: 1,
                };
                let operands = Operands {
                    a: a.arg(),
                    b: self.buffers.params.arg(),
                    c: c.arg(),
                    h: c.arg(),
                };

                dispatch(self.kernels, &gemm, operands)
            })
            .collect()
    }

    fn weight_grads(&self, mlp: &Mlp, net: &Net, at: (usize, BufferId<f32>), masked: bool) -> [Dispatch<'a>; 2] {
        let (index, dz) = at;
        let source = if index == 0 {
            self.buffers.mb_obs
        } else {
            net.hidden[index - 1]
        };
        let layer = mlp.layers[index];
        let b = self.buffers;
        let slices = slices_for(self.rows);
        let gemm = Gemm {
            kernel: K::GemmTn,
            shape: Shape {
                m: layer.ins + 1,
                n: layer.outs,
                k: self.rows,
                lda: layer.ins,
                ldb: layer.outs,
                ldc: layer.outs,
            },
            at: AT_ZERO,
            ones: Ones::Row,
            finish: Finish::Store,
            slices,
        };
        let elems = (layer.ins + 1) * layer.outs;
        let words = vec![
            elems as u32,
            used_slices(self.rows, slices) as u32,
            layer.weights_at as u32,
            layer.outs as u32,
            u32::from(masked && index == 0),
        ];

        [
            dispatch(
                self.kernels,
                &gemm,
                Operands {
                    a: source.arg(),
                    b: dz.arg(),
                    c: b.partials.arg(),
                    h: b.partials.arg(),
                },
            ),
            Dispatch {
                kernel: &self.kernels[K::SplitSum as usize],
                args: vec![b.partials.arg(), b.grads.arg(), b.mask.arg(), Arg::Owned(words)],
                threads: elems,
                group: 256,
            },
        ]
    }

    fn input_grads(&self, mlp: &Mlp, net: &Net, index: usize, dz: (BufferId<f32>, BufferId<f32>)) -> Dispatch<'a> {
        let layer = mlp.layers[index];
        let (from, into) = dz;
        let gemm = Gemm {
            kernel: K::GemmNt,
            shape: Shape {
                m: self.rows,
                n: layer.ins,
                k: layer.outs,
                lda: layer.outs,
                ldb: layer.outs,
                ldc: layer.ins,
            },
            at: Offsets {
                b: layer.weights_at,
                ldh: layer.ins,
                ..AT_ZERO
            },
            ones: Ones::None,
            finish: Finish::Slope,
            slices: 1,
        };

        dispatch(
            self.kernels,
            &gemm,
            Operands {
                a: from.arg(),
                b: self.buffers.params.arg(),
                c: into.arg(),
                h: net.hidden[index - 1].arg(),
            },
        )
    }

    pub fn backward(&self, mlp: &Mlp, net: &Net, masked: bool) -> Vec<Dispatch<'a>> {
        let b = self.buffers;
        let mut out = Vec::new();
        let mut dz = net.seed;
        let mut spare = [b.ping, b.pong];

        for index in (0..mlp.layers.len()).rev() {
            out.extend(self.weight_grads(mlp, net, (index, dz), masked));

            if index > 0 {
                let into = spare[0];

                out.push(self.input_grads(mlp, net, index, (dz, into)));
                spare.swap(0, 1);
                dz = into;
            }
        }

        out
    }
}
