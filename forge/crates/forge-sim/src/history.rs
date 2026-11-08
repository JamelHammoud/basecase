use crate::block::History;
use crate::params::MIN_VAL;

fn phys(cursor: usize, n: usize, logical: usize) -> usize {
    (cursor + 1 + logical) % n
}

fn find(times: &[f64], cursor: usize, t: f64) -> usize {
    let n = times.len();

    if t <= times[phys(cursor, n, 0)] {
        return 0;
    }

    if t > times[phys(cursor, n, n - 1)] {
        return n;
    }

    let (mut lo, mut hi) = (0, n - 1);

    while hi - lo > 1 {
        let mid = (lo + hi) / 2;

        if times[phys(cursor, n, mid)] < t {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    hi
}

pub struct Lane<'a> {
    pub times: &'a mut [f64],
    pub values: &'a mut [f64],
    pub cursor: &'a mut usize,
}

impl Lane<'_> {
    pub fn read(&self, t: f64, linear: bool) -> f64 {
        let n = self.times.len();
        let c = *self.cursor;
        let (oldest, newest) = (phys(c, n, 0), phys(c, n, n - 1));

        if t <= self.times[oldest] + MIN_VAL {
            return self.values[oldest];
        }

        if t >= self.times[newest] - MIN_VAL {
            return self.values[newest];
        }

        let i = find(self.times, c, t);
        let hi = phys(c, n, i);

        if (t - self.times[hi]).abs() < MIN_VAL {
            return self.values[hi];
        }

        let lo = phys(c, n, i - 1);

        if !linear {
            return self.values[lo];
        }

        let alpha = (t - self.times[lo]) / (self.times[hi] - self.times[lo]);

        self.values[lo] + alpha * (self.values[hi] - self.values[lo])
    }

    pub fn insert(&mut self, t: f64, value: f64) {
        let n = self.times.len();
        let c = *self.cursor;
        let i = find(self.times, c, t);

        if i < n && (t - self.times[phys(c, n, i)]).abs() < MIN_VAL {
            self.values[phys(c, n, i)] = value;
            return;
        }

        if i == 0 {
            let oldest = phys(c, n, 0);

            self.times[oldest] = t;
            self.values[oldest] = value;
            return;
        }

        if i == n {
            let next = (c + 1) % n;

            *self.cursor = next;
            self.times[next] = t;
            self.values[next] = value;
            return;
        }

        for j in 0..i - 1 {
            let (src, dst) = (phys(c, n, j + 1), phys(c, n, j));

            self.times[dst] = self.times[src];
            self.values[dst] = self.values[src];
        }

        let at = phys(c, n, i - 1);

        self.times[at] = t;
        self.values[at] = value;
    }
}

pub fn lane(h: &mut History, lane: usize) -> Lane<'_> {
    Lane {
        times: &mut h.times[lane],
        values: &mut h.values[lane],
        cursor: &mut h.cursor[lane],
    }
}
