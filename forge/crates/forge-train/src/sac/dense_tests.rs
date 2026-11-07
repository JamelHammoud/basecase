use super::{Backward, Dense};
use crate::kernels::Math;
use crate::rng::Rng;
use crate::sac::rows::RowNorm;

const ROWS: usize = 3;
const SIZES: [usize; 4] = [5, 7, 6, 4];

fn weighted_output(net: &Dense, params: &[f32], input: &[f32], weights: &[f32]) -> f64 {
    let math = Math::portable(1);
    let mut cache = net.cache(ROWS);
    let out = net.forward(&math, params, input, &mut cache);

    out.iter().zip(weights).map(|(o, w)| (*o as f64) * (*w as f64)).sum()
}

fn check(norm: RowNorm) {
    let net = Dense::plan(&SIZES, norm);
    let mut rng = Rng::new(3, 0);
    let mut params = net.initialize(&mut rng);

    params.iter_mut().for_each(|p| *p += 0.2 * rng.normal() as f32);

    let input: Vec<f32> = (0..ROWS * SIZES[0]).map(|_| rng.normal() as f32).collect();
    let weights: Vec<f32> = (0..ROWS * SIZES[3]).map(|_| rng.normal() as f32).collect();
    let math = Math::portable(1);
    let mut cache = net.cache(ROWS);
    let mut grads = vec![0.0f32; net.size];

    net.forward(&math, &params, &input, &mut cache);
    net.seed(ROWS, &mut cache).copy_from_slice(&weights);
    net.backward(
        &math,
        Backward {
            params: &params,
            grads: Some(&mut grads),
            input: &input,
            input_gradient: true,
        },
        &mut cache,
    );

    let eps = 3e-4f32;
    let numeric = |values: &mut Vec<f32>, index: usize, f: &dyn Fn(&[f32]) -> f64| {
        let original = values[index];

        values[index] = original + eps;

        let plus = f(values);

        values[index] = original - eps;

        let minus = f(values);

        values[index] = original;

        (plus - minus) / (2.0 * eps as f64)
    };
    let close = |numeric: f64, got: f32| (numeric - got as f64).abs() < 3e-3 + 0.03 * numeric.abs();

    for (index, got) in grads.iter().enumerate() {
        let n = numeric(&mut params.clone(), index, &|p| {
            weighted_output(&net, p, &input, &weights)
        });

        assert!(close(n, *got), "{norm:?} param {index}: {n} against {got}");
    }

    for index in 0..input.len() {
        let n = numeric(&mut input.clone(), index, &|x| {
            weighted_output(&net, &params, x, &weights)
        });
        let got = cache.input_gradient[index];

        assert!(close(n, got), "{norm:?} input {index}: {n} against {got}");
    }
}

#[test]
fn layer_norm_gradients_match_finite_differences() {
    check(RowNorm::Layer);
}

#[test]
fn rms_norm_gradients_match_finite_differences() {
    check(RowNorm::Rms);
}
