use crate::gpu::sink::{split, Sink};
use std::fmt::{Display, Write};

#[derive(Default)]
pub struct WgslSink {
    pub text: String,
    pub ints: Vec<i32>,
    pub reals: Vec<f32>,
}

fn literal(x: f32) -> String {
    assert!(x.is_finite(), "WGSL constants must be finite");

    format!("{x:?}f")
}

impl WgslSink {
    fn offset(&mut self, name: &str, at: usize) {
        let _ = writeln!(self.text, "const {name}: i32 = {at};");
    }

    fn push_real(&mut self, hi: f32, lo: f32) {
        self.reals.push(hi);
        self.reals.push(lo);
    }
}

impl Sink for WgslSink {
    fn define(&mut self, name: &str, value: impl Display) {
        let _ = writeln!(self.text, "const {name}: i32 = {value};");
    }

    fn constant(&mut self, name: &str, value: f64) {
        let (hi, lo) = split(value);
        let _ = writeln!(
            self.text,
            "const {name}: real = real({}, {});",
            literal(hi),
            literal(lo)
        );
    }

    fn ints(&mut self, name: &str, values: impl IntoIterator<Item = i64>) {
        let at = self.ints.len();

        self.offset(name, at);
        self.ints.extend(values.into_iter().map(|v| v as i32));
    }

    fn floats(&mut self, name: &str, values: impl IntoIterator<Item = f32>) {
        let at = self.reals.len() / 2;

        self.offset(name, at);

        for v in values {
            self.push_real(v, 0.0);
        }
    }

    fn reals(&mut self, name: &str, values: impl IntoIterator<Item = f64>) {
        let at = self.reals.len() / 2;

        self.offset(name, at);

        for v in values {
            let (hi, lo) = split(v);

            self.push_real(hi, lo);
        }
    }
}
