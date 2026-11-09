use std::fmt::Display;

pub trait Sink {
    fn define(&mut self, name: &str, value: impl Display);
    fn constant(&mut self, name: &str, value: f64);
    fn ints(&mut self, name: &str, values: impl IntoIterator<Item = i64>);
    fn floats(&mut self, name: &str, values: impl IntoIterator<Item = f32>);
    fn reals(&mut self, name: &str, values: impl IntoIterator<Item = f64>);
}

pub fn split(x: f64) -> (f32, f32) {
    let hi = x as f32;

    if !hi.is_finite() {
        return (hi, 0.0);
    }

    (hi, (x - f64::from(hi)) as f32)
}

pub fn idx(v: usize) -> i64 {
    v as i64
}

pub fn opt(v: Option<usize>) -> i64 {
    v.map_or(-1, idx)
}
