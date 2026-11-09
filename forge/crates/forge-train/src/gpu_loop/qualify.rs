use super::buffers::{Buffers, Dims};
use super::learn::Settings;
use super::rollout::Encoder;
use super::source::Ctrl;
use crate::adam::{clip_scale, gradient_norm, Adam};
use crate::heads::{gaussian_constant, log_prob, policy_gradient, value_gradient, Head, Minibatch, PolicyTerms};
use crate::kernels::Math;
use crate::rng::Rng;
use crate::update::{Learner, GRAD_NORM_MAX, LOG_STD_MAX};
use forge_sim::metal::gpu::{Gpu, Kernel};
use forge_sim::metal::Worlds;

const ROWS: usize = 256;
const GRADIENT_TOLERANCE: f64 = 1e-3;
const STEP_TOLERANCE: f64 = 1e-2;
const SEED: u64 = 77;

pub struct Vector {
    obs: Vec<f32>,
    act: Vec<f32>,
    rows: Vec<f32>,
}

pub struct Device<'a> {
    pub kernels: &'a [Kernel],
    pub worlds: &'a Worlds,
    pub settings: &'a Settings,
}

fn vector(learner: &Learner) -> Vector {
    let (nobs, nact) = (learner.nobs, learner.nact);
    let mut rng = Rng::new(SEED, 0);
    let mut draw = |n: usize, scale: f64| (0..n).map(|_| (rng.normal() * scale) as f32).collect::<Vec<f32>>();
    let obs = draw(ROWS * nobs, 1.0);
    let act = draw(ROWS * nact, 0.6);
    let shifts = draw(ROWS, 0.15);
    let adv = draw(ROWS, 1.0);
    let ret = draw(ROWS, 1.0);
    let log_std = learner.log_std();
    let inverse: Vec<f32> = log_std.iter().map(|s| (-s).exp()).collect();
    let constant = gaussian_constant(log_std);
    let mut actor = learner.actor.scratch(ROWS);
    let mean = learner
        .actor
        .forward(&Math::native(1), &learner.params, &obs, ROWS, &mut actor);
    let logp = (0..ROWS).map(|r| {
        let span = r * nact..(r + 1) * nact;

        log_prob(&mean[span.clone()], &act[span], &inverse, constant) + shifts[r]
    });
    let rows = logp.chain(adv).chain(ret).collect();

    Vector { obs, act, rows }
}

fn reference(learner: &Learner, v: &Vector, clip: f32, ent_coef: f32) -> Vec<f32> {
    let math = Math::native(1);
    let (actor, critic) = (&learner.actor, &learner.critic);
    let mut grads = vec![0.0f32; learner.params.len()];
    let log_std_at = critic.param_end();
    let (nets, log_std_grads) = grads.split_at_mut(log_std_at);
    let (actor_grads, critic_grads) = nets.split_at_mut(actor.param_end());
    let batch = Minibatch {
        rows: ROWS,
        obs: &v.obs,
        act: &v.act,
        logp: &v.rows[..ROWS],
        adv: &v.rows[ROWS..2 * ROWS],
        ret: &v.rows[2 * ROWS..],
    };
    let terms = PolicyTerms {
        log_std: &learner.params[log_std_at..],
        log_std_grads,
        clip,
        ent_coef,
        scale: 1.0 / ROWS as f32,
    };
    let mut scratch = actor.scratch(ROWS);
    let head = Head {
        net: actor,
        scratch: &mut scratch,
        params: &learner.params,
        grads: actor_grads,
    };

    policy_gradient(&math, head, &batch, terms);

    let mut scratch = critic.scratch(ROWS);
    let head = Head {
        net: critic,
        scratch: &mut scratch,
        params: &learner.params,
        grads: critic_grads,
    };

    value_gradient(&math, head, &batch, 1.0 / ROWS as f32);
    grads
}

fn worst(got: &[f32], want: &[f32]) -> f64 {
    let scale = want.iter().fold(0.0f64, |m, w| m.max(f64::from(w.abs()))).max(1e-12);

    got.iter()
        .zip(want)
        .map(|(a, b)| f64::from((a - b).abs()) / scale)
        .fold(0.0, |m, e| if e.is_nan() { f64::INFINITY } else { m.max(e) })
}

fn stepped(learner: &Learner, grads: &[f32], floor: f32) -> Vec<f32> {
    let mut params = learner.params.clone();
    let scale = clip_scale(gradient_norm(grads), GRAD_NORM_MAX);
    let scaled: Vec<f32> = grads.iter().map(|g| if scale < 1.0 { g * scale } else { *g }).collect();
    let log_std_at = learner.critic.param_end();

    Adam::new(params.len()).step(&mut params, &scaled, learner.learn_rate);
    params[log_std_at..]
        .iter_mut()
        .for_each(|s| *s = s.clamp(floor, LOG_STD_MAX));
    params
}

fn upload(gpu: &mut Gpu, b: &Buffers, learner: &Learner, v: &Vector) {
    gpu.slice_mut(b.params).copy_from_slice(&learner.params);
    gpu.slice_mut(b.ctrl)[Ctrl::Lr as usize] = learner.learn_rate;
    gpu.slice_mut(b.obs).copy_from_slice(&v.obs);
    gpu.slice_mut(b.act).copy_from_slice(&v.act);
    gpu.slice_mut(b.rows).copy_from_slice(&v.rows);
    gpu.slice_mut(b.mask).fill(1.0);

    for (i, p) in gpu.slice_mut(b.perm).iter_mut().enumerate() {
        *p = i as u32;
    }
}

pub fn learner(gpu: &mut Gpu, device: &Device, learner: &Learner) -> Result<(), String> {
    let dims = Dims {
        envs: ROWS,
        horizon: 1,
        minibatch: ROWS,
        epochs: 1,
        nobs: learner.nobs,
        nact: learner.nact,
        nparams: learner.params.len(),
    };
    let buffers = Buffers::new(gpu, &dims, [&learner.actor, &learner.critic])?;
    let v = vector(learner);
    let settings = Settings {
        masked: false,
        ..*device.settings
    };

    upload(gpu, &buffers, learner, &v);

    let encoder = Encoder {
        kernels: device.kernels,
        buffers: &buffers,
        worlds: device.worlds,
        nets: [&learner.actor, &learner.critic],
        dims: &dims,
    };
    let mut dispatches = Vec::new();

    encoder.minibatch(&settings, 0, &mut dispatches);
    gpu.run(&dispatches)?;

    let hyper = &settings.hyper;
    let want = reference(learner, &v, hyper.clip, hyper.ent_coef);
    let got = gpu.slice(buffers.grads).to_vec();
    let off = worst(&got, &want);

    if off > GRADIENT_TOLERANCE {
        return Err(format!(
            "its PPO gradients are off from the CPU learner's by {off:.1e}, and qualification allows {GRADIENT_TOLERANCE:.0e}"
        ));
    }

    let step = stepped(learner, &got, settings.log_std_min);
    let moved: Vec<f32> = step.iter().zip(&learner.params).map(|(a, b)| a - b).collect();
    let gpu_moved: Vec<f32> = gpu
        .slice(buffers.params)
        .iter()
        .zip(&learner.params)
        .map(|(a, b)| a - b)
        .collect();
    let off = worst(&gpu_moved, &moved);

    if off > STEP_TOLERANCE {
        return Err(format!(
            "its Adam step is off from the CPU learner's by {off:.1e}, and qualification allows {STEP_TOLERANCE:.0e}"
        ));
    }

    Ok(())
}
