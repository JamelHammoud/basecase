use super::{Actor, Objective};
use crate::kernels::Math;
use crate::rng::Rng;
use crate::sac::recipe::Recipe;

const NOBS: usize = 5;
const NACT: usize = 3;
const ROWS: usize = 4;
const ALPHA: f32 = 0.3;

fn objective_value(actor: &mut Actor, math: &Math, obs: &[f32], noise: &[f32], slopes: &[f32]) -> f64 {
    actor.sample(math, obs, noise);

    let mut total = 0.0f64;

    for row in 0..ROWS {
        let value: f32 = (0..NACT).map(|j| slopes[j] * actor.actions[row * NACT + j]).sum();

        total += (ALPHA * actor.log_probs[row] - value) as f64;
    }

    total / ROWS as f64
}

#[test]
fn actor_gradient_matches_finite_differences() {
    let mut recipe = Recipe::fast();

    recipe.actor_hidden = vec![8, 6];
    recipe.log_std_range = (-2.0, 0.5);

    let mut rng = Rng::new(5, 0);
    let mut actor = Actor::new(NOBS, NACT, &recipe, ROWS, &mut rng);

    actor.params.iter_mut().for_each(|p| *p += 0.3 * rng.normal() as f32);

    let math = Math::portable(1);
    let obs: Vec<f32> = (0..ROWS * NOBS).map(|_| rng.normal() as f32).collect();
    let noise: Vec<f32> = (0..ROWS * NACT).map(|_| rng.normal() as f32).collect();
    let slopes = [0.7f32, -1.1, 0.4];
    let gradient: Vec<f32> = (0..ROWS).flat_map(|_| slopes).collect();

    actor.sample(&math, &obs, &noise);

    let grads = actor
        .objective_gradients(
            &math,
            &obs,
            Objective {
                action_gradient: &gradient,
                action_offset: 0,
                alpha: ALPHA,
                noise: &noise,
            },
        )
        .to_vec();

    for index in (0..actor.params.len()).step_by(3) {
        let eps = 1e-2f32;
        let original = actor.params[index];

        actor.params[index] = original + eps;

        let plus = objective_value(&mut actor, &math, &obs, &noise, &slopes);

        actor.params[index] = original - eps;

        let minus = objective_value(&mut actor, &math, &obs, &noise, &slopes);

        actor.params[index] = original;

        let numeric = (plus - minus) / (2.0 * eps as f64);

        assert!(
            (numeric - grads[index] as f64).abs() < 2e-3 + 0.03 * numeric.abs(),
            "param {index}: {numeric} against {}",
            grads[index]
        );
    }
}
