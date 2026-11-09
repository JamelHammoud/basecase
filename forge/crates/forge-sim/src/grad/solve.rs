use super::dual::Real;
use super::rows::{Kind, Row};

const NEWTON_ITERATIONS: usize = 60;
const LINE_STEPS: usize = 40;
const TOLERANCE: f64 = 1e-13;

pub fn cholesky(a: &mut [f64], n: usize) -> bool {
    for j in 0..n {
        let mut d = a[j * n + j];

        for k in 0..j {
            d -= a[j * n + k] * a[j * n + k];
        }

        if d <= 0.0 || !d.is_finite() {
            return false;
        }

        let d = d.sqrt();

        a[j * n + j] = d;

        for i in j + 1..n {
            let mut s = a[i * n + j];

            for k in 0..j {
                s -= a[i * n + k] * a[j * n + k];
            }

            a[i * n + j] = s / d;
        }
    }

    true
}

pub fn chol_solve<S: Real>(l: &[f64], n: usize, b: &mut [S]) {
    for i in 0..n {
        let mut s = b[i];

        for k in 0..i {
            s -= b[k] * l[i * n + k];
        }

        b[i] = s * (1.0 / l[i * n + i]);
    }

    for i in (0..n).rev() {
        let mut s = b[i];

        for k in i + 1..n {
            s -= b[k] * l[k * n + i];
        }

        b[i] = s * (1.0 / l[i * n + i]);
    }
}

pub fn spd_solve<S: Real>(a: &[S], n: usize, b: &[S]) -> Option<Vec<S>> {
    let mut l = a.to_vec();

    for j in 0..n {
        let mut d = l[j * n + j];

        for k in 0..j {
            d -= l[j * n + k] * l[j * n + k];
        }

        if d.re() <= 0.0 {
            return None;
        }

        let d = d.sqrt();

        l[j * n + j] = d;

        for i in j + 1..n {
            let mut s = l[i * n + j];

            for k in 0..j {
                s -= l[i * n + k] * l[j * n + k];
            }

            l[i * n + j] = s / d;
        }
    }

    let mut x = b.to_vec();

    for i in 0..n {
        for k in 0..i {
            let t = x[k] * l[i * n + k];

            x[i] -= t;
        }

        x[i] = x[i] / l[i * n + i];
    }

    for i in (0..n).rev() {
        for k in i + 1..n {
            let t = x[k] * l[k * n + i];

            x[i] -= t;
        }

        x[i] = x[i] / l[i * n + i];
    }

    Some(x)
}

fn softplus<S: Real>(z: S) -> S {
    let (pos, neg) = if z.re() > 0.0 { (z, -z) } else { (S::c(0.0), z) };

    pos + neg.exp().ln_1p()
}

fn sigmoid<S: Real>(z: S) -> S {
    if z.re() >= 0.0 {
        S::c(1.0) / (S::c(1.0) + (-z).exp())
    } else {
        let e = z.exp();

        e / (S::c(1.0) + e)
    }
}

pub struct Law<S> {
    pub force: S,
    pub weight: f64,
    pub cost: f64,
}

pub fn law<S: Real>(row: &Row<S>, x: S, smoothing: f64) -> Law<S> {
    let d = S::c(1.0) / row.r;
    let (xr, dr) = (x.re(), d.re());
    let zero = S::c(0.0);

    match row.kind {
        Kind::Friction => {
            let f = row.floss;
            let rf = row.r.re() * f.re();

            if xr <= -rf || xr >= rf {
                let sign = if xr <= -rf { 1.0 } else { -1.0 };

                return Law {
                    force: f * sign,
                    weight: 0.0,
                    cost: -(row.r.re() * f.re() * f.re() * 0.5) - sign * f.re() * xr,
                };
            }

            Law {
                force: -(d * x),
                weight: dr,
                cost: dr * xr * xr * 0.5,
            }
        }
        Kind::Contact if smoothing > 0.0 => {
            let width = smoothing * row.r.re();
            let z = -x * (1.0 / width);
            let g = softplus(z) * width;
            let s = sigmoid(z);
            let (gr, sr) = (g.re(), s.re());

            Law {
                force: d * g * s,
                weight: dr * (sr * sr + gr * sr * (1.0 - sr) / width),
                cost: 0.5 * dr * gr * gr,
            }
        }
        _ if xr >= 0.0 => Law {
            force: zero,
            weight: 0.0,
            cost: 0.0,
        },
        _ => Law {
            force: -(d * x),
            weight: dr,
            cost: dr * xr * xr * 0.5,
        },
    }
}

pub fn residual<S: Real>(row: &Row<S>, a: &[S]) -> S {
    row.jac.iter().fold(-row.aref, |s, (d, j)| s + *j * a[*d])
}

pub struct Problem<'a> {
    pub n: usize,
    pub m: &'a [f64],
    pub smooth: &'a [f64],
    pub rows: &'a [Row<f64>],
    pub smoothing: f64,
}

impl Problem<'_> {
    fn energy(&self, a: &[f64]) -> f64 {
        let n = self.n;
        let quad: f64 = (0..n)
            .map(|i| a[i] * (0.5 * (0..n).map(|j| self.m[i * n + j] * a[j]).sum::<f64>() - self.smooth[i]))
            .sum();

        quad + self
            .rows
            .iter()
            .map(|r| law(r, residual(r, a), self.smoothing).cost)
            .sum::<f64>()
    }

    fn gradient_hessian(&self, a: &[f64]) -> (Vec<f64>, Vec<f64>) {
        let n = self.n;
        let mut g: Vec<f64> = (0..n)
            .map(|i| (0..n).map(|j| self.m[i * n + j] * a[j]).sum::<f64>() - self.smooth[i])
            .collect();
        let mut h = self.m.to_vec();

        for row in self.rows {
            let l = law(row, residual(row, a), self.smoothing);

            for (d, j) in &row.jac {
                g[*d] -= j * l.force;

                for (e, k) in &row.jac {
                    h[d * n + e] += l.weight * j * k;
                }
            }
        }

        (g, h)
    }

    fn line_search(&self, a: &[f64], dir: &[f64]) -> Vec<f64> {
        let start = self.energy(a);
        let mut alpha = 1.0;

        for _ in 0..LINE_STEPS {
            let trial: Vec<f64> = a.iter().zip(dir).map(|(x, d)| x + alpha * d).collect();

            if self.energy(&trial) <= start {
                return trial;
            }

            alpha *= 0.5;
        }

        a.to_vec()
    }

    pub fn solve(&self, start: &[f64]) -> Option<(Vec<f64>, Vec<f64>)> {
        let scale = 1.0 + self.smooth.iter().map(|x| x.abs()).fold(0.0, f64::max);
        let mut a = start.to_vec();

        for _ in 0..NEWTON_ITERATIONS {
            let (g, mut h) = self.gradient_hessian(&a);

            if !cholesky(&mut h, self.n) {
                return None;
            }

            if g.iter().map(|x| x.abs()).fold(0.0, f64::max) <= TOLERANCE * scale {
                return Some((a, h));
            }

            let mut dir: Vec<f64> = g.iter().map(|x| -x).collect();

            chol_solve(&h, self.n, &mut dir);

            let next = self.line_search(&a, &dir);

            if next == a {
                return Some((a, h));
            }

            a = next;
        }

        let (_, mut h) = self.gradient_hessian(&a);

        cholesky(&mut h, self.n).then_some((a, h))
    }
}
