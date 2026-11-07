use forge_train::heads::{gaussian_constant, policy_gradient, Head, Minibatch, PolicyTerms};
use forge_train::kernels::Math;
use forge_train::mlp::Mlp;
use forge_train::rng::Rng;

const CLIP: f32 = 0.2;
const ENT_COEF: f32 = 0.004;

struct Fixture {
    net: Mlp,
    rows: usize,
    nact: usize,
    obs: Vec<f32>,
    act: Vec<f32>,
    logp: Vec<f32>,
    adv: Vec<f32>,
}

fn clipped_surrogate_loss(f: &Fixture, params: &[f32], log_std: &[f32]) -> f64 {
    let nobs = f.obs.len() / f.rows;
    let constant = gaussian_constant(log_std) as f64;
    let mut total = 0.0f64;

    for row in 0..f.rows {
        let mu = f.net.forward_exact(params, &f.obs[row * nobs..(row + 1) * nobs]);
        let quadratic: f64 = (0..f.nact)
            .map(|j| {
                let off = (f.act[row * f.nact + j] - mu[j]) as f64;

                off * off * (-2.0 * log_std[j] as f64).exp()
            })
            .sum();
        let new_logp = -0.5 * quadratic - constant;
        let ratio = (new_logp - f.logp[row] as f64).exp();
        let advantage = f.adv[row] as f64;
        let clipped = ratio.clamp(1.0 - CLIP as f64, 1.0 + CLIP as f64) * advantage;

        total -= (ratio * advantage).min(clipped);
    }

    let entropy: f64 = log_std
        .iter()
        .map(|s| 0.5 + 0.5 * (2.0 * std::f64::consts::PI).ln() + *s as f64)
        .sum();

    total / f.rows as f64 - ENT_COEF as f64 * entropy
}

fn fixture() -> (Fixture, Vec<f32>) {
    let (nobs, nact, rows) = (5, 3, 6);
    let net = Mlp::plan(&[nobs, 12, 8, nact], 0);
    let mut params = vec![0.0f32; net.param_end()];
    let mut rng = Rng::new(21, 0);

    net.initialize(&mut params, 0.5, &mut rng);

    let mut draw = |n: usize, scale: f64| (0..n).map(|_| (rng.normal() * scale) as f32).collect::<Vec<f32>>();
    let fixture = Fixture {
        rows,
        nact,
        obs: draw(rows * nobs, 1.0),
        act: draw(rows * nact, 0.4),
        logp: draw(rows, 0.05).iter().map(|v| v - 1.2).collect(),
        adv: draw(rows, 1.0),
        net,
    };

    (fixture, params)
}

#[test]
fn policy_gradient_matches_finite_differences() {
    let (f, params) = fixture();
    let log_std = vec![-0.7f32, -0.5, -0.9];
    let math = Math::native(1);
    let mut scratch = f.net.scratch(f.rows);
    let mut grads = vec![0.0f32; params.len()];
    let mut log_std_grads = vec![0.0f32; f.nact];
    let ret = vec![0.0f32; f.rows];
    let batch = Minibatch {
        rows: f.rows,
        obs: &f.obs,
        act: &f.act,
        logp: &f.logp,
        adv: &f.adv,
        ret: &ret,
    };
    let head = Head {
        net: &f.net,
        scratch: &mut scratch,
        params: &params,
        grads: &mut grads,
    };
    let terms = PolicyTerms {
        log_std: &log_std,
        log_std_grads: &mut log_std_grads,
        clip: CLIP,
        ent_coef: ENT_COEF,
    };

    policy_gradient(&math, head, &batch, terms);

    for index in (0..params.len()).step_by(7) {
        let eps = 1e-2f32;
        let (mut plus, mut minus) = (params.clone(), params.clone());

        plus[index] += eps;
        minus[index] -= eps;

        let numeric = (clipped_surrogate_loss(&f, &plus, &log_std) - clipped_surrogate_loss(&f, &minus, &log_std))
            / (2.0 * eps as f64);

        assert!(
            (numeric - grads[index] as f64).abs() < 2e-3 + 0.03 * numeric.abs(),
            "param {index}: {numeric} against {}",
            grads[index]
        );
    }

    for j in 0..f.nact {
        let eps = 1e-3f32;
        let (mut plus, mut minus) = (log_std.clone(), log_std.clone());

        plus[j] += eps;
        minus[j] -= eps;

        let numeric = (clipped_surrogate_loss(&f, &params, &plus) - clipped_surrogate_loss(&f, &params, &minus))
            / (2.0 * eps as f64);

        assert!(
            (numeric - log_std_grads[j] as f64).abs() < 2e-3,
            "log std {j}: {numeric} against {}",
            log_std_grads[j]
        );
    }
}
