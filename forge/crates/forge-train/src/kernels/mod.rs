#[cfg(target_os = "macos")]
mod accelerate;
mod rows;
#[cfg(test)]
mod tests;

use crate::elu;
use crate::pool::{Pool, SharedSlice};
use rows::{multiply_rows, transposed_rows};

#[derive(Clone, Copy, Debug)]
pub struct Shape {
    pub rows: usize,
    pub inner: usize,
    pub cols: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Backend {
    #[cfg(target_os = "macos")]
    Accelerate,
    Portable,
}

pub struct Math {
    backend: Backend,
    pool: Pool,
}

const MIN_MACS_PER_THREAD: usize = 40_000;

fn task_ranges(items: usize, tasks: usize) -> impl Fn(usize) -> (usize, usize) {
    move |task| (task * items / tasks, (task + 1) * items / tasks)
}

impl Math {
    pub fn portable(threads: usize) -> Self {
        Self {
            backend: Backend::Portable,
            pool: Pool::new(threads),
        }
    }

    #[cfg(target_os = "macos")]
    pub fn native(threads: usize) -> Self {
        if std::env::var_os("FORGE_PORTABLE_MATH").is_some() {
            return Self::portable(threads);
        }

        Self {
            backend: Backend::Accelerate,
            pool: Pool::new(1),
        }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn native(threads: usize) -> Self {
        Self::portable(threads)
    }

    pub fn threads(&self) -> usize {
        self.pool.threads()
    }

    fn tasks_for(&self, items: usize, macs: usize) -> usize {
        (macs / MIN_MACS_PER_THREAD).clamp(1, (2 * self.pool.threads()).min(items.max(1)))
    }

    pub fn multiply(&self, out: &mut [f32], a: &[f32], b: &[f32], shape: Shape) {
        let Shape { rows, inner, cols } = shape;

        assert!(out.len() == rows * cols && a.len() == rows * inner && b.len() == inner * cols);

        #[cfg(target_os = "macos")]
        if self.backend == Backend::Accelerate {
            return accelerate::multiply(out, a, b, shape);
        }

        let tasks = self.tasks_for(rows, rows * inner * cols);
        let range = task_ranges(rows, tasks);
        let shared = SharedSlice::new(out);

        self.pool.run(tasks, |task| {
            let (from, to) = range(task);
            let chunk = unsafe { shared.range(from * cols, to * cols) };

            multiply_rows(chunk, &a[from * inner..to * inner], b, shape);
        });
    }

    pub fn multiply_by_transpose(&self, out: &mut [f32], g: &[f32], w: &[f32], shape: Shape, scratch: &mut [f32]) {
        let Shape { rows, inner, cols } = shape;

        assert!(out.len() == rows * inner && g.len() == rows * cols && w.len() == inner * cols);

        #[cfg(target_os = "macos")]
        if self.backend == Backend::Accelerate {
            return accelerate::multiply_by_transpose(out, g, w, shape);
        }

        for k in 0..inner {
            for c in 0..cols {
                scratch[c * inner + k] = w[k * cols + c];
            }
        }

        self.multiply(
            out,
            g,
            &scratch[..inner * cols],
            Shape {
                rows,
                inner: cols,
                cols: inner,
            },
        );
    }

    pub fn transpose_multiply(&self, out: &mut [f32], a: &[f32], g: &[f32], shape: Shape) {
        let Shape { rows, inner, cols } = shape;

        assert!(out.len() == inner * cols && a.len() == rows * inner && g.len() == rows * cols);

        #[cfg(target_os = "macos")]
        if self.backend == Backend::Accelerate {
            return accelerate::transpose_multiply(out, a, g, shape);
        }

        let tasks = self.tasks_for(inner, rows * inner * cols);
        let range = task_ranges(inner, tasks);
        let shared = SharedSlice::new(out);

        self.pool.run(tasks, |task| {
            let (from, to) = range(task);
            let chunk = unsafe { shared.range(from * cols, to * cols) };

            transposed_rows(chunk, from, a, g, shape);
        });
    }

    pub fn serial(&self) -> Self {
        Self {
            backend: self.backend,
            pool: Pool::new(1),
        }
    }

    pub fn bias_elu(&self, values: &mut [f32], bias: &[f32], slopes: &mut [f32]) {
        let width = bias.len();
        let rows = values.len() / width;
        let tasks = self.tasks_for(rows, values.len() * 8);
        let range = task_ranges(rows, tasks);
        let shared_values = SharedSlice::new(values);
        let shared_slopes = SharedSlice::new(slopes);

        self.pool.run(tasks, |task| {
            let (from, to) = range(task);
            let v = unsafe { shared_values.range(from * width, to * width) };
            let s = unsafe { shared_slopes.range(from * width, to * width) };

            elu::apply_with_bias(v, bias, s);
        });
    }
}
