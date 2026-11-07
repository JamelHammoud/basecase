use crate::rng::Rng;

fn orthonormal_vectors(count: usize, length: usize, rng: &mut Rng) -> Vec<Vec<f64>> {
    let mut basis: Vec<Vec<f64>> = Vec::with_capacity(count);

    while basis.len() < count {
        let mut candidate: Vec<f64> = (0..length).map(|_| rng.normal()).collect();

        for _ in 0..2 {
            for vector in &basis {
                let along: f64 = vector.iter().zip(&candidate).map(|(a, b)| a * b).sum();

                candidate.iter_mut().zip(vector).for_each(|(c, v)| *c -= along * v);
            }
        }

        let norm = candidate.iter().map(|v| v * v).sum::<f64>().sqrt();

        if norm > 1e-9 {
            candidate.iter_mut().for_each(|c| *c /= norm);
            basis.push(candidate);
        }
    }

    basis
}

pub fn orthogonal_by_input(ins: usize, outs: usize, gain: f64, rng: &mut Rng) -> Vec<f32> {
    let mut weights = vec![0.0f32; ins * outs];

    if ins >= outs {
        let rows = orthonormal_vectors(outs, ins, rng);

        for (o, row) in rows.iter().enumerate() {
            for (i, value) in row.iter().enumerate() {
                weights[i * outs + o] = (gain * value) as f32;
            }
        }

        return weights;
    }

    let columns = orthonormal_vectors(ins, outs, rng);

    for (i, column) in columns.iter().enumerate() {
        for (o, value) in column.iter().enumerate() {
            weights[i * outs + o] = (gain * value) as f32;
        }
    }

    weights
}

#[cfg(test)]
mod tests {
    use super::orthogonal_by_input;
    use crate::rng::Rng;

    fn dot_by_output(w: &[f32], ins: usize, outs: usize, a: usize, b: usize) -> f64 {
        (0..ins).map(|i| w[i * outs + a] as f64 * w[i * outs + b] as f64).sum()
    }

    fn dot_by_input(w: &[f32], outs: usize, a: usize, b: usize) -> f64 {
        (0..outs).map(|o| w[a * outs + o] as f64 * w[b * outs + o] as f64).sum()
    }

    #[test]
    fn wide_layers_have_orthonormal_rows() {
        let (ins, outs, gain) = (256, 128, 1.5);
        let w = orthogonal_by_input(ins, outs, gain, &mut Rng::new(1, 0));

        for a in [0, 10, 127] {
            for b in [0, 10, 127] {
                let expected = if a == b { gain * gain } else { 0.0 };

                assert!((dot_by_output(&w, ins, outs, a, b) - expected).abs() < 1e-3);
            }
        }
    }

    #[test]
    fn tall_layers_have_orthonormal_columns() {
        let (ins, outs, gain) = (48, 256, std::f64::consts::SQRT_2);
        let w = orthogonal_by_input(ins, outs, gain, &mut Rng::new(2, 0));

        for a in [0, 20, 47] {
            for b in [0, 20, 47] {
                let expected = if a == b { gain * gain } else { 0.0 };

                assert!((dot_by_input(&w, outs, a, b) - expected).abs() < 1e-3);
            }
        }
    }
}
