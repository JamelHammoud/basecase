use crate::lanes::{V, ZERO};

pub const MIN_VAL: f64 = 1e-15;
pub const MIN_IMP: f64 = 0.0001;
pub const MAX_IMP: f64 = 0.9999;

#[derive(Clone, Debug)]
pub struct Imp {
    pub solimp: [f64; 5],
    pub k: f64,
    pub b: f64,
}

pub fn solref_safe(solref: [f64; 2], dt: f64, refsafe: bool) -> [f64; 2] {
    let mut r = if (solref[0] > 0.0) ^ (solref[1] > 0.0) {
        [0.02, 1.0]
    } else {
        solref
    };

    if refsafe && r[0] > 0.0 {
        r[0] = r[0].max(2.0 * dt);
    }

    r
}

impl Imp {
    pub fn new(solimp: [f64; 5], solref: [f64; 2]) -> Self {
        let s = [
            solimp[0].clamp(MIN_IMP, MAX_IMP),
            solimp[1].clamp(MIN_IMP, MAX_IMP),
            solimp[2].max(0.0),
            solimp[3].clamp(MIN_IMP, MAX_IMP),
            solimp[4].max(1.0),
        ];
        let k = if solref[0] > 0.0 {
            1.0 / (s[1] * s[1] * solref[0] * solref[0] * solref[1] * solref[1]).max(MIN_VAL)
        } else {
            -solref[0] / (s[1] * s[1]).max(MIN_VAL)
        };
        let b = if solref[1] > 0.0 {
            2.0 / (s[1] * solref[0]).max(MIN_VAL)
        } else {
            -solref[1] / s[1].max(MIN_VAL)
        };

        Self { solimp: s, k, b }
    }

    pub fn flat(&self) -> bool {
        self.solimp[0] == self.solimp[1] || self.solimp[2] <= MIN_VAL
    }
}

fn power(a: f64, b: f64) -> f64 {
    if b == 1.0 {
        a
    } else if b == 2.0 {
        a * a
    } else {
        a.powf(b)
    }
}

pub fn impedance(s: &[f64; 5], pos: f64, margin: f64) -> (f64, f64) {
    if s[0] == s[1] || s[2] <= MIN_VAL {
        return (0.5 * (s[0] + s[1]), 0.0);
    }

    let x = ((pos - margin) / s[2]).abs();

    if x >= 1.0 || x <= 0.0 {
        return (if x >= 1.0 { s[1] } else { s[0] }, 0.0);
    }

    let y = if s[4] == 1.0 {
        x
    } else if x <= s[3] {
        let a = 1.0 / power(s[3], s[4] - 1.0);

        a * power(x, s[4])
    } else {
        let b = 1.0 / power(1.0 - s[3], s[4] - 1.0);

        1.0 - b * power(1.0 - x, s[4])
    };

    (s[0] + y * (s[1] - s[0]), 0.0)
}

pub fn impedance_v(imp: &Imp, pos: V, margin: V) -> V {
    let s = &imp.solimp;

    if imp.flat() {
        return V::splat(0.5 * (s[0] + s[1]));
    }

    if s[4] == 2.0 {
        return impedance_square(s, pos, margin);
    }

    let mut out = ZERO;

    for i in 0..crate::lanes::LANES {
        out.0[i] = impedance(s, pos.0[i], margin.0[i]).0;
    }

    out
}

fn impedance_square(s: &[f64; 5], pos: V, margin: V) -> V {
    let x = ((pos - margin) / s[2]).abs();
    let a = 1.0 / s[3];
    let b = 1.0 / (1.0 - s[3]);
    let low = x * x * a;
    let one_minus = V::splat(1.0) - x;
    let high = V::splat(1.0) - one_minus * one_minus * b;
    let y = x.le(V::splat(s[3])).select(low, high);
    let inner = V::splat(s[0]) + y * (s[1] - s[0]);
    let saturated = x.ge(V::splat(1.0)).select(V::splat(s[1]), V::splat(s[0]));
    let edge = x.ge(V::splat(1.0)).or(x.le(ZERO));

    edge.select(saturated, inner)
}
