use crate::model::{Atom, Expr, Point, State};
use crate::trace::Trace;
use std::f64::consts::{FRAC_PI_2, PI};

const ATAN_TERMS: usize = 12;

fn signal<'a>(trace: &'a Trace, name: &str) -> &'a [f64] {
    trace.signals.get(name).map_or(&[], Vec::as_slice)
}

fn atan_unit(ratio: f64) -> f64 {
    let once = ratio / (1.0 + (1.0 + ratio * ratio).sqrt());
    let twice = once / (1.0 + (1.0 + once * once).sqrt());
    let square = twice * twice;
    let mut term = twice;
    let mut sum = 0.0;
    let mut divisor = 1.0;

    for _ in 0..ATAN_TERMS {
        sum += term / divisor;
        term = -term * square;
        divisor += 2.0;
    }

    4.0 * sum
}

pub fn angle_between(sine: f64, cosine: f64) -> f64 {
    if sine == 0.0 && cosine == 0.0 {
        return f64::NAN;
    }

    if sine <= cosine.abs() {
        let base = atan_unit(sine / cosine.abs());

        return if cosine >= 0.0 { base } else { PI - base };
    }

    FRAC_PI_2 - atan_unit(cosine / sine)
}

fn coordinates<'a>(trace: &'a Trace, point: &Point) -> [&'a [f64]; 3] {
    [
        signal(trace, &point[0]),
        signal(trace, &point[1]),
        signal(trace, &point[2]),
    ]
}

fn at(columns: &[&[f64]; 3], tick: usize) -> [f64; 3] {
    [columns[0][tick], columns[1][tick], columns[2][tick]]
}

fn norm(v: [f64; 3]) -> f64 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn distance(a: [f64; 3], b: [f64; 3]) -> f64 {
    norm([a[0] - b[0], a[1] - b[1], a[2] - b[2]])
}

fn angle(a: [f64; 3], b: [f64; 3]) -> f64 {
    angle_between(norm(cross(a, b)), dot(a, b))
}

fn pairwise(trace: &Trace, points: &[Point; 2], measure: fn([f64; 3], [f64; 3]) -> f64) -> Vec<f64> {
    let first = coordinates(trace, &points[0]);
    let second = coordinates(trace, &points[1]);

    (0..trace.ticks)
        .map(|tick| measure(at(&first, tick), at(&second, tick)))
        .collect()
}

pub fn expr_series(expr: &Expr, trace: &Trace) -> Vec<f64> {
    match expr {
        Expr::Signal(name) => signal(trace, name).to_vec(),
        Expr::Abs(inner) => expr_series(inner, trace).iter().map(|value| value.abs()).collect(),
        Expr::Delta(inner) => {
            let values = expr_series(inner, trace);
            let start = values[0];

            values.iter().map(|value| value - start).collect()
        }
        Expr::Dist(points) => pairwise(trace, points, distance),
        Expr::Angle(points) => pairwise(trace, points, angle),
    }
}

#[derive(Clone, Copy)]
pub struct Polarity {
    pub negated: bool,
    pub adverse: f64,
}

fn atom_series(atom: &Atom, trace: &Trace, polarity: Polarity) -> Vec<f64> {
    let upward = atom.cmp.wants_above() != polarity.negated;

    expr_series(&atom.expr, trace)
        .iter()
        .map(|x| {
            let gap = if upward { x - atom.value } else { atom.value - x };
            let margin = gap / atom.scale;

            if margin.is_finite() {
                margin
            } else {
                polarity.adverse
            }
        })
        .collect()
}

fn lesser(a: f64, b: f64) -> f64 {
    if b < a {
        b
    } else {
        a
    }
}

fn greater(a: f64, b: f64) -> f64 {
    if b > a {
        b
    } else {
        a
    }
}

fn fold(states: &[State], trace: &Trace, polarity: Polarity, pick: fn(f64, f64) -> f64) -> Vec<f64> {
    let mut out: Vec<f64> = Vec::new();

    for item in states {
        let next = state_series(item, trace, polarity);

        if out.is_empty() {
            out = next;
        } else {
            out.iter_mut()
                .zip(next)
                .for_each(|(slot, value)| *slot = pick(*slot, value));
        }
    }

    out
}

pub fn state_series(state: &State, trace: &Trace, polarity: Polarity) -> Vec<f64> {
    match (state, polarity.negated) {
        (State::Atom(atom), _) => atom_series(atom, trace, polarity),
        (State::Not(inner), negated) => state_series(
            inner,
            trace,
            Polarity {
                negated: !negated,
                ..polarity
            },
        ),
        (State::All(items), false) | (State::Any(items), true) => fold(items, trace, polarity, lesser),
        (State::All(items), true) | (State::Any(items), false) => fold(items, trace, polarity, greater),
    }
}
