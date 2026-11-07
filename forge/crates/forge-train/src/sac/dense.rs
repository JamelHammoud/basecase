use crate::kernels::{Math, Shape};
use crate::orthogonal::orthogonal_by_input;
use crate::rng::Rng;
use crate::sac::rows::{add_bias, column_sums, normalize_rows, unnormalize_rows, RowNorm};

const HEAD_GAIN: f64 = 0.01;

#[derive(Clone, Copy, Debug)]
pub struct Block {
    pub ins: usize,
    pub outs: usize,
    pub weights_at: usize,
    pub bias_at: usize,
    pub gain_at: usize,
    pub shift_at: usize,
}

#[derive(Clone, Debug)]
pub struct Dense {
    pub blocks: Vec<Block>,
    pub norm: RowNorm,
    pub size: usize,
}

pub struct Cache {
    capacity: usize,
    normalized: Vec<Vec<f32>>,
    inverse: Vec<Vec<f32>>,
    outputs: Vec<Vec<f32>>,
    gradients: Vec<Vec<f32>>,
    transposed: Vec<Vec<f32>>,
    pub input_gradient: Vec<f32>,
}

impl Dense {
    pub fn plan(sizes: &[usize], norm: RowNorm) -> Self {
        let mut at = 0;
        let last = sizes.len() - 2;
        let blocks = sizes
            .windows(2)
            .enumerate()
            .map(|(index, pair)| {
                let (ins, outs) = (pair[0], pair[1]);
                let weights_at = at;
                let bias_at = weights_at + ins * outs;
                let gain_at = bias_at + outs;
                let normed = if index < last { outs } else { 0 };
                let shift_at = gain_at + normed;

                at = shift_at + normed;

                Block {
                    ins,
                    outs,
                    weights_at,
                    bias_at,
                    gain_at,
                    shift_at,
                }
            })
            .collect();

        Self { blocks, norm, size: at }
    }

    pub fn outs(&self) -> usize {
        self.blocks.last().expect("a network has blocks").outs
    }

    pub fn initialize(&self, rng: &mut Rng) -> Vec<f32> {
        let mut params = vec![0.0f32; self.size];
        let last = self.blocks.len() - 1;

        for (index, block) in self.blocks.iter().enumerate() {
            let gain = if index == last {
                HEAD_GAIN
            } else {
                std::f64::consts::SQRT_2
            };
            let weights = orthogonal_by_input(block.ins, block.outs, gain, rng);

            params[block.weights_at..block.bias_at].copy_from_slice(&weights);
            params[block.gain_at..block.shift_at].fill(1.0);
        }

        params
    }

    pub fn cache(&self, capacity: usize) -> Cache {
        let widths = |b: &Block| vec![0.0f32; capacity * b.outs];

        Cache {
            capacity,
            normalized: self.blocks.iter().map(widths).collect(),
            inverse: self.blocks.iter().map(|_| vec![0.0f32; capacity]).collect(),
            outputs: self.blocks.iter().map(widths).collect(),
            gradients: self.blocks.iter().map(widths).collect(),
            transposed: self.blocks.iter().map(|b| vec![0.0f32; b.ins * b.outs]).collect(),
            input_gradient: vec![0.0f32; capacity * self.blocks[0].ins],
        }
    }

    pub fn forward<'a>(&self, math: &Math, params: &[f32], input: &[f32], cache: &'a mut Cache) -> &'a [f32] {
        let rows = input.len() / self.blocks[0].ins;
        let last = self.blocks.len() - 1;

        assert!(rows <= cache.capacity, "The batch is larger than this cache");

        for (index, block) in self.blocks.iter().enumerate() {
            let (done, rest) = cache.outputs.split_at_mut(index);
            let out = &mut rest[0][..rows * block.outs];
            let source = if index == 0 {
                input
            } else {
                &done[index - 1][..rows * block.ins]
            };
            let shape = Shape {
                rows,
                inner: block.ins,
                cols: block.outs,
            };

            math.multiply(out, source, &params[block.weights_at..block.bias_at], shape);
            add_bias(out, &params[block.bias_at..block.gain_at]);

            if index < last {
                let rows_norm = crate::sac::rows::NormSets {
                    values: out,
                    normalized: &mut cache.normalized[index][..rows * block.outs],
                    inverse: &mut cache.inverse[index][..rows],
                    gain: &params[block.gain_at..block.shift_at],
                    shift: &params[block.shift_at..block.shift_at + block.outs],
                };

                normalize_rows(self.norm, rows_norm);
            }
        }

        &cache.outputs[last][..rows * self.outs()]
    }

    pub fn seed<'a>(&self, rows: usize, cache: &'a mut Cache) -> &'a mut [f32] {
        let last = self.blocks.len() - 1;

        &mut cache.gradients[last][..rows * self.outs()]
    }

    pub fn output<'a>(&self, rows: usize, cache: &'a Cache) -> &'a [f32] {
        &cache.outputs[self.blocks.len() - 1][..rows * self.outs()]
    }

    pub fn backward(&self, math: &Math, pass: Backward, cache: &mut Cache) {
        let Backward {
            params,
            mut grads,
            input,
            input_gradient,
        } = pass;
        let rows = input.len() / self.blocks[0].ins;

        for index in (0..self.blocks.len()).rev() {
            let block = self.blocks[index];
            let shape = Shape {
                rows,
                inner: block.ins,
                cols: block.outs,
            };
            let source = if index == 0 {
                input
            } else {
                &cache.outputs[index - 1][..rows * block.ins]
            };
            let (lower, upper) = cache.gradients.split_at_mut(index);
            let gradient = &upper[0][..rows * block.outs];

            if let Some(grads) = grads.as_deref_mut() {
                math.transpose_multiply(&mut grads[block.weights_at..block.bias_at], source, gradient, shape);
                column_sums(gradient, &mut grads[block.bias_at..block.gain_at]);
            }

            if index == 0 && !input_gradient {
                continue;
            }

            let below = if index == 0 {
                &mut cache.input_gradient[..rows * block.ins]
            } else {
                &mut lower[index - 1][..rows * block.ins]
            };
            let weights = &params[block.weights_at..block.bias_at];

            math.multiply_by_transpose(below, gradient, weights, shape, &mut cache.transposed[index]);

            if index == 0 {
                continue;
            }

            let previous = self.blocks[index - 1];
            let (gain_grads, shift_grads) = match grads.as_deref_mut() {
                Some(g) => {
                    let (gain, shift) =
                        g[previous.gain_at..previous.shift_at + previous.outs].split_at_mut(previous.outs);

                    (Some(gain), Some(shift))
                }
                None => (None, None),
            };

            unnormalize_rows(
                self.norm,
                crate::sac::rows::UnnormSets {
                    gradient: below,
                    output: &cache.outputs[index - 1][..rows * previous.outs],
                    normalized: &cache.normalized[index - 1][..rows * previous.outs],
                    inverse: &cache.inverse[index - 1][..rows],
                    gain: &params[previous.gain_at..previous.shift_at],
                    gain_grads,
                    shift_grads,
                },
            );
        }
    }

    pub fn project_weights(&self, params: &mut [f32]) {
        let last = self.blocks.len() - 1;

        for block in &self.blocks[..last] {
            let weights = &mut params[block.weights_at..block.bias_at];

            for o in 0..block.outs {
                let norm = (0..block.ins)
                    .map(|i| weights[i * block.outs + o] * weights[i * block.outs + o])
                    .sum::<f32>()
                    .sqrt()
                    .max(1e-12);

                (0..block.ins).for_each(|i| weights[i * block.outs + o] /= norm);
            }
        }
    }
}

pub struct Backward<'a> {
    pub params: &'a [f32],
    pub grads: Option<&'a mut [f32]>,
    pub input: &'a [f32],
    pub input_gradient: bool,
}

#[cfg(test)]
#[path = "dense_tests.rs"]
mod tests;
