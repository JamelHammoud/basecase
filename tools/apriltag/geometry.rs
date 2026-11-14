pub type Pt = [f64; 2];
pub type Quad = [Pt; 4];

#[inline]
pub fn sub(a: Pt, b: Pt) -> Pt {
    [a[0] - b[0], a[1] - b[1]]
}

#[inline]
pub fn cross(a: Pt, b: Pt) -> f64 {
    a[0] * b[1] - a[1] * b[0]
}

#[inline]
pub fn dist2(a: Pt, b: Pt) -> f64 {
    let d = sub(a, b);

    d[0] * d[0] + d[1] * d[1]
}

pub fn polygon_area(points: &[Pt]) -> f64 {
    let n = points.len();
    let mut sum = 0.0;

    for i in 0..n {
        sum += cross(points[i], points[(i + 1) % n]);
    }

    sum * 0.5
}

#[derive(Clone, Copy)]
pub struct Line {
    pub p: Pt,
    pub d: Pt,
}

pub fn fit_line(points: &[[f64; 3]]) -> Option<Line> {
    let mut sw = 0.0;
    let mut sx = 0.0;
    let mut sy = 0.0;

    for p in points {
        sw += p[2];
        sx += p[0] * p[2];
        sy += p[1] * p[2];
    }

    if sw <= 0.0 {
        return None;
    }

    let (cx, cy) = (sx / sw, sy / sw);
    let (mut a, mut b, mut c) = (0.0, 0.0, 0.0);

    for p in points {
        let (dx, dy) = (p[0] - cx, p[1] - cy);

        a += dx * dx * p[2];
        b += dx * dy * p[2];
        c += dy * dy * p[2];
    }

    let half = (a - c) * 0.5;
    let lambda = (a + c) * 0.5 + (half * half + b * b).sqrt();
    let v1 = [b, lambda - a];
    let v2 = [lambda - c, b];
    let v = if v1[0].abs() + v1[1].abs() > v2[0].abs() + v2[1].abs() { v1 } else { v2 };
    let len = (v[0] * v[0] + v[1] * v[1]).sqrt();

    if len < 1e-12 {
        return None;
    }

    Some(Line { p: [cx, cy], d: [v[0] / len, v[1] / len] })
}

pub fn line_distance(line: &Line, p: Pt) -> f64 {
    cross(line.d, sub(p, line.p)).abs()
}

pub fn intersect(a: &Line, b: &Line) -> Option<Pt> {
    let det = cross(a.d, b.d);

    if det.abs() < 1e-6 {
        return None;
    }

    let t = cross(sub(b.p, a.p), b.d) / det;

    Some([a.p[0] + t * a.d[0], a.p[1] + t * a.d[1]])
}

pub struct Homography([f64; 8]);

impl Homography {
    pub fn from_square(quad: &Quad) -> Option<Homography> {
        const SQUARE: [Pt; 4] = [[-1.0, -1.0], [1.0, -1.0], [1.0, 1.0], [-1.0, 1.0]];
        let mut m = [[0.0f64; 9]; 8];

        for k in 0..4 {
            let [u, v] = SQUARE[k];
            let [x, y] = quad[k];

            m[2 * k] = [u, v, 1.0, 0.0, 0.0, 0.0, -u * x, -v * x, x];
            m[2 * k + 1] = [0.0, 0.0, 0.0, u, v, 1.0, -u * y, -v * y, y];
        }

        solve8(&mut m).map(Homography)
    }

    #[inline]
    pub fn map(&self, u: f64, v: f64) -> Pt {
        let h = &self.0;
        let z = h[6] * u + h[7] * v + 1.0;

        [(h[0] * u + h[1] * v + h[2]) / z, (h[3] * u + h[4] * v + h[5]) / z]
    }
}

fn solve8(m: &mut [[f64; 9]; 8]) -> Option<[f64; 8]> {
    for col in 0..8 {
        let mut pivot = col;

        for row in col + 1..8 {
            if m[row][col].abs() > m[pivot][col].abs() {
                pivot = row;
            }
        }

        if m[pivot][col].abs() < 1e-12 {
            return None;
        }

        m.swap(col, pivot);

        for row in 0..8 {
            if row == col {
                continue;
            }

            let f = m[row][col] / m[col][col];

            for k in col..9 {
                m[row][k] -= f * m[col][k];
            }
        }
    }

    let mut out = [0.0; 8];

    for i in 0..8 {
        out[i] = m[i][8] / m[i][i];
    }

    Some(out)
}
