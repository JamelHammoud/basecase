use crate::gpu::sink::{split, Sink};
use std::fmt::{Display, Write};

#[derive(Default)]
pub struct Emitter {
    pub text: String,
}

fn float(x: f32) -> String {
    if x.is_nan() {
        return "NAN".to_owned();
    }

    if x.is_infinite() {
        return if x > 0.0 { "INFINITY" } else { "-INFINITY" }.to_owned();
    }

    format!("{x:?}f")
}

pub fn real(x: f64) -> String {
    let (hi, lo) = split(x);

    format!("df{{{}, {}}}", float(hi), float(lo))
}

impl Emitter {
    fn array(&mut self, kind: &str, name: &str, items: Vec<String>) {
        let body = match (items.is_empty(), kind) {
            (true, "real") => "df{0.0f, 0.0f}".to_owned(),
            (true, _) => "0".to_owned(),
            _ => items.join(","),
        };

        let _ = writeln!(self.text, "constant {kind} {name}[] = {{{body}}};");
    }
}

impl Sink for Emitter {
    fn define(&mut self, name: &str, value: impl Display) {
        let _ = writeln!(self.text, "#define {name} {value}");
    }

    fn constant(&mut self, name: &str, value: f64) {
        let _ = writeln!(self.text, "constant real {name} = {};", real(value));
    }

    fn ints(&mut self, name: &str, values: impl IntoIterator<Item = i64>) {
        self.array("int", name, values.into_iter().map(|v| v.to_string()).collect());
    }

    fn floats(&mut self, name: &str, values: impl IntoIterator<Item = f32>) {
        self.array("float", name, values.into_iter().map(float).collect());
    }

    fn reals(&mut self, name: &str, values: impl IntoIterator<Item = f64>) {
        self.array("real", name, values.into_iter().map(real).collect());
    }
}
