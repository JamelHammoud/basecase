use crate::linalg::Square;
use crate::params::ParamSpec;
use crate::simulate::{simulate, Experiment, Recording};
use forge_mujoco::Model;

#[derive(Clone, Copy, Debug)]
pub struct Options {
    pub noise: f64,
    pub max_iterations: usize,
    pub max_relative_std: f64,
    pub log_step: f64,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            noise: 1.5e-3,
            max_iterations: 40,
            max_relative_std: 0.02,
            log_step: 1e-3,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Fit {
    pub values: Vec<f64>,
    pub identified: Vec<bool>,
    pub relative_std: Vec<f64>,
    pub cost: f64,
    pub iterations: usize,
}

struct Problem<'a> {
    model: &'a Model,
    specs: &'a [ParamSpec],
    data: &'a [(Experiment, Recording)],
    options: Options,
}

const MAX_DAMPING_TRIES: usize = 12;
const NULL_EIGENVALUE: f64 = 1e-12;
const NEGLIGIBLE_LOADING: f64 = 1e-3;

impl Problem<'_> {
    fn residuals(&self, sets: &[Vec<f64>]) -> Result<Vec<Vec<f64>>, String> {
        let mut out = vec![Vec::new(); sets.len()];

        for (experiment, recording) in self.data {
            let simulated = simulate(self.model, self.specs, sets, experiment)?;

            for (target, run) in out.iter_mut().zip(simulated) {
                let scaled = run
                    .samples
                    .iter()
                    .zip(&recording.samples)
                    .map(|(s, m)| (s - m) / self.options.noise);

                target.extend(scaled);
            }
        }

        Ok(out)
    }

    fn values(&self, logs: &[f64]) -> Vec<f64> {
        logs.iter()
            .zip(self.specs)
            .map(|(l, spec)| l.exp().clamp(spec.low, spec.high))
            .collect()
    }

    fn cost(&self, logs: &[f64]) -> Result<f64, String> {
        let residual = self.residuals(&[self.values(logs)])?;

        Ok(residual[0].iter().map(|r| r * r).sum())
    }

    fn linearize(&self, logs: &[f64]) -> Result<(Vec<f64>, Vec<Vec<f64>>), String> {
        let h = self.options.log_step;
        let mut sets = vec![self.values(logs)];

        for index in 0..logs.len() {
            for sign in [1.0, -1.0] {
                let mut moved = logs.to_vec();

                moved[index] += sign * h;
                sets.push(moved.iter().map(|l| l.exp()).collect());
            }
        }

        let runs = self.residuals(&sets)?;
        let columns = (0..logs.len())
            .map(|i| {
                runs[1 + 2 * i]
                    .iter()
                    .zip(&runs[2 + 2 * i])
                    .map(|(p, m)| (p - m) / (2.0 * h))
                    .collect()
            })
            .collect();

        Ok((runs[0].clone(), columns))
    }
}

pub(crate) fn damped_step(normal: &Square, gradient: &[f64], damping: f64) -> Option<Vec<f64>> {
    let mut damped = Square {
        size: normal.size,
        values: normal.values.clone(),
    };

    for i in 0..normal.size {
        damped.set(i, i, normal.at(i, i) * (1.0 + damping) + 1e-12);
    }

    let rhs: Vec<f64> = gradient.iter().map(|g| -g).collect();

    damped.solve_cholesky(&rhs)
}

pub(crate) fn relative_std(normal: &Square, scale: f64) -> Vec<f64> {
    let (values, vectors) = normal.symmetric_eigen();
    let largest = values.iter().cloned().fold(0.0, f64::max);

    (0..normal.size)
        .map(|i| {
            let variance: f64 = (0..normal.size)
                .filter(|k| vectors.at(i, *k).abs() > NEGLIGIBLE_LOADING)
                .map(|k| {
                    let value = values[k];

                    if value <= NULL_EIGENVALUE * largest.max(1e-300) {
                        return f64::INFINITY;
                    }

                    vectors.at(i, k).powi(2) / value
                })
                .sum();

            (variance * scale).sqrt()
        })
        .collect()
}

fn lower_cost(
    problem: &Problem,
    logs: &[f64],
    linear: (&Square, &[f64]),
    cost: f64,
) -> Result<Option<Vec<f64>>, String> {
    let (normal, gradient) = linear;
    let mut damping = 1e-3;

    for _ in 0..MAX_DAMPING_TRIES {
        let Some(step) = damped_step(normal, gradient, damping) else {
            damping *= 10.0;

            continue;
        };
        let trial: Vec<f64> = logs.iter().zip(&step).map(|(l, s)| l + s).collect();

        if problem.cost(&trial)? < cost {
            return Ok(Some(trial));
        }

        damping *= 10.0;
    }

    Ok(None)
}

pub fn identify(
    model: &Model,
    specs: &[ParamSpec],
    data: &[(Experiment, Recording)],
    options: Options,
) -> Result<Fit, String> {
    let problem = Problem {
        model,
        specs,
        data,
        options,
    };
    let mut logs: Vec<f64> = specs.iter().map(|s| s.nominal.ln()).collect();
    let mut iterations = 0;

    loop {
        let (residual, columns) = problem.linearize(&logs)?;
        let cost: f64 = residual.iter().map(|r| r * r).sum();
        let normal = Square::gram(&columns);
        let gradient: Vec<f64> = columns
            .iter()
            .map(|c| c.iter().zip(&residual).map(|(a, b)| a * b).sum())
            .collect();
        let next = if iterations < options.max_iterations {
            lower_cost(&problem, &logs, (&normal, &gradient), cost)?
        } else {
            None
        };
        let moved = next.as_ref().map_or(0.0, |n| {
            n.iter().zip(&logs).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max)
        });

        if let Some(trial) = next.filter(|_| moved > 1e-7) {
            logs = problem.values(&trial).iter().map(|v| v.ln()).collect();
            iterations += 1;

            continue;
        }

        let dof = (residual.len() as f64 - logs.len() as f64).max(1.0);
        let spread = relative_std(&normal, (cost / dof).max(1.0));
        let identified: Vec<bool> = spread.iter().map(|s| *s <= options.max_relative_std).collect();
        let values = problem
            .values(&logs)
            .iter()
            .zip(specs)
            .zip(&identified)
            .map(|((v, spec), ok)| if *ok { *v } else { spec.nominal })
            .collect();

        return Ok(Fit {
            values,
            identified,
            relative_std: spread,
            cost,
            iterations,
        });
    }
}
