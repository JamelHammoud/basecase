const NORM_EPSILON: f32 = 1e-5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RowNorm {
    Layer,
    Rms,
}

pub struct NormSets<'a> {
    pub values: &'a mut [f32],
    pub normalized: &'a mut [f32],
    pub inverse: &'a mut [f32],
    pub gain: &'a [f32],
    pub shift: &'a [f32],
}

pub struct UnnormSets<'a> {
    pub gradient: &'a mut [f32],
    pub output: &'a [f32],
    pub normalized: &'a [f32],
    pub inverse: &'a [f32],
    pub gain: &'a [f32],
    pub gain_grads: Option<&'a mut [f32]>,
    pub shift_grads: Option<&'a mut [f32]>,
}

pub fn add_bias(values: &mut [f32], bias: &[f32]) {
    for row in values.chunks_exact_mut(bias.len()) {
        row.iter_mut().zip(bias).for_each(|(v, b)| *v += b);
    }
}

pub fn column_sums(values: &[f32], out: &mut [f32]) {
    out.fill(0.0);

    for row in values.chunks_exact(out.len()) {
        out.iter_mut().zip(row).for_each(|(o, v)| *o += v);
    }
}

const LANES: usize = 8;

fn dot(a: &[f32], b: &[f32]) -> f32 {
    let mut acc = [0.0f32; LANES];
    let (head_a, tail_a) = a.as_chunks::<LANES>();
    let (head_b, tail_b) = b.as_chunks::<LANES>();

    for (x, y) in head_a.iter().zip(head_b) {
        for i in 0..LANES {
            acc[i] += x[i] * y[i];
        }
    }

    acc.iter().sum::<f32>() + tail_a.iter().zip(tail_b).map(|(x, y)| x * y).sum::<f32>()
}

fn sum(a: &[f32]) -> f32 {
    let mut acc = [0.0f32; LANES];
    let (head, tail) = a.as_chunks::<LANES>();

    for x in head {
        for i in 0..LANES {
            acc[i] += x[i];
        }
    }

    acc.iter().sum::<f32>() + tail.iter().sum::<f32>()
}

fn row_center(norm: RowNorm, row: &[f32]) -> f32 {
    match norm {
        RowNorm::Layer => sum(row) / row.len() as f32,
        RowNorm::Rms => 0.0,
    }
}

pub fn normalize_rows(norm: RowNorm, sets: NormSets) {
    let width = sets.gain.len();
    let (gain, shift) = (sets.gain, &sets.shift[..width]);
    let rows = sets
        .values
        .chunks_exact_mut(width)
        .zip(sets.normalized.chunks_exact_mut(width));

    for ((row, normalized), inverse) in rows.zip(sets.inverse.iter_mut()) {
        let center = row_center(norm, row);
        let spread = (dot(row, row) / width as f32 - center * center).max(0.0);
        let scale = 1.0 / (spread + NORM_EPSILON).sqrt();

        *inverse = scale;

        for (((v, n), g), b) in row.iter_mut().zip(normalized.iter_mut()).zip(gain).zip(shift) {
            let unit = (*v - center) * scale;

            *n = unit;
            *v = (unit * g + b).max(0.0);
        }
    }
}

pub fn unnormalize_rows(norm: RowNorm, sets: UnnormSets) {
    let width = sets.gain.len();
    let gain = sets.gain;
    let mut gain_grads = sets.gain_grads;
    let mut shift_grads = sets.shift_grads;

    if let Some(g) = gain_grads.as_deref_mut() {
        g.fill(0.0);
    }

    if let Some(s) = shift_grads.as_deref_mut() {
        s.fill(0.0);
    }

    let rows = sets
        .gradient
        .chunks_exact_mut(width)
        .zip(sets.output.chunks_exact(width))
        .zip(sets.normalized.chunks_exact(width));

    for (((grad, output), unit), inverse) in rows.zip(sets.inverse) {
        grad.iter_mut()
            .zip(output)
            .for_each(|(g, o)| *g = if *o > 0.0 { *g } else { 0.0 });

        if let Some(s) = shift_grads.as_deref_mut() {
            s.iter_mut().zip(grad.iter()).for_each(|(s, g)| *s += g);
        }

        if let Some(gg) = gain_grads.as_deref_mut() {
            gg.iter_mut()
                .zip(grad.iter().zip(unit))
                .for_each(|(a, (g, u))| *a += g * u);
        }

        grad.iter_mut().zip(gain).for_each(|(g, k)| *g *= k);

        let mean_grad = if norm == RowNorm::Layer {
            sum(grad) / width as f32
        } else {
            0.0
        };
        let mean_dot = dot(grad, unit) / width as f32;
        grad.iter_mut()
            .zip(unit)
            .for_each(|(g, u)| *g = inverse * (*g - mean_grad - u * mean_dot));
    }
}
