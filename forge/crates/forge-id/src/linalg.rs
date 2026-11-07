pub struct Square {
    pub size: usize,
    pub values: Vec<f64>,
}

impl Square {
    pub fn zeros(size: usize) -> Self {
        Self {
            size,
            values: vec![0.0; size * size],
        }
    }

    pub fn at(&self, row: usize, col: usize) -> f64 {
        self.values[row * self.size + col]
    }

    pub fn set(&mut self, row: usize, col: usize, value: f64) {
        self.values[row * self.size + col] = value;
    }

    pub fn gram(columns: &[Vec<f64>]) -> Self {
        let size = columns.len();
        let mut out = Self::zeros(size);

        for a in 0..size {
            for b in a..size {
                let dot: f64 = columns[a].iter().zip(&columns[b]).map(|(x, y)| x * y).sum();

                out.set(a, b, dot);
                out.set(b, a, dot);
            }
        }

        out
    }

    pub fn solve_cholesky(&self, rhs: &[f64]) -> Option<Vec<f64>> {
        let n = self.size;
        let mut lower = Self::zeros(n);

        for i in 0..n {
            for j in 0..=i {
                let partial: f64 = (0..j).map(|k| lower.at(i, k) * lower.at(j, k)).sum();
                let value = self.at(i, j) - partial;

                if i == j && value <= 0.0 {
                    return None;
                }

                let entry = if i == j { value.sqrt() } else { value / lower.at(j, j) };

                lower.set(i, j, entry);
            }
        }

        let mut forward = vec![0.0; n];

        for i in 0..n {
            let partial: f64 = (0..i).map(|k| lower.at(i, k) * forward[k]).sum();

            forward[i] = (rhs[i] - partial) / lower.at(i, i);
        }

        let mut solution = vec![0.0; n];

        for i in (0..n).rev() {
            let partial: f64 = (i + 1..n).map(|k| lower.at(k, i) * solution[k]).sum();

            solution[i] = (forward[i] - partial) / lower.at(i, i);
        }

        Some(solution)
    }

    fn rotate(&mut self, vectors: &mut Square, p: usize, q: usize) {
        let n = self.size;
        let apq = self.at(p, q);

        if apq.abs() < 1e-300 {
            return;
        }

        let theta = (self.at(q, q) - self.at(p, p)) / (2.0 * apq);
        let t = theta.signum() / (theta.abs() + (theta * theta + 1.0).sqrt());
        let t = if theta == 0.0 { 1.0 } else { t };
        let c = 1.0 / (t * t + 1.0).sqrt();
        let s = t * c;

        for k in 0..n {
            let (akp, akq) = (self.at(k, p), self.at(k, q));

            self.set(k, p, c * akp - s * akq);
            self.set(k, q, s * akp + c * akq);
        }

        for k in 0..n {
            let (apk, aqk) = (self.at(p, k), self.at(q, k));

            self.set(p, k, c * apk - s * aqk);
            self.set(q, k, s * apk + c * aqk);
        }

        for k in 0..n {
            let (vkp, vkq) = (vectors.at(k, p), vectors.at(k, q));

            vectors.set(k, p, c * vkp - s * vkq);
            vectors.set(k, q, s * vkp + c * vkq);
        }
    }

    pub fn symmetric_eigen(&self) -> (Vec<f64>, Square) {
        let n = self.size;
        let mut work = Square {
            size: n,
            values: self.values.clone(),
        };
        let mut vectors = Square::zeros(n);

        (0..n).for_each(|i| vectors.set(i, i, 1.0));

        for _ in 0..100 {
            let off: f64 = (0..n)
                .flat_map(|i| (0..n).filter(move |j| *j != i).map(move |j| (i, j)))
                .map(|(i, j)| work.at(i, j).powi(2))
                .sum();

            if off < 1e-30 {
                break;
            }

            for p in 0..n {
                for q in p + 1..n {
                    work.rotate(&mut vectors, p, q);
                }
            }
        }

        ((0..n).map(|i| work.at(i, i)).collect(), vectors)
    }
}

#[cfg(test)]
mod tests {
    use super::Square;

    #[test]
    fn cholesky_solves_a_symmetric_system() {
        let m = Square {
            size: 2,
            values: vec![4.0, 1.0, 1.0, 3.0],
        };
        let x = m.solve_cholesky(&[1.0, 2.0]).expect("positive definite");

        assert!((4.0 * x[0] + x[1] - 1.0).abs() < 1e-12);
        assert!((x[0] + 3.0 * x[1] - 2.0).abs() < 1e-12);
    }

    #[test]
    fn eigen_reconstructs_the_matrix() {
        let m = Square {
            size: 3,
            values: vec![2.0, 1.0, 0.0, 1.0, 2.0, 1.0, 0.0, 1.0, 2.0],
        };
        let (values, vectors) = m.symmetric_eigen();

        for i in 0..3 {
            for j in 0..3 {
                let rebuilt: f64 = (0..3).map(|k| vectors.at(i, k) * values[k] * vectors.at(j, k)).sum();

                assert!((rebuilt - m.at(i, j)).abs() < 1e-9);
            }
        }
    }
}
