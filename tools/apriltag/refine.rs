use crate::geometry::{dist2, fit_line, intersect, line_distance, Line, Pt, Quad};
use crate::image::Image;

const STEP: f64 = 0.25;
const MIN_GRADIENT: f64 = 4.0;
const PEAK_WINDOW: i32 = 6;
const MAX_STEPS: usize = 64;
const OUTLIER: f64 = 1.0;

#[derive(Clone, Copy)]
struct Pass {
    range: f64,
    spacing: f64,
    max_points: f64,
}

const COARSE: Pass = Pass { range: 3.5, spacing: 4.0, max_points: 12.0 };
const FINE: Pass = Pass { range: 1.5, spacing: 2.5, max_points: 40.0 };

fn edge_offset(img: &Image, p: Pt, n: Pt, range: f64) -> Option<(f64, f64)> {
    let m = (range / STEP) as i32;
    let mut v = [0.0f64; MAX_STEPS];

    for k in -(m + 1)..=(m + 1) {
        let s = k as f64 * STEP;

        v[(k + m + 1) as usize] = img.sample(p[0] + n[0] * s, p[1] + n[1] * s);
    }

    let grad = |k: i32| v[(k + m + 2) as usize] - v[(k + m) as usize];
    let mut best = -m;

    for k in -m..=m {
        if grad(k) > grad(best) {
            best = k;
        }
    }

    let peak = grad(best);

    if peak < MIN_GRADIENT {
        return None;
    }

    let (mut sum, mut weight) = (0.0, 0.0);

    for k in (best - PEAK_WINDOW).max(-m)..=(best + PEAK_WINDOW).min(m) {
        let g = grad(k).max(0.0);

        sum += g * k as f64 * STEP;
        weight += g;
    }

    Some((sum / weight, peak))
}

fn fit_edge(img: &Image, a: Pt, b: Pt, pass: Pass, points: &mut Vec<[f64; 3]>) -> Option<Line> {
    let d = [b[0] - a[0], b[1] - a[1]];
    let len = (d[0] * d[0] + d[1] * d[1]).sqrt();

    if len < 4.0 {
        return None;
    }

    let n = [d[1] / len, -d[0] / len];
    let count = (len / pass.spacing).clamp(6.0, pass.max_points) as usize;
    let needed = (count * 3 + 3) / 4;

    points.clear();

    for k in 0..count {
        let t = 0.1 + 0.8 * (k as f64 + 0.5) / count as f64;
        let p = [a[0] + d[0] * t, a[1] + d[1] * t];

        if let Some((s, w)) = edge_offset(img, p, n, pass.range) {
            points.push([p[0] + n[0] * s, p[1] + n[1] * s, w]);
        }
    }

    if points.len() < needed {
        return None;
    }

    let line = fit_line(points)?;

    points.retain(|q| line_distance(&line, [q[0], q[1]]) <= OUTLIER);

    if points.len() < needed {
        return None;
    }

    fit_line(points)
}

fn refine_pass(img: &Image, quad: &Quad, pass: Pass, points: &mut Vec<[f64; 3]>) -> Option<Quad> {
    let mut lines = [Line { p: [0.0, 0.0], d: [1.0, 0.0] }; 4];

    for i in 0..4 {
        lines[i] = fit_edge(img, quad[i], quad[(i + 1) % 4], pass, points)?;
    }

    let mut out = *quad;
    let limit = (2.0 * pass.range + 2.0) * (2.0 * pass.range + 2.0);

    for i in 0..4 {
        out[i] = intersect(&lines[(i + 3) % 4], &lines[i])?;

        if dist2(out[i], quad[i]) > limit {
            return None;
        }
    }

    Some(out)
}

pub fn refine(img: &Image, quad: &Quad, points: &mut Vec<[f64; 3]>) -> Option<Quad> {
    let coarse = refine_pass(img, quad, COARSE, points)?;

    refine_pass(img, &coarse, FINE, points)
}
