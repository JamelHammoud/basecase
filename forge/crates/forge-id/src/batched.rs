use crate::identify::{damped_step, relative_std, Fit, Options};
use crate::linalg::Square;
use crate::simulate::{Experiment, Recording};
use crate::worlds::{Linear, Run, Unknown};
use forge_sim::grad::supported;
use forge_sim::Plan;

const MAX_DAMPING_TRIES: usize = 12;
const SETTLED: f64 = 1e-7;

pub struct Worlds<'a> {
    pub plan: &'a Plan,
    pub unknowns: &'a [Unknown],
    pub experiment: &'a Experiment,
    pub recordings: &'a [Recording],
}

struct World {
    logs: Vec<f64>,
    done: bool,
    iterations: usize,
    normal: Square,
    gradient: Vec<f64>,
    cost: f64,
    residuals: usize,
}

impl Worlds<'_> {
    fn run(&self) -> Run<'_> {
        Run {
            plan: self.plan,
            unknowns: self.unknowns,
            experiment: self.experiment,
        }
    }

    fn values(&self, logs: &[f64]) -> Vec<f64> {
        logs.iter()
            .zip(self.unknowns)
            .map(|(l, u)| l.exp().clamp(u.low, u.high))
            .collect()
    }

    fn residual(&self, world: usize, samples: &[f64], noise: f64) -> Vec<f64> {
        samples
            .iter()
            .zip(&self.recordings[world].samples)
            .map(|(s, m)| (s - m) / noise)
            .collect()
    }

    fn costs(&self, sets: &[Vec<f64>], worlds: &[usize], noise: f64) -> Result<Vec<f64>, String> {
        let runs = self.run().simulate(sets)?;

        Ok(runs
            .iter()
            .zip(worlds)
            .map(|(samples, &w)| self.residual(w, samples, noise).iter().map(|r| r * r).sum())
            .collect())
    }

    fn linearize(&self, worlds: &mut [World], noise: f64) -> Result<(), String> {
        let sets: Vec<Vec<f64>> = worlds.iter().map(|w| self.values(&w.logs)).collect();
        let linear = self.run().linearize(&sets)?;

        for (index, (world, Linear { samples, columns })) in worlds.iter_mut().zip(linear).enumerate() {
            let residual = self.residual(index, &samples, noise);
            let scaled: Vec<Vec<f64>> = columns.iter().map(|c| c.iter().map(|v| v / noise).collect()).collect();

            world.cost = residual.iter().map(|r| r * r).sum();
            world.residuals = residual.len();
            world.gradient = scaled
                .iter()
                .map(|c| c.iter().zip(&residual).map(|(a, b)| a * b).sum())
                .collect();
            world.normal = Square::gram(&scaled);
        }

        Ok(())
    }

    fn improve(&self, worlds: &mut [World], noise: f64) -> Result<(), String> {
        let mut pending: Vec<usize> = (0..worlds.len()).filter(|w| !worlds[*w].done).collect();
        let mut damping = vec![1e-3; worlds.len()];

        for _ in 0..MAX_DAMPING_TRIES {
            if pending.is_empty() {
                return Ok(());
            }

            let trials: Vec<Option<Vec<f64>>> = pending
                .iter()
                .map(|&w| {
                    let step = damped_step(&worlds[w].normal, &worlds[w].gradient, damping[w])?;

                    Some(worlds[w].logs.iter().zip(&step).map(|(l, s)| l + s).collect())
                })
                .collect();
            let sets: Vec<Vec<f64>> = pending
                .iter()
                .zip(&trials)
                .map(|(&w, t)| self.values(t.as_ref().unwrap_or(&worlds[w].logs)))
                .collect();
            let costs = self.costs(&sets, &pending, noise)?;
            let mut next = Vec::new();

            for (((&w, trial), cost), set) in pending.iter().zip(trials).zip(costs).zip(&sets) {
                let world = &mut worlds[w];

                match trial.filter(|_| cost < world.cost) {
                    Some(_) => {
                        let logs: Vec<f64> = set.iter().map(|v| v.ln()).collect();
                        let moved = logs
                            .iter()
                            .zip(&world.logs)
                            .map(|(a, b)| (a - b).abs())
                            .fold(0.0, f64::max);

                        world.done = moved <= SETTLED;
                        world.logs = logs;
                        world.iterations += 1;
                    }
                    None => {
                        damping[w] *= 10.0;
                        next.push(w);
                    }
                }
            }

            pending = next;
        }

        for w in pending {
            worlds[w].done = true;
        }

        Ok(())
    }

    fn finish(&self, world: &World, options: &Options) -> Fit {
        let dof = (world.residuals as f64 - world.logs.len() as f64).max(1.0);
        let spread = relative_std(&world.normal, (world.cost / dof).max(1.0));
        let identified: Vec<bool> = spread.iter().map(|s| *s <= options.max_relative_std).collect();
        let values = self
            .values(&world.logs)
            .iter()
            .zip(self.unknowns)
            .zip(&identified)
            .map(|((v, u), ok)| if *ok { *v } else { u.nominal })
            .collect();

        Fit {
            values,
            identified,
            relative_std: spread,
            cost: world.cost,
            iterations: world.iterations,
        }
    }
}

pub fn identify_worlds(problem: &Worlds, options: Options) -> Result<Vec<Fit>, String> {
    supported(problem.plan)?;

    let logs: Vec<f64> = problem.unknowns.iter().map(|u| u.nominal.ln()).collect();
    let mut worlds: Vec<World> = problem
        .recordings
        .iter()
        .map(|_| World {
            logs: logs.clone(),
            done: false,
            iterations: 0,
            normal: Square::zeros(logs.len()),
            gradient: Vec::new(),
            cost: f64::INFINITY,
            residuals: 0,
        })
        .collect();

    let total = problem.experiment.controls.len() / problem.plan.kernel.nu.max(1);

    for share in STAGES {
        let samples = ((total as f64 * share).ceil() as usize).clamp(1, total);
        let (experiment, recordings) = truncated(problem, samples);
        let stage = Worlds {
            experiment: &experiment,
            recordings: &recordings,
            ..*problem
        };

        worlds.iter_mut().for_each(|w| w.done = false);
        fit(&stage, &mut worlds, &options)?;
    }

    problem.linearize(&mut worlds, options.noise)?;

    Ok(worlds.iter().map(|w| problem.finish(w, &options)).collect())
}

const STAGES: [f64; 6] = [0.03125, 0.0625, 0.125, 0.25, 0.5, 1.0];

fn truncated(problem: &Worlds, samples: usize) -> (Experiment, Vec<Recording>) {
    let e = problem.experiment;
    let width = e.observed.len();
    let experiment = Experiment {
        controls: e.controls[..samples * problem.plan.kernel.nu].to_vec(),
        ..e.clone()
    };
    let recordings = problem
        .recordings
        .iter()
        .map(|r| Recording {
            samples: r.samples[..samples * width].to_vec(),
        })
        .collect();

    (experiment, recordings)
}

fn fit(problem: &Worlds, worlds: &mut [World], options: &Options) -> Result<(), String> {
    for _ in 0..options.max_iterations {
        problem.linearize(worlds, options.noise)?;

        if worlds.iter().all(|w| w.done) {
            break;
        }

        problem.improve(worlds, options.noise)?;
    }

    Ok(())
}
