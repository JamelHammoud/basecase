use crate::deployed::Deployed;
use crate::envs::{Envs, EnvsSpec, StepResult};
use crate::events::Phases;
use crate::job::Task;
use crate::kernels::Math;
use crate::normalizer::Normalizer;
use crate::robot::Robot;
use serde_json::{json, Value};

const EVAL_SECONDS: f64 = 8.0;
const EVAL_SEED: u64 = 123;
const GATE_SEED_OFFSET: u64 = 1000;
const CHECK_SAMPLES: usize = 16;

pub struct CheckSample {
    pub obs: Vec<f32>,
    pub action: Vec<f32>,
}

pub struct Trained<'a> {
    pub robot: &'a Robot,
    pub policy: &'a mut Deployed,
    pub norm: &'a Normalizer,
    pub math: &'a Math,
    pub threads: Option<usize>,
}

struct StepBuffers {
    reward: Vec<f32>,
    fell: Vec<bool>,
    timeout: Vec<bool>,
    obs: Vec<f32>,
    normalized: Vec<f32>,
}

impl StepBuffers {
    fn new(count: usize, nobs: usize) -> Self {
        Self {
            reward: vec![0.0; count],
            fell: vec![false; count],
            timeout: vec![false; count],
            obs: vec![0.0; count * nobs],
            normalized: vec![0.0; count * nobs],
        }
    }

    fn result(&mut self) -> StepResult<'_> {
        StepResult {
            reward: &mut self.reward,
            fell: &mut self.fell,
            timeout: &mut self.timeout,
        }
    }
}

pub fn exact_action(policy: &Deployed, norm: &Normalizer, obs: &[f32]) -> Vec<f32> {
    let mut normalized = vec![0.0f32; obs.len()];

    norm.apply(obs, &mut normalized);
    policy.exact(&normalized)
}

pub fn evaluate_clean(run: &mut Trained) -> Result<(Value, Vec<CheckSample>), String> {
    let robot = run.robot;
    let nobs = run.robot.nobs();
    let mut envs = Envs::new(robot, 1, EVAL_SEED, false)?;
    let mut buffers = StepBuffers::new(1, nobs);
    let mut phases = Phases::default();
    let mut samples = Vec::with_capacity(CHECK_SAMPLES);
    let total = (EVAL_SECONDS / robot.control_dt) as usize;
    let stride = (total / CHECK_SAMPLES).max(1);

    envs.place_at_start_exactly(0);

    let start = envs.root_xy(0);
    let mut fell_at = Value::Null;

    for k in 0..total {
        envs.observe(&mut buffers.obs);
        run.norm.apply(&buffers.obs, &mut buffers.normalized);

        if k % stride == 0 && samples.len() < CHECK_SAMPLES {
            let action = exact_action(run.policy, run.norm, &buffers.obs);

            samples.push(CheckSample {
                obs: buffers.obs.clone(),
                action,
            });
        }

        let action = run.policy.act(run.math, &buffers.normalized, 1).to_vec();

        envs.clear_step_counts();
        envs.step(&action, buffers.result(), &mut phases)?;

        if buffers.fell[0] {
            fell_at = json!((k + 1) as f64 * robot.control_dt);

            break;
        }
    }

    let end = envs.root_xy(0);
    let moved = [end[0] - start[0], end[1] - start[1]];

    while samples.len() < CHECK_SAMPLES {
        envs.observe(&mut buffers.obs);
        run.norm.apply(&buffers.obs, &mut buffers.normalized);
        samples.push(CheckSample {
            obs: buffers.obs.clone(),
            action: exact_action(run.policy, run.norm, &buffers.obs),
        });

        let action = run.policy.act(run.math, &buffers.normalized, 1).to_vec();

        envs.step(&action, buffers.result(), &mut phases)?;
    }

    Ok((
        json!({
            "fellAt": fell_at,
            "seconds": EVAL_SECONDS,
            "forward": -moved[1],
            "travelled": moved[0].hypot(moved[1]),
        }),
        samples,
    ))
}

fn passes(task: Task, fell: bool, speed: f64, wanted: f64) -> bool {
    !fell && (task == Task::Stand || speed >= wanted)
}

pub struct GateResult {
    pub seeds: usize,
    pub passed: usize,
    pub fell: usize,
    pub mean_speed: f64,
}

impl GateResult {
    pub fn to_json(&self) -> Value {
        json!({
            "seeds": self.seeds,
            "passed": self.passed,
            "fell": self.fell,
            "meanSpeed": self.mean_speed,
        })
    }

    pub fn reached(&self) -> bool {
        self.passed >= (0.9 * self.seeds as f64).ceil() as usize
    }
}

pub fn evaluate_seeds(run: &mut Trained, seeds: usize) -> Result<GateResult, String> {
    let robot = run.robot;
    let nobs = run.robot.nobs();
    let job = &robot.job;
    let spec = EnvsSpec {
        count: seeds,
        seed: job.seed + GATE_SEED_OFFSET,
        randomized: false,
        threads: run.threads.or(job.threads),
    };
    let mut envs = Envs::build(robot, spec)?;
    let mut buffers = StepBuffers::new(seeds, nobs);
    let mut phases = Phases::default();
    let steps = (EVAL_SECONDS / robot.control_dt) as usize;
    let mut fell = vec![false; seeds];
    let mut forward = vec![0.0f64; seeds];

    for _ in 0..steps {
        envs.observe(&mut buffers.obs);
        run.norm.apply(&buffers.obs, &mut buffers.normalized);

        let action = run.policy.act(run.math, &buffers.normalized, seeds).to_vec();

        envs.clear_step_counts();
        envs.step(&action, buffers.result(), &mut phases)?;

        for sim in 0..seeds {
            fell[sim] |= buffers.fell[sim];
            forward[sim] += envs.forward_speed(sim) * robot.control_dt;
        }
    }

    let speeds: Vec<f64> = forward.iter().map(|d| d / EVAL_SECONDS).collect();
    let passed = fell
        .iter()
        .zip(&speeds)
        .filter(|(f, s)| passes(job.task, **f, **s, job.gate_speed))
        .count();

    Ok(GateResult {
        seeds,
        passed,
        fell: fell.iter().filter(|f| **f).count(),
        mean_speed: speeds.iter().sum::<f64>() / seeds as f64,
    })
}
