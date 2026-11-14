use crate::geometry::{cross, dist2, polygon_area, sub, Pt, Quad};

const MIN_FILL: f64 = 0.82;
const MAX_COS: f64 = 0.985;
const MIN_SIDE: f64 = 3.0;

fn turn(o: [i32; 2], a: [i32; 2], b: [i32; 2]) -> i64 {
    (a[0] - o[0]) as i64 * (b[1] - o[1]) as i64 - (a[1] - o[1]) as i64 * (b[0] - o[0]) as i64
}

pub fn hull(points: &[[i32; 2]], out: &mut Vec<Pt>, chain: &mut Vec<[i32; 2]>) {
    chain.clear();

    for &p in points.iter() {
        while chain.len() >= 2 && turn(chain[chain.len() - 2], chain[chain.len() - 1], p) <= 0 {
            chain.pop();
        }

        chain.push(p);
    }

    let lower = chain.len() + 1;

    for &p in points.iter().rev().skip(1) {
        while chain.len() >= lower && turn(chain[chain.len() - 2], chain[chain.len() - 1], p) <= 0 {
            chain.pop();
        }

        chain.push(p);
    }

    chain.pop();
    out.clear();
    out.extend(chain.iter().map(|p| [p[0] as f64, p[1] as f64]));
}

fn farthest(hull: &[Pt], from: Pt) -> usize {
    let mut best = 0;

    for i in 1..hull.len() {
        if dist2(hull[i], from) > dist2(hull[best], from) {
            best = i;
        }
    }

    best
}

fn sides(hull: &[Pt], a: usize, c: usize) -> Option<(usize, usize)> {
    let axis = sub(hull[c], hull[a]);
    let (mut b, mut d) = (a, a);
    let (mut hi, mut lo) = (0.0, 0.0);

    for (i, &p) in hull.iter().enumerate() {
        let side = cross(axis, sub(p, hull[a]));

        if side > hi {
            hi = side;
            b = i;
        }

        if side < lo {
            lo = side;
            d = i;
        }
    }

    if b == a || d == a {
        return None;
    }

    Some((b, d))
}

fn triangle(a: Pt, b: Pt, c: Pt) -> f64 {
    cross(sub(b, a), sub(c, a)).abs()
}

fn grow(hull: &[Pt], idx: &mut [usize; 4]) {
    let n = hull.len();

    for _ in 0..3 {
        for k in 0..4 {
            let prev = idx[(k + 3) % 4];
            let next = idx[(k + 1) % 4];
            let mut best = idx[k];
            let mut area = triangle(hull[prev], hull[best], hull[next]);
            let mut j = (prev + 1) % n;

            while j != next {
                let a = triangle(hull[prev], hull[j], hull[next]);

                if a > area {
                    area = a;
                    best = j;
                }

                j = (j + 1) % n;
            }

            idx[k] = best;
        }
    }
}

fn well_shaped(q: &Quad) -> bool {
    for k in 0..4 {
        let a = sub(q[(k + 3) % 4], q[k]);
        let b = sub(q[(k + 1) % 4], q[k]);
        let la = (a[0] * a[0] + a[1] * a[1]).sqrt();
        let lb = (b[0] * b[0] + b[1] * b[1]).sqrt();

        if la < MIN_SIDE || lb < MIN_SIDE || ((a[0] * b[0] + a[1] * b[1]) / (la * lb)).abs() > MAX_COS {
            return false;
        }
    }

    true
}

pub fn fit(hull: &[Pt]) -> Option<Quad> {
    if hull.len() < 4 {
        return None;
    }

    let mut centre = [0.0, 0.0];

    for p in hull {
        centre[0] += p[0] / hull.len() as f64;
        centre[1] += p[1] / hull.len() as f64;
    }

    let a = farthest(hull, centre);
    let c = farthest(hull, hull[a]);
    let (b, d) = sides(hull, a, c)?;
    let mut idx = [a, b, c, d];

    idx.sort_unstable();
    grow(hull, &mut idx);

    let mut q: Quad = [hull[idx[0]], hull[idx[1]], hull[idx[2]], hull[idx[3]]];
    let area = polygon_area(&q);
    let hull_area = polygon_area(hull).abs();

    if hull_area <= 0.0 || area.abs() / hull_area < MIN_FILL || !well_shaped(&q) {
        return None;
    }

    if area < 0.0 {
        q.reverse();
    }

    Some(q)
}
