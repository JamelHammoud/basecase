pub struct Normalizer {
    pub mean: Vec<f64>,
    pub var: Vec<f64>,
    count: f64,
    batch_mean: Vec<f64>,
    batch_var: Vec<f64>,
}

const CLIP: f64 = 5.0;

impl Normalizer {
    pub fn new(size: usize) -> Self {
        Self {
            mean: vec![0.0; size],
            var: vec![1.0; size],
            count: 1e-4,
            batch_mean: vec![0.0; size],
            batch_var: vec![0.0; size],
        }
    }

    pub fn std(&self) -> Vec<f64> {
        self.var.iter().map(|v| (v + 1e-8).sqrt()).collect()
    }

    pub fn update(&mut self, batch: &[f32]) {
        let size = self.mean.len();
        let rows = batch.len() / size;

        self.batch_mean.fill(0.0);
        self.batch_var.fill(0.0);

        for row in batch.chunks_exact(size) {
            self.batch_mean.iter_mut().zip(row).for_each(|(m, x)| *m += *x as f64);
        }

        self.batch_mean.iter_mut().for_each(|m| *m /= rows as f64);

        for row in batch.chunks_exact(size) {
            for ((v, x), m) in self.batch_var.iter_mut().zip(row).zip(&self.batch_mean) {
                let off = *x as f64 - m;

                *v += off * off;
            }
        }

        self.batch_var.iter_mut().for_each(|v| *v /= rows as f64);

        let incoming = rows as f64;
        let total = self.count + incoming;

        for i in 0..size {
            let delta = self.batch_mean[i] - self.mean[i];

            self.mean[i] += delta * incoming / total;
            self.var[i] = (self.var[i] * self.count
                + self.batch_var[i] * incoming
                + delta * delta * self.count * incoming / total)
                / total;
        }

        self.count = total;
    }

    pub fn apply(&self, batch: &[f32], out: &mut [f32]) {
        let size = self.mean.len();
        let std = self.std();

        for (row, target) in batch.chunks_exact(size).zip(out.chunks_exact_mut(size)) {
            for i in 0..size {
                target[i] = ((row[i] as f64 - self.mean[i]) / std[i]).clamp(-CLIP, CLIP) as f32;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Normalizer;

    #[test]
    fn tracks_the_running_mean_and_variance() {
        let mut norm = Normalizer::new(1);
        let all: Vec<f32> = (0..1000).map(|i| (i % 10) as f32).collect();

        for chunk in all.chunks(64) {
            norm.update(chunk);
        }

        assert!((norm.mean[0] - 4.5).abs() < 1e-3);
        assert!((norm.var[0] - 8.25).abs() < 1e-2);
    }

    #[test]
    fn applying_clips_to_five_deviations() {
        let norm = Normalizer::new(1);
        let mut out = [0.0f32; 2];

        norm.apply(&[100.0, -100.0], &mut out);

        assert_eq!(out, [5.0, -5.0]);
    }
}
