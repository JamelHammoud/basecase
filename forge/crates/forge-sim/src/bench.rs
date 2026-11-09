use crate::args::{Args, Backend};
use crate::drive::{start_pose, Waves, DECIMATION, EPISODE_ROUNDS};
use crate::meter::{Meter, Windows};
use forge_mujoco::{Batch, Data, Model};
use forge_sim::lanes::LANES;
use forge_sim::{MetalBatch, Plan, RowBatch, WgslBatch};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};

trait Stepper: Send {
    fn row(&mut self, sim: usize) -> &mut [f64];
    fn advance(&mut self, nstep: usize) -> usize;
    fn contacts(&self, sim: usize) -> Option<f64>;

    fn gpu_seconds(&self) -> Option<f64> {
        None
    }
}

impl Stepper for Batch {
    fn row(&mut self, sim: usize) -> &mut [f64] {
        Batch::row(self, sim)
    }

    fn advance(&mut self, nstep: usize) -> usize {
        self.step(nstep)
    }

    fn contacts(&self, _sim: usize) -> Option<f64> {
        None
    }
}

impl Stepper for RowBatch {
    fn row(&mut self, sim: usize) -> &mut [f64] {
        RowBatch::row(self, sim)
    }

    fn advance(&mut self, nstep: usize) -> usize {
        self.step(nstep)
    }

    fn contacts(&self, sim: usize) -> Option<f64> {
        Some(RowBatch::contacts(self, sim))
    }
}

impl Stepper for MetalBatch {
    fn row(&mut self, sim: usize) -> &mut [f64] {
        MetalBatch::row(self, sim)
    }

    fn advance(&mut self, nstep: usize) -> usize {
        self.step(nstep)
    }

    fn contacts(&self, sim: usize) -> Option<f64> {
        Some(MetalBatch::contacts(self, sim))
    }

    fn gpu_seconds(&self) -> Option<f64> {
        Some(MetalBatch::gpu_seconds(self))
    }
}

impl Stepper for WgslBatch {
    fn row(&mut self, sim: usize) -> &mut [f64] {
        WgslBatch::row(self, sim)
    }

    fn advance(&mut self, nstep: usize) -> usize {
        self.step(nstep)
    }

    fn contacts(&self, sim: usize) -> Option<f64> {
        Some(WgslBatch::contacts(self, sim))
    }

    fn gpu_seconds(&self) -> Option<f64> {
        Some(WgslBatch::gpu_seconds(self))
    }
}

struct Work<'a> {
    plan: &'a Plan,
    starts: &'a [Vec<f64>],
    ctrl_at: usize,
}

fn start_rows(model: &Model, plan: &Plan, envs: usize) -> Vec<Vec<f64>> {
    let signature = forge_mujoco::integration_state();

    (0..envs)
        .map(|w| {
            let mut data = Data::new(model);

            data.qpos().copy_from_slice(&start_pose(plan, w));

            let mut row = vec![0.0; model.state_size(signature)];

            data.get_state(model, &mut row, signature);
            row
        })
        .collect()
}

fn round(stepper: &mut dyn Stepper, work: &Work, waves: &mut Waves, r: usize) -> Result<f64, String> {
    let nu = work.plan.kernel.nu;

    for (w, start) in work.starts.iter().enumerate() {
        let row = stepper.row(w);

        if r.is_multiple_of(EPISODE_ROUNDS) {
            row.copy_from_slice(start);
        }

        waves.write(w, &mut row[work.ctrl_at..work.ctrl_at + nu]);
    }

    waves.advance();

    if stepper.advance(DECIMATION) > 0 {
        return Err("The bench robots diverged".to_owned());
    }

    Ok((0..work.starts.len()).filter_map(|w| stepper.contacts(w)).sum())
}

struct Measured {
    windows: Windows,
    contacts: Option<f64>,
    gpu_share: Option<f64>,
}

fn measure(stepper: &mut dyn Stepper, work: &Work, seconds: f64) -> Result<Measured, String> {
    let meter = Meter::default();
    let stop = AtomicBool::new(false);
    let envs = work.starts.len();
    let (windows, outcome) = std::thread::scope(|scope| {
        let runner = scope.spawn(|| {
            let (mut r, mut contacts) = (0, 0.0);
            let mut waves = Waves::new(work.plan, envs);

            while !stop.load(Ordering::SeqCst) {
                contacts += round(stepper, work, &mut waves, r)?;
                meter.add(envs * DECIMATION);
                r += 1;
            }

            Ok::<f64, String>(contacts / (r.max(1) * envs) as f64)
        });
        let windows = meter.watch(seconds);

        stop.store(true, Ordering::SeqCst);
        (
            windows,
            runner
                .join()
                .unwrap_or_else(|_| Err("The bench thread panicked".to_owned())),
        )
    });
    let contacts = outcome?;

    Ok(Measured {
        gpu_share: stepper.gpu_seconds().map(|g| g / seconds),
        windows,
        contacts: (contacts > 0.0).then_some(contacts),
    })
}

fn backend_name(backend: Backend) -> &'static str {
    match backend {
        Backend::Simd => "simd",
        Backend::Mujoco => "mujoco",
        Backend::Metal => "metal",
        Backend::Wgpu => "wgpu",
    }
}

pub fn run(args: &Args) -> Result<Value, String> {
    let threads = args
        .threads
        .unwrap_or_else(|| std::thread::available_parallelism().map_or(1, |n| n.get()));
    let (model, kernel) = forge_ir::load(&args.xml).map_err(|r| r.to_string())?;
    let plan = Plan::new(kernel.clone());
    let starts = start_rows(&model, &plan, args.envs);
    let work = Work {
        plan: &plan,
        starts: &starts,
        ctrl_at: Batch::new(&model, 1, 1)?.layout().ctrl,
    };
    let m = match args.backend {
        Backend::Simd => measure(
            &mut RowBatch::new(&model, kernel, args.envs, threads)?,
            &work,
            args.seconds,
        )?,
        Backend::Mujoco => measure(&mut Batch::new(&model, args.envs, threads)?, &work, args.seconds)?,
        Backend::Metal => measure(&mut MetalBatch::new(&model, kernel, args.envs)?, &work, args.seconds)?,
        Backend::Wgpu => measure(&mut WgslBatch::new(&model, kernel, args.envs)?, &work, args.seconds)?,
    };

    Ok(json!({
        "backend": backend_name(args.backend),
        "envs": args.envs,
        "seconds": args.seconds,
        "threads": threads,
        "lanes": LANES,
        "contactsPerWorld": m.contacts,
        "gpuShare": m.gpu_share,
        "substepsPerS": m.windows.mean,
        "sustainedMin": m.windows.min,
        "windows": m.windows.rates,
    }))
}
