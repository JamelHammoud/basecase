use forge_train::kernels::Math;
use forge_train::rng::Rng;
use forge_train::update::{Learner, Minibatch, HYPER};
use std::time::Instant;

fn main() {
    let (nobs, nact, rows) = (48, 12, 384);
    let mut rng = Rng::new(1, 0);
    let portable = std::env::args().nth(1).is_some();
    let threads = std::thread::available_parallelism().map_or(4, |c| c.get());
    let math = if portable {
        Math::portable(threads)
    } else {
        Math::native(threads)
    };
    let mut learner = Learner::new(nobs, nact, rows, &mut rng);
    let obs: Vec<f32> = (0..rows * nobs).map(|_| rng.normal() as f32).collect();
    let act: Vec<f32> = (0..rows * nact).map(|_| rng.normal() as f32 * 0.3).collect();
    let logp: Vec<f32> = (0..rows).map(|_| -5.0).collect();
    let adv: Vec<f32> = (0..rows).map(|_| rng.normal() as f32).collect();
    let ret: Vec<f32> = (0..rows).map(|_| rng.normal() as f32).collect();
    let batch = Minibatch {
        rows,
        obs: &obs,
        act: &act,
        logp: &logp,
        adv: &adv,
        ret: &ret,
    };
    for _ in 0..20 {
        learner.minibatch_step(&math, &batch, &HYPER);
    }
    let t = Instant::now();
    let reps = 400;
    for _ in 0..reps {
        learner.minibatch_step(&math, &batch, &HYPER);
    }
    let per = t.elapsed().as_secs_f64() / reps as f64;
    println!(
        "minibatch step {:.3} ms, per iteration (20) {:.2} ms",
        per * 1e3,
        per * 20e3
    );
    let t = Instant::now();
    for _ in 0..reps {
        learner.act_mean(&math, &obs, rows);
    }
    println!("actor forward {:.3} ms", t.elapsed().as_secs_f64() / reps as f64 * 1e3);
    let t = Instant::now();
    for _ in 0..reps {
        learner.act_mean(&math, &obs[..64 * nobs], 64);
        learner.value(&math, &obs[..64 * nobs], 64);
    }
    println!(
        "inference 64 envs {:.3} ms",
        t.elapsed().as_secs_f64() / reps as f64 * 1e3
    );
    let mut values: Vec<f32> = (0..rows * 448).map(|_| rng.normal() as f32).collect();
    let mut slopes = vec![0f32; values.len()];
    let t = Instant::now();
    for _ in 0..reps {
        forge_train::elu::apply_with_bias(&mut values, &vec![0.0; 384 * 448], &mut slopes);
        values.iter_mut().for_each(|v| *v = -*v);
    }
    println!(
        "elu over 384x448 {:.3} ms",
        t.elapsed().as_secs_f64() / reps as f64 * 1e3
    );
    for (k, n) in [(48usize, 256usize), (256, 128), (128, 64), (64, 12)] {
        let a: Vec<f32> = (0..rows * k).map(|_| rng.normal() as f32).collect();
        let b: Vec<f32> = (0..k * n).map(|_| rng.normal() as f32).collect();
        let bias = vec![0.1f32; n];
        let mut out = vec![0f32; rows * n];
        let mut sl = vec![0f32; rows * n];
        let t = Instant::now();
        for _ in 0..reps {
            math.multiply(
                &mut out,
                &a,
                &b,
                forge_train::kernels::Shape {
                    rows,
                    inner: k,
                    cols: n,
                },
            );
        }
        let mm = t.elapsed().as_secs_f64() / reps as f64 * 1e3;
        let t = Instant::now();
        for _ in 0..reps {
            math.bias_elu(&mut out, &bias, &mut sl);
        }
        println!(
            "layer {k}x{n}: multiply {mm:.4} ms, bias_elu {:.4} ms",
            t.elapsed().as_secs_f64() / reps as f64 * 1e3
        );
    }
    let mut adam = forge_train::adam::Adam::new(108_000);
    let mut params = vec![0.1f32; 108_000];
    let grads = vec![0.01f32; 108_000];
    let t = Instant::now();
    for _ in 0..reps {
        adam.step(&mut params, &grads, 1e-3);
        forge_train::adam::gradient_norm(&grads);
    }
    println!(
        "adam + norm 108K {:.3} ms",
        t.elapsed().as_secs_f64() / reps as f64 * 1e3
    );
}
