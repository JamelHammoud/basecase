use crate::simulate::Experiment;
use forge_sim::grad::{write_param, Smooth, Tracer, Wrt, WIDTH};
use forge_sim::lanes::LANES;
use forge_sim::{Plan, State, Workspace};
use rayon::prelude::*;

#[derive(Clone, Debug)]
pub struct Unknown {
    pub name: String,
    pub wrt: Wrt,
    pub nominal: f64,
    pub low: f64,
    pub high: f64,
}

impl Unknown {
    pub fn around(name: &str, wrt: Wrt, nominal: f64) -> Self {
        Self {
            name: name.to_owned(),
            wrt,
            nominal,
            low: nominal / 4.0,
            high: nominal * 4.0,
        }
    }
}

pub struct Run<'a> {
    pub plan: &'a Plan,
    pub unknowns: &'a [Unknown],
    pub experiment: &'a Experiment,
}

pub struct Linear {
    pub samples: Vec<f64>,
    pub columns: Vec<Vec<f64>>,
}

impl Run<'_> {
    fn start(&self, sets: &[Vec<f64>]) -> State {
        let e = self.experiment;
        let nu = self.plan.kernel.nu;
        let mut state = State::new(self.plan);

        for lane in 0..LANES {
            let set = &sets[lane.min(sets.len() - 1)];

            state.reset(self.plan, lane, &e.qpos0);
            state.set_qvel(lane, &e.qvel0);
            state.set_ctrl(lane, &e.controls[..nu]);

            for (u, value) in self.unknowns.iter().zip(set) {
                write_param(&mut state.tables, lane, (u.wrt, *value));
            }
        }

        state
    }

    fn samples(&self) -> usize {
        self.experiment.controls.len() / self.plan.kernel.nu.max(1)
    }

    fn set_ctrl(&self, state: &mut State, k: usize) {
        let nu = self.plan.kernel.nu;
        let ctrl = &self.experiment.controls[k * nu..(k + 1) * nu];

        for lane in 0..LANES {
            state.set_ctrl(lane, ctrl);
        }
    }

    fn block(&self, sets: &[Vec<f64>]) -> Result<Vec<Vec<f64>>, String> {
        let e = self.experiment;
        let mut state = self.start(sets);
        let mut w = Workspace::new(self.plan);
        let mut out = vec![Vec::with_capacity(self.samples() * e.observed.len()); sets.len()];

        for k in 0..self.samples() {
            self.set_ctrl(&mut state, k);

            for _ in 0..e.substeps {
                forge_sim::step(self.plan, &mut state, &mut w);
            }

            for (lane, rec) in out.iter_mut().enumerate() {
                rec.extend(e.observed.iter().map(|&i| state.qpos[i].0[lane]));
            }
        }

        finite(out)
    }

    pub fn simulate(&self, sets: &[Vec<f64>]) -> Result<Vec<Vec<f64>>, String> {
        let blocks: Vec<Result<Vec<Vec<f64>>, String>> =
            sets.par_chunks(LANES).map(|chunk| self.block(chunk)).collect();

        blocks.into_iter().try_fold(Vec::new(), |mut all, b| {
            all.extend(b?);
            Ok(all)
        })
    }

    fn traced(&self, sets: &[Vec<f64>], chunk: (usize, &[Unknown])) -> Result<Vec<Vec<Vec<f64>>>, String> {
        let e = self.experiment;
        let (first, unknowns) = chunk;
        let wrt: Vec<Wrt> = unknowns.iter().map(|u| u.wrt).collect();
        let mut state = self.start(sets);
        let mut w = Workspace::new(self.plan);
        let mut tracer = Tracer::new(&state, sets.len(), &wrt);
        let mut columns = vec![vec![Vec::with_capacity(self.samples() * e.observed.len()); wrt.len()]; sets.len()];

        for k in 0..self.samples() {
            self.set_ctrl(&mut state, k);
            tracer.advance(self.plan, &mut state, (&mut w, e.substeps, Smooth::EXACT))?;

            for (lane, lane_columns) in columns.iter_mut().enumerate() {
                for &i in &e.observed {
                    let tangent = tracer.qpos(lane, i);

                    for (t, column) in lane_columns.iter_mut().enumerate() {
                        column.push(tangent[t] * sets[lane][first + t]);
                    }
                }
            }
        }

        Ok(columns)
    }

    pub fn linearize(&self, sets: &[Vec<f64>]) -> Result<Vec<Linear>, String> {
        let chunks: Vec<(usize, &[Unknown])> = self
            .unknowns
            .chunks(WIDTH)
            .enumerate()
            .map(|(c, u)| (c * WIDTH, u))
            .collect();
        let blocks: Vec<&[Vec<f64>]> = sets.chunks(LANES).collect();
        let tasks: Vec<(usize, usize)> = (0..blocks.len())
            .flat_map(|b| (0..chunks.len()).map(move |c| (b, c)))
            .collect();
        let traced: Vec<Result<Vec<Vec<Vec<f64>>>, String>> = tasks
            .par_iter()
            .map(|&(b, c)| self.traced(blocks[b], chunks[c]))
            .collect();
        let mut out: Vec<Linear> = self
            .simulate(sets)?
            .into_iter()
            .map(|samples| Linear {
                samples,
                columns: Vec::new(),
            })
            .collect();

        for (&(b, _), columns) in tasks.iter().zip(traced) {
            for (lin, lane_columns) in out[b * LANES..].iter_mut().zip(columns?) {
                lin.columns.extend(lane_columns);
            }
        }

        Ok(out)
    }
}

fn finite(out: Vec<Vec<f64>>) -> Result<Vec<Vec<f64>>, String> {
    if out.iter().flatten().all(|v| v.is_finite()) {
        Ok(out)
    } else {
        Err("Forge's engine diverged while identifying".to_owned())
    }
}
