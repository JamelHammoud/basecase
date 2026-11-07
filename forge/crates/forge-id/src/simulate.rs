use crate::params::{apply, ParamSpec};
use forge_mujoco::{integration_state, Batch, Data, Model};

#[derive(Clone, Debug)]
pub struct Experiment {
    pub qpos0: Vec<f64>,
    pub qvel0: Vec<f64>,
    pub controls: Vec<f64>,
    pub substeps: usize,
    pub observed: Vec<usize>,
}

#[derive(Clone, Debug)]
pub struct Recording {
    pub samples: Vec<f64>,
}

impl Experiment {
    pub fn sample_count(&self, model: &Model) -> usize {
        self.controls.len() / model.nu().max(1)
    }

    fn start_row(&self, model: &Model, width: usize) -> Vec<f64> {
        let mut data = Data::new(model);
        let mut row = vec![0.0; width];

        data.qpos().copy_from_slice(&self.qpos0);
        data.qvel().copy_from_slice(&self.qvel0);
        data.get_state(model, &mut row, integration_state());

        row
    }
}

pub fn simulate(
    model: &Model,
    specs: &[ParamSpec],
    sets: &[Vec<f64>],
    experiment: &Experiment,
) -> Result<Vec<Recording>, String> {
    let nsim = sets.len();
    let threads = std::thread::available_parallelism().map_or(4, |c| c.get()).min(nsim);
    let mut batch = Batch::new(model, nsim, threads)?;
    let layout = batch.layout();
    let nu = model.nu();
    let samples = experiment.sample_count(model);
    let width = experiment.observed.len();
    let start = experiment.start_row(model, layout.nstate);
    let mut recordings = vec![
        Recording {
            samples: vec![0.0; samples * width]
        };
        nsim
    ];

    apply(&mut batch, specs, sets)?;

    for sim in 0..nsim {
        batch.row(sim).copy_from_slice(&start);
    }

    for k in 0..samples {
        let ctrl = &experiment.controls[k * nu..(k + 1) * nu];

        for sim in 0..nsim {
            batch.row(sim)[layout.ctrl..layout.ctrl + nu].copy_from_slice(ctrl);
        }

        if batch.step(experiment.substeps) > 0 {
            return Err(batch.first_error().unwrap_or_else(|| "MuJoCo failed".to_owned()));
        }

        for (sim, recording) in recordings.iter_mut().enumerate() {
            let row = batch.row(sim);
            let target = &mut recording.samples[k * width..(k + 1) * width];

            for (slot, &adr) in target.iter_mut().zip(&experiment.observed) {
                *slot = row[layout.qpos + adr];
            }
        }
    }

    Ok(recordings)
}
