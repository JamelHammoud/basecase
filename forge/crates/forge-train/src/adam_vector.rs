use crate::adam::Adam;
use crate::kernels::Math;
use crate::mlp::{BackwardSets, Mlp};
use crate::rng::Rng;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

const SIZES: [usize; 4] = [12, 64, 32, 4];
const ROWS: usize = 64;
const STEPS: usize = 50;
const LEARN_RATE: f32 = 1e-3;
const BIAS_SPREAD: f64 = 0.1;
const SEED: u64 = 7;

fn layers_json(net: &Mlp, params: &[f32]) -> Value {
    let layers = net
        .layers
        .iter()
        .map(|layer| {
            json!({
                "in": layer.ins,
                "out": layer.outs,
                "w": net.weights_by_output(params, layer),
                "b": &params[layer.bias_at..layer.bias_at + layer.outs],
            })
        })
        .collect();

    Value::Array(layers)
}

fn rows_json(values: &[f32], width: usize) -> Value {
    Value::Array(values.chunks_exact(width).map(|row| json!(row)).collect())
}

fn normals(rng: &mut Rng, count: usize, spread: f64) -> Vec<f32> {
    (0..count).map(|_| (rng.normal() * spread) as f32).collect()
}

pub fn adam_vector() -> Value {
    let net = Mlp::plan(&SIZES, 0);
    let mut rng = Rng::new(SEED, 0);
    let mut params = vec![0.0f32; net.param_end()];

    net.initialize(&mut params, 1.0, &mut rng);

    for layer in &net.layers {
        let bias = normals(&mut rng, layer.outs, BIAS_SPREAD);

        params[layer.bias_at..layer.bias_at + layer.outs].copy_from_slice(&bias);
    }

    let (nin, nout) = (SIZES[0], SIZES[SIZES.len() - 1]);
    let x = normals(&mut rng, ROWS * nin, 1.0);
    let y = normals(&mut rng, ROWS * nout, 1.0);
    let initial = layers_json(&net, &params);
    let math = Math::native(1);
    let mut scratch = net.scratch(ROWS);
    let mut grads = vec![0.0f32; params.len()];
    let mut adam = Adam::new(params.len());
    let scale = 2.0 / (ROWS * nout) as f32;

    for _ in 0..STEPS {
        net.forward(&math, &params, &x, ROWS, &mut scratch);

        let (out, seed) = net.output_and_seed(ROWS, &mut scratch);

        for ((s, o), t) in seed.iter_mut().zip(out).zip(&y) {
            *s = (o - t) * scale;
        }

        let sets = BackwardSets {
            params: &params,
            grads: &mut grads,
            input: &x,
        };

        net.backward(&math, sets, ROWS, &mut scratch);
        adam.step(&mut params, &grads, LEARN_RATE);
    }

    json!({
        "initial": initial,
        "lr": LEARN_RATE,
        "x": rows_json(&x, nin),
        "y": rows_json(&y, nout),
        "steps": STEPS,
        "final": layers_json(&net, &params),
    })
}

pub fn write_adam_vector(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Couldn't create {}: {e}", parent.display()))?;
    }

    fs::write(path, adam_vector().to_string()).map_err(|e| format!("Couldn't write {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::adam_vector;
    use crate::elu;
    use serde_json::Value;

    fn numbers(value: &Value) -> Vec<f64> {
        value
            .as_array()
            .expect("list")
            .iter()
            .map(|v| v.as_f64().expect("number"))
            .collect()
    }

    fn predict(layers: &[Value], input: Vec<f64>) -> Vec<f64> {
        let mut values = input;

        for (index, layer) in layers.iter().enumerate() {
            let ins = values.len();
            let w = numbers(&layer["w"]);
            let mut next = numbers(&layer["b"]);

            for (o, out) in next.iter_mut().enumerate() {
                *out += (0..ins).map(|i| w[o * ins + i] * values[i]).sum::<f64>();
            }

            if index + 1 < layers.len() {
                next.iter_mut().for_each(|v| *v = elu::exact(*v as f32) as f64);
            }

            values = next;
        }

        values
    }

    fn mse(vector: &Value, key: &str) -> f64 {
        let layers = vector[key].as_array().expect("layers");
        let rows = vector["x"]
            .as_array()
            .expect("x")
            .iter()
            .zip(vector["y"].as_array().expect("y"));
        let errors: Vec<f64> = rows
            .flat_map(|(x, y)| {
                predict(layers, numbers(x))
                    .into_iter()
                    .zip(numbers(y))
                    .map(|(p, t)| (p - t) * (p - t))
            })
            .collect();

        errors.iter().sum::<f64>() / errors.len() as f64
    }

    #[test]
    fn fifty_adam_steps_lower_the_loss() {
        let vector = adam_vector();
        let before = mse(&vector, "initial");
        let after = mse(&vector, "final");

        assert!(after < 0.9 * before, "{before} to {after}");
    }
}
