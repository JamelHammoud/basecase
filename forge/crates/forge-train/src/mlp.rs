use crate::elu;
use crate::kernels::{Math, Shape};
use crate::orthogonal::orthogonal_by_input;
use crate::rng::Rng;

#[derive(Clone, Copy, Debug)]
pub struct Layer {
    pub ins: usize,
    pub outs: usize,
    pub weights_at: usize,
    pub bias_at: usize,
}

#[derive(Clone, Debug)]
pub struct Mlp {
    pub layers: Vec<Layer>,
    pub first_param: usize,
    pub masked: Vec<usize>,
}

pub struct Scratch {
    capacity: usize,
    input: Vec<f32>,
    activations: Vec<Vec<f32>>,
    slopes: Vec<Vec<f32>>,
    gradients: Vec<Vec<f32>>,
    transposed: Vec<Vec<f32>>,
}

impl Mlp {
    pub fn plan(sizes: &[usize], first_param: usize) -> Self {
        let mut at = first_param;
        let mut layers = Vec::with_capacity(sizes.len() - 1);

        for pair in sizes.windows(2) {
            let (ins, outs) = (pair[0], pair[1]);
            let weights_at = at;
            let bias_at = weights_at + ins * outs;

            at = bias_at + outs;
            layers.push(Layer {
                ins,
                outs,
                weights_at,
                bias_at,
            });
        }

        Self {
            layers,
            first_param,
            masked: Vec::new(),
        }
    }

    pub fn mask_inputs(&mut self, inputs: &[usize]) {
        let ins = self.layers[0].ins;

        self.masked = inputs.iter().copied().filter(|&i| i < ins).collect();
        self.masked.sort_unstable();
        self.masked.dedup();
    }

    pub fn zero_masked(&self, params: &mut [f32]) {
        let first = self.layers[0];

        for &input in &self.masked {
            let at = first.weights_at + input * first.outs;

            params[at..at + first.outs].fill(0.0);
        }
    }

    fn masked_input<'a>(&self, input: &'a [f32], rows: usize, buffer: &'a mut [f32]) -> &'a [f32] {
        if self.masked.is_empty() {
            return input;
        }

        let ins = self.layers[0].ins;
        let copy = &mut buffer[..rows * ins];

        copy.copy_from_slice(&input[..rows * ins]);

        for row in copy.chunks_exact_mut(ins) {
            self.masked.iter().for_each(|&i| row[i] = 0.0);
        }

        copy
    }

    pub fn param_end(&self) -> usize {
        let last = self.layers.last().expect("an MLP has layers");

        last.bias_at + last.outs
    }

    pub fn initialize(&self, params: &mut [f32], out_gain: f64, rng: &mut Rng) {
        let last = self.layers.len() - 1;

        for (index, layer) in self.layers.iter().enumerate() {
            let gain = if index == last {
                out_gain
            } else {
                std::f64::consts::SQRT_2
            };
            let weights = orthogonal_by_input(layer.ins, layer.outs, gain, rng);

            params[layer.weights_at..layer.bias_at].copy_from_slice(&weights);
            params[layer.bias_at..layer.bias_at + layer.outs].fill(0.0);
        }
    }

    pub fn outs(&self) -> usize {
        self.layers.last().expect("an MLP has layers").outs
    }

    pub fn sizes(&self) -> Vec<usize> {
        let mut sizes = vec![self.layers[0].ins];

        sizes.extend(self.layers.iter().map(|l| l.outs));

        sizes
    }

    pub fn scratch(&self, capacity: usize) -> Scratch {
        let per_layer = |size: fn(&Layer) -> usize| -> Vec<Vec<f32>> {
            self.layers
                .iter()
                .map(|layer| vec![0.0f32; capacity * size(layer)])
                .collect()
        };

        Scratch {
            capacity,
            input: vec![0.0f32; capacity * self.layers[0].ins],
            activations: per_layer(|l| l.outs),
            slopes: per_layer(|l| l.outs),
            gradients: per_layer(|l| l.outs),
            transposed: self.layers.iter().map(|l| vec![0.0f32; l.ins * l.outs]).collect(),
        }
    }

    pub fn forward<'a>(
        &self,
        math: &Math,
        params: &[f32],
        input: &[f32],
        rows: usize,
        scratch: &'a mut Scratch,
    ) -> &'a [f32] {
        assert!(rows <= scratch.capacity, "The batch is larger than this scratch space");

        let last = self.layers.len() - 1;
        let input = self.masked_input(input, rows, &mut scratch.input);

        for (index, layer) in self.layers.iter().enumerate() {
            let (done, rest) = scratch.activations.split_at_mut(index);
            let out = &mut rest[0][..rows * layer.outs];
            let source = if index == 0 {
                input
            } else {
                &done[index - 1][..rows * layer.ins]
            };
            let weights = &params[layer.weights_at..layer.bias_at];
            let bias = &params[layer.bias_at..layer.bias_at + layer.outs];
            let shape = Shape {
                rows,
                inner: layer.ins,
                cols: layer.outs,
            };

            math.multiply(out, source, weights, shape);

            if index < last {
                math.bias_elu(out, bias, &mut scratch.slopes[index][..rows * layer.outs]);
            } else {
                out.chunks_exact_mut(layer.outs)
                    .for_each(|row| row.iter_mut().zip(bias).for_each(|(o, b)| *o += b));
            }
        }

        &scratch.activations[last][..rows * self.outs()]
    }

    pub fn seed_gradient<'a>(&self, rows: usize, scratch: &'a mut Scratch) -> &'a mut [f32] {
        self.output_and_seed(rows, scratch).1
    }

    pub fn output_and_seed<'a>(&self, rows: usize, scratch: &'a mut Scratch) -> (&'a [f32], &'a mut [f32]) {
        let outs = self.outs();
        let last = self.layers.len() - 1;

        (
            &scratch.activations[last][..rows * outs],
            &mut scratch.gradients[last][..rows * outs],
        )
    }

    pub fn output<'a>(&self, rows: usize, scratch: &'a Scratch) -> &'a [f32] {
        let last = self.layers.len() - 1;

        &scratch.activations[last][..rows * self.outs()]
    }

    pub fn backward(&self, math: &Math, sets: BackwardSets, rows: usize, scratch: &mut Scratch) {
        let BackwardSets { params, grads, input } = sets;

        for index in (0..self.layers.len()).rev() {
            let layer = self.layers[index];
            let shape = Shape {
                rows,
                inner: layer.ins,
                cols: layer.outs,
            };
            let source = match index {
                0 if self.masked.is_empty() => input,
                0 => &scratch.input[..rows * layer.ins],
                _ => &scratch.activations[index - 1][..rows * layer.ins],
            };
            let (lower, upper) = scratch.gradients.split_at_mut(index);
            let gradient = &upper[0][..rows * layer.outs];
            let block = &mut grads[layer.weights_at - self.first_param..layer.bias_at + layer.outs - self.first_param];
            let (weight_grads, bias_grads) = block.split_at_mut(layer.ins * layer.outs);

            math.transpose_multiply(weight_grads, source, gradient, shape);
            bias_grads.fill(0.0);

            for row in gradient.chunks_exact(layer.outs) {
                bias_grads.iter_mut().zip(row).for_each(|(b, g)| *b += g);
            }

            if index > 0 {
                let previous = &mut lower[index - 1][..rows * layer.ins];
                let weights = &params[layer.weights_at..layer.bias_at];

                math.multiply_by_transpose(previous, gradient, weights, shape, &mut scratch.transposed[index]);
                previous
                    .iter_mut()
                    .zip(&scratch.slopes[index - 1][..rows * layer.ins])
                    .for_each(|(g, s)| *g *= s);
            }
        }
    }

    pub fn weights_by_output(&self, params: &[f32], layer: &Layer) -> Vec<f32> {
        let mut out = vec![0.0f32; layer.ins * layer.outs];
        let weights = &params[layer.weights_at..layer.bias_at];

        for i in 0..layer.ins {
            for o in 0..layer.outs {
                out[o * layer.ins + i] = weights[i * layer.outs + o];
            }
        }

        out
    }

    pub fn forward_exact(&self, params: &[f32], input: &[f32]) -> Vec<f32> {
        let last = self.layers.len() - 1;
        let mut x = input.to_vec();

        self.masked.iter().for_each(|&i| x[i] = 0.0);

        for (index, layer) in self.layers.iter().enumerate() {
            let weights = &params[layer.weights_at..layer.bias_at];
            let bias = &params[layer.bias_at..layer.bias_at + layer.outs];
            let mut y = bias.to_vec();

            for (i, value) in x.iter().enumerate() {
                let column = &weights[i * layer.outs..(i + 1) * layer.outs];

                y.iter_mut().zip(column).for_each(|(o, w)| *o += value * w);
            }

            if index < last {
                y.iter_mut().for_each(|o| *o = elu::exact(*o));
            }

            x = y;
        }

        x
    }
}

pub struct BackwardSets<'a> {
    pub params: &'a [f32],
    pub grads: &'a mut [f32],
    pub input: &'a [f32],
}

#[cfg(test)]
mod tests {
    use super::{BackwardSets, Mlp};
    use crate::kernels::Math;
    use crate::rng::Rng;

    fn half_squared_output(net: &Mlp, params: &[f32], input: &[f32], rows: usize) -> f64 {
        let nobs = input.len() / rows;

        input
            .chunks_exact(nobs)
            .map(|x| {
                net.forward_exact(params, x)
                    .iter()
                    .map(|y| 0.5 * (*y as f64) * (*y as f64))
                    .sum::<f64>()
            })
            .sum()
    }

    #[test]
    fn backward_matches_finite_differences() {
        let (nobs, rows) = (6, 5);
        let net = Mlp::plan(&[nobs, 16, 8, 3], 0);
        let mut params = vec![0.0f32; net.param_end()];
        let mut rng = Rng::new(9, 0);

        net.initialize(&mut params, 1.0, &mut rng);

        let input: Vec<f32> = (0..rows * nobs).map(|_| rng.normal() as f32).collect();
        let math = Math::native(2);
        let mut scratch = net.scratch(rows);
        let output = net.forward(&math, &params, &input, rows, &mut scratch).to_vec();

        net.seed_gradient(rows, &mut scratch).copy_from_slice(&output);

        let mut grads = vec![0.0f32; params.len()];

        net.backward(
            &math,
            BackwardSets {
                params: &params,
                grads: &mut grads,
                input: &input,
            },
            rows,
            &mut scratch,
        );

        for index in (0..params.len()).step_by(9) {
            let eps = 1e-2f32;
            let mut plus = params.clone();
            let mut minus = params.clone();

            plus[index] += eps;
            minus[index] -= eps;

            let numeric = (half_squared_output(&net, &plus, &input, rows)
                - half_squared_output(&net, &minus, &input, rows))
                / (2.0 * eps as f64);

            assert!(
                (numeric - grads[index] as f64).abs() < 5e-3 + 0.02 * numeric.abs(),
                "param {index}: {numeric} against {}",
                grads[index]
            );
        }
    }

    #[test]
    fn batched_forward_matches_the_exact_policy() {
        let net = Mlp::plan(&[10, 32, 16, 4], 0);
        let mut params = vec![0.0f32; net.param_end()];
        let mut rng = Rng::new(11, 0);

        net.initialize(&mut params, 0.01, &mut rng);

        let input: Vec<f32> = (0..40).map(|_| rng.normal() as f32).collect();
        let math = Math::native(1);
        let mut scratch = net.scratch(4);
        let batched = net.forward(&math, &params, &input, 4, &mut scratch).to_vec();

        for (row, x) in input.as_chunks::<10>().0.iter().enumerate() {
            let exact = net.forward_exact(&params, x);

            for (a, b) in exact.iter().zip(&batched[row * 4..(row + 1) * 4]) {
                assert!((a - b).abs() < 2e-5);
            }
        }
    }
}
