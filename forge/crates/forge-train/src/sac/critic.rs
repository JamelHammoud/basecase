use crate::adam::{clip_gradient, Adam};
use crate::kernels::Math;
use crate::rng::Rng;
use crate::sac::dense::{Backward, Cache, Dense};
use crate::sac::recipe::Recipe;
use crate::sac::rows::RowNorm;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mix {
    Average,
    Lower,
}

#[derive(Clone, Copy, Debug)]
pub struct Support {
    pub low: f32,
    pub high: f32,
    pub atoms: usize,
}

impl Support {
    pub fn step(&self) -> f32 {
        (self.high - self.low) / (self.atoms - 1) as f32
    }

    pub fn atom(&self, index: usize) -> f32 {
        self.low + self.step() * index as f32
    }

    pub fn expected(&self, probs: &[f32]) -> f32 {
        probs.iter().enumerate().map(|(i, p)| p * self.atom(i)).sum()
    }
}

pub struct Twin {
    pub net: Dense,
    pub support: Support,
    pub params: [Vec<f32>; 2],
    pub targets: [Vec<f32>; 2],
    grads: [Vec<f32>; 2],
    adam: [Adam; 2],
    caches: [Cache; 2],
    probs: [Vec<f32>; 2],
    values: [Vec<f32>; 2],
    pub mixed: Vec<f32>,
    pub action_gradient: Vec<f32>,
    project: bool,
    grad_clip: f64,
}

fn softmax_rows(logits: &[f32], probs: &mut [f32], atoms: usize) {
    for (row, out) in logits.chunks_exact(atoms).zip(probs.chunks_exact_mut(atoms)) {
        let top = row.iter().fold(f32::NEG_INFINITY, |a, b| a.max(*b));
        let mut total = 0.0f32;

        for (o, l) in out.iter_mut().zip(row) {
            *o = (l - top).exp();
            total += *o;
        }

        out.iter_mut().for_each(|o| *o /= total);
    }
}

impl Twin {
    pub fn new(inputs: usize, recipe: &Recipe, capacity: usize, rng: &mut Rng) -> Self {
        let support = recipe.support;
        let mut sizes = vec![inputs];

        sizes.extend_from_slice(&recipe.critic_hidden);
        sizes.push(support.atoms);

        let norm = if recipe.project_weights {
            RowNorm::Rms
        } else {
            RowNorm::Layer
        };
        let net = Dense::plan(&sizes, norm);
        let params = [net.initialize(rng), net.initialize(rng)];
        let adam = || Adam::with(net.size, recipe.beta2, recipe.weight_decay);
        let rows = || vec![0.0f32; capacity * support.atoms];

        Self {
            support,
            targets: params.clone(),
            grads: [vec![0.0; net.size], vec![0.0; net.size]],
            adam: [adam(), adam()],
            caches: [net.cache(capacity), net.cache(capacity)],
            probs: [rows(), rows()],
            values: [vec![0.0; capacity], vec![0.0; capacity]],
            mixed: rows(),
            action_gradient: vec![0.0; capacity * inputs],
            project: recipe.project_weights,
            grad_clip: recipe.grad_clip,
            params,
            net,
        }
    }

    fn evaluate(&mut self, math: &Math, input: &[f32], use_targets: bool) -> usize {
        let atoms = self.support.atoms;
        let rows = input.len() / self.net.blocks[0].ins;

        for k in 0..2 {
            let params = if use_targets { &self.targets[k] } else { &self.params[k] };
            let logits = self.net.forward(math, params, input, &mut self.caches[k]);
            let probs = &mut self.probs[k][..rows * atoms];

            softmax_rows(logits, probs, atoms);

            for (value, row) in self.values[k][..rows].iter_mut().zip(probs.chunks_exact(atoms)) {
                *value = self.support.expected(row);
            }
        }

        rows
    }

    fn lower_twin(&self, row: usize) -> usize {
        usize::from(self.values[1][row] < self.values[0][row])
    }

    pub fn next_distribution(&mut self, math: &Math, input: &[f32], mix: Mix) -> &[f32] {
        let atoms = self.support.atoms;
        let rows = self.evaluate(math, input, true);

        for row in 0..rows {
            let span = row * atoms..(row + 1) * atoms;
            let lower = self.lower_twin(row);
            let out = &mut self.mixed[span.clone()];

            match mix {
                Mix::Average => {
                    let (a, b) = (&self.probs[0][span.clone()], &self.probs[1][span]);

                    out.iter_mut()
                        .zip(a.iter().zip(b))
                        .for_each(|(o, (x, y))| *o = 0.5 * (x + y));
                }
                Mix::Lower => out.copy_from_slice(&self.probs[lower][span]),
            }
        }

        &self.mixed[..rows * atoms]
    }

    pub fn train(&mut self, math: &Math, input: &[f32], target: &[f32], rate: f32) -> f32 {
        let atoms = self.support.atoms;
        let rows = self.evaluate(math, input, false);
        let scale = 1.0 / rows as f32;
        let mut loss = 0.0f32;

        for k in 0..2 {
            let probs = &self.probs[k][..rows * atoms];
            let seed = self.net.seed(rows, &mut self.caches[k]);

            for ((s, p), m) in seed.iter_mut().zip(probs).zip(target) {
                *s = (p - m) * scale;
                loss -= m * p.max(1e-12).ln() * scale;
            }

            let pass = Backward {
                params: &self.params[k],
                grads: Some(&mut self.grads[k]),
                input,
                input_gradient: false,
            };

            self.net.backward(math, pass, &mut self.caches[k]);

            if self.grad_clip > 0.0 {
                clip_gradient(&mut self.grads[k], self.grad_clip);
            }

            self.adam[k].step(&mut self.params[k], &self.grads[k], rate);

            if self.project {
                self.net.project_weights(&mut self.params[k]);
            }
        }

        loss * 0.5
    }

    pub fn value_gradient(&mut self, math: &Math, input: &[f32], mix: Mix) -> &[f32] {
        let atoms = self.support.atoms;
        let width = self.net.blocks[0].ins;
        let rows = self.evaluate(math, input, false);

        self.action_gradient[..rows * width].fill(0.0);

        for k in 0..2 {
            let values = &self.values[k];
            let probs = &self.probs[k];
            let lower: Vec<bool> = (0..rows).map(|r| self.lower_twin(r) == k).collect();
            let seed = self.net.seed(rows, &mut self.caches[k]);

            for row in 0..rows {
                let weight = match mix {
                    Mix::Average => 0.5,
                    Mix::Lower => f32::from(u8::from(lower[row])),
                };

                for i in 0..atoms {
                    let at = row * atoms + i;

                    seed[at] = weight * probs[at] * (self.support.atom(i) - values[row]);
                }
            }

            let pass = Backward {
                params: &self.params[k],
                grads: None,
                input,
                input_gradient: true,
            };

            self.net.backward(math, pass, &mut self.caches[k]);

            let from = &self.caches[k].input_gradient[..rows * width];

            self.action_gradient[..rows * width]
                .iter_mut()
                .zip(from)
                .for_each(|(a, g)| *a += g);
        }

        &self.action_gradient[..rows * width]
    }

    pub fn mean_value(&self, rows: usize) -> f32 {
        (self.values[0][..rows].iter().sum::<f32>() + self.values[1][..rows].iter().sum::<f32>()) / (2 * rows) as f32
    }

    pub fn soft_update(&mut self, tau: f32) {
        for k in 0..2 {
            for (t, p) in self.targets[k].iter_mut().zip(&self.params[k]) {
                *t += tau * (p - *t);
            }
        }
    }
}

pub struct Bellman<'a> {
    pub reward: &'a [f32],
    pub alive: &'a [f32],
    pub discount: f32,
    pub entropy: &'a [f32],
}

pub fn project(support: &Support, next: &[f32], bellman: Bellman, out: &mut [f32]) {
    let atoms = support.atoms;
    let step = support.step();

    out.fill(0.0);

    for (row, (probs, target)) in next.chunks_exact(atoms).zip(out.chunks_exact_mut(atoms)).enumerate() {
        let reach = bellman.discount * bellman.alive[row];

        for (i, p) in probs.iter().enumerate() {
            let shifted = bellman.reward[row] + reach * (support.atom(i) - bellman.entropy[row]);
            let place = (shifted.clamp(support.low, support.high) - support.low) / step;
            let below = (place.floor() as usize).min(atoms - 1);
            let above = (below + 1).min(atoms - 1);
            let share = place - below as f32;

            target[below] += p * (1.0 - share);
            target[above] += p * share;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{project, Bellman, Support};

    #[test]
    fn projection_keeps_mass_and_shifts_the_mean() {
        let support = Support {
            low: -5.0,
            high: 5.0,
            atoms: 11,
        };
        let mut next = vec![0.0f32; 11];

        next[5] = 0.5;
        next[7] = 0.5;

        let mut out = vec![0.0f32; 11];
        let bellman = Bellman {
            reward: &[0.3],
            alive: &[1.0],
            discount: 0.9,
            entropy: &[0.0],
        };

        project(&support, &next, bellman, &mut out);

        assert!((out.iter().sum::<f32>() - 1.0).abs() < 1e-6);
        assert!((support.expected(&out) - (0.3 + 0.9 * 1.0)).abs() < 1e-5);
    }
}
