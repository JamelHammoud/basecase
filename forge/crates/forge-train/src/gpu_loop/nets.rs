use super::buffers::{Buffers, Net};
use super::gemm::{dispatch, slices_for, used_slices, Finish, Gemm, Offsets, Ones, Operands, Problem, Shape, AT_ZERO};
use super::source::K;
use crate::mlp::{Layer, Mlp};
use forge_sim::metal::gpu::{Arg, BufferId, Dispatch, Kernel};

#[derive(Clone, Copy)]
pub struct Input {
    pub buffer: BufferId<f32>,
    pub at: usize,
}

#[derive(Clone, Copy)]
pub struct Output {
    pub buffer: BufferId<f32>,
    pub at: usize,
}

pub struct Side<'n> {
    pub mlp: &'n Mlp,
    pub net: &'n Net,
    pub input: Input,
    pub output: Output,
}

pub struct Pass<'a> {
    pub kernels: &'a [Kernel],
    pub buffers: &'a Buffers,
    pub params: BufferId<f32>,
    pub rows: usize,
}

fn layer_input(side: &Side, index: usize) -> Input {
    if index == 0 {
        side.input
    } else {
        Input {
            buffer: side.net.hidden[index - 1],
            at: 0,
        }
    }
}

fn layer_output(side: &Side, index: usize) -> Output {
    if index + 1 == side.mlp.layers.len() {
        side.output
    } else {
        Output {
            buffer: side.net.hidden[index],
            at: 0,
        }
    }
}

impl<'a> Pass<'a> {
    fn forward_layer(&self, side: &Side, index: usize) -> Problem {
        let layer = side.mlp.layers[index];
        let (a, c) = (layer_input(side, index), layer_output(side, index));
        let last = index + 1 == side.mlp.layers.len();

        Problem {
            gemm: Gemm {
                shape: Shape {
                    m: self.rows,
                    n: layer.outs,
                    k: layer.ins + 1,
                    lda: layer.ins,
                    ldb: layer.outs,
                    ldc: layer.outs,
                },
                at: Offsets {
                    a: a.at,
                    b: layer.weights_at,
                    c: c.at,
                    ..AT_ZERO
                },
                ones: Ones::Column,
                finish: if last { Finish::Store } else { Finish::Elu },
                slices: 1,
            },
            operands: Operands {
                a: a.buffer.arg(),
                b: self.params.arg(),
                c: c.buffer.arg(),
                h: c.buffer.arg(),
            },
        }
    }

    pub fn forward(&self, sides: &[Side]) -> Vec<Dispatch<'a>> {
        (0..sides[0].mlp.layers.len())
            .map(|index| {
                let problems = sides.iter().map(|s| self.forward_layer(s, index)).collect();

                dispatch(self.kernels, K::GemmNn, problems)
            })
            .collect()
    }

    fn weight_problem(&self, side: &Side, index: usize, dz: BufferId<f32>, partial_at: usize) -> Problem {
        let layer = side.mlp.layers[index];
        let source = if index == 0 {
            self.buffers.mb_obs
        } else {
            side.net.hidden[index - 1]
        };

        Problem {
            gemm: Gemm {
                shape: Shape {
                    m: layer.ins + 1,
                    n: layer.outs,
                    k: self.rows,
                    lda: layer.ins,
                    ldb: layer.outs,
                    ldc: layer.outs,
                },
                at: Offsets {
                    c: partial_at,
                    ..AT_ZERO
                },
                ones: Ones::Row,
                finish: Finish::Store,
                slices: slices_for(self.rows),
            },
            operands: Operands {
                a: source.arg(),
                b: dz.arg(),
                c: self.buffers.partials.arg(),
                h: self.buffers.partials.arg(),
            },
        }
    }

    fn sum_words(&self, layer: &Layer, masked: bool, from: usize) -> [u32; 6] {
        let slices = slices_for(self.rows);

        [
            (layer.ins + 1) * layer.outs,
            used_slices(self.rows, slices),
            layer.weights_at,
            layer.outs,
            usize::from(masked),
            from,
        ]
        .map(|w| w as u32)
    }

    fn weight_grads(&self, sides: &[Side], index: usize, dz: &[BufferId<f32>], masked: bool) -> [Dispatch<'a>; 2] {
        let b = self.buffers;
        let half = b.partials.len() / 2;
        let problems = sides
            .iter()
            .enumerate()
            .map(|(s, side)| self.weight_problem(side, index, dz[s], s * half))
            .collect();
        let mut words = Vec::new();
        let mut elems = 0;

        for (s, side) in sides.iter().enumerate() {
            let layer = side.mlp.layers[index];

            words.extend(self.sum_words(&layer, masked && s == 0 && index == 0, s * half));
            elems += (layer.ins + 1) * layer.outs;
        }

        words.resize(12, 0);

        [
            dispatch(self.kernels, K::GemmTn, problems),
            Dispatch {
                kernel: &self.kernels[K::SplitSum as usize],
                args: vec![b.partials.arg(), b.grads.arg(), b.mask.arg(), Arg::Owned(words)],
                threads: elems,
                group: 256,
            },
        ]
    }

    fn input_problem(&self, side: &Side, index: usize, dz: (BufferId<f32>, BufferId<f32>)) -> Problem {
        let layer = side.mlp.layers[index];

        Problem {
            gemm: Gemm {
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
            },
            operands: Operands {
                a: dz.0.arg(),
                b: self.params.arg(),
                c: dz.1.arg(),
                h: side.net.hidden[index - 1].arg(),
            },
        }
    }

    pub fn backward(&self, sides: &[Side], masked: bool) -> Vec<Dispatch<'a>> {
        let b = self.buffers;
        let mut out = Vec::new();
        let mut dz: Vec<BufferId<f32>> = sides.iter().map(|s| s.net.seed).collect();
        let mut spare = [b.spares[0], b.spares[1]];

        for index in (0..sides[0].mlp.layers.len()).rev() {
            out.extend(self.weight_grads(sides, index, &dz, masked));

            if index == 0 {
                break;
            }

            let into = spare[0];
            let problems = sides
                .iter()
                .enumerate()
                .map(|(s, side)| self.input_problem(side, index, (dz[s], into[s])))
                .collect();

            out.push(dispatch(self.kernels, K::GemmNt, problems));
            spare.swap(0, 1);
            dz = into[..sides.len()].to_vec();
        }

        out
    }
}
