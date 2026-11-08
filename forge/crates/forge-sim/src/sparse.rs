use crate::lanes::{ONE, V, ZERO};
use crate::params::MIN_VAL;

#[derive(Clone, Debug)]
struct Row {
    index: usize,
    start: usize,
    diag: usize,
    ops: std::ops::Range<usize>,
}

#[derive(Clone, Debug)]
struct Update {
    adr: usize,
    target: usize,
    len: usize,
}

#[derive(Clone, Debug)]
pub struct Pattern {
    rows: Vec<Row>,
    updates: Vec<Update>,
    col: Vec<usize>,
    starts: Vec<usize>,
    diags: Vec<usize>,
}

impl Pattern {
    pub fn new(adr: &[usize], nnz: &[usize], col: &[usize]) -> Self {
        let nv = adr.len();
        let mut rows = Vec::with_capacity(nv);
        let mut updates = Vec::new();

        for k in (0..nv).rev() {
            let (start, diag) = (adr[k], adr[k] + nnz[k] - 1);
            let first = updates.len();

            for a in (start..diag).rev() {
                let i = col[a];

                updates.push(Update {
                    adr: a,
                    target: adr[i],
                    len: nnz[i],
                });
            }

            rows.push(Row {
                index: k,
                start,
                diag,
                ops: first..updates.len(),
            });
        }

        Self {
            rows,
            updates,
            col: col.to_vec(),
            starts: adr.to_vec(),
            diags: (0..nv).map(|k| adr[k] + nnz[k] - 1).collect(),
        }
    }

    #[inline(never)]
    pub fn factor(&self, mat: &mut [V], diag_inv: &mut [V]) {
        let floor = V::splat(MIN_VAL);

        for row in &self.rows {
            let d = mat[row.diag];
            let pivot = d.lt(floor).select(floor, d);
            let inv = ONE / pivot;

            mat[row.diag] = pivot;
            diag_inv[row.index] = inv;

            let (head, tail) = mat.split_at_mut(row.start);

            for u in &self.updates[row.ops.clone()] {
                let s = tail[u.adr - row.start] * inv;

                for (t, src) in head[u.target..u.target + u.len].iter_mut().zip(&tail[..u.len]) {
                    *t -= *src * s;
                }
            }

            for v in &mut tail[..row.diag - row.start] {
                *v *= inv;
            }
        }
    }

    #[inline(never)]
    pub fn solve(&self, ld: &[V], diag_inv: &[V], x: &mut [V]) {
        let nv = self.starts.len();

        for i in (0..nv).rev() {
            let xi = x[i];
            let (s, d) = (self.starts[i], self.diags[i]);

            for (l, &c) in ld[s..d].iter().zip(&self.col[s..d]) {
                x[c] -= *l * xi;
            }
        }

        for (v, inv) in x.iter_mut().zip(diag_inv) {
            *v *= *inv;
        }

        for i in 0..nv {
            let (s, d) = (self.starts[i], self.diags[i]);
            let mut acc = ZERO;

            for (l, &c) in ld[s..d].iter().zip(&self.col[s..d]) {
                acc += *l * x[c];
            }

            x[i] -= acc;
        }
    }

    pub fn mul_sym(&self, mat: &[V], x: &[V], out: &mut [V]) {
        let nv = self.starts.len();

        for i in 0..nv {
            out[i] = mat[self.diags[i]] * x[i];
        }

        for i in 0..nv {
            let (s, d) = (self.starts[i], self.diags[i]);
            let xi = x[i];
            let mut acc = ZERO;

            for (m, &c) in mat[s..d].iter().zip(&self.col[s..d]) {
                acc += *m * x[c];
                out[c] += *m * xi;
            }

            out[i] += acc;
        }
    }
}
