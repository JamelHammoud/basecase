use std::fmt::Write;

#[derive(Default)]
pub struct Emitter {
    pub text: String,
}

pub fn split(x: f64) -> (f32, f32) {
    let hi = x as f32;

    if !hi.is_finite() {
        return (hi, 0.0);
    }

    (hi, (x - f64::from(hi)) as f32)
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
    pub fn define(&mut self, name: &str, value: impl std::fmt::Display) {
        let _ = writeln!(self.text, "#define {name} {value}");
    }

    pub fn constant(&mut self, name: &str, value: f64) {
        let _ = writeln!(self.text, "constant real {name} = {};", real(value));
    }

    fn array(&mut self, kind: &str, name: &str, items: Vec<String>) {
        let body = match (items.is_empty(), kind) {
            (true, "real") => "df{0.0f, 0.0f}".to_owned(),
            (true, _) => "0".to_owned(),
            _ => items.join(","),
        };

        let _ = writeln!(self.text, "constant {kind} {name}[] = {{{body}}};");
    }

    pub fn ints(&mut self, name: &str, values: impl IntoIterator<Item = i64>) {
        self.array("int", name, values.into_iter().map(|v| v.to_string()).collect());
    }

    pub fn floats(&mut self, name: &str, values: impl IntoIterator<Item = f32>) {
        self.array("float", name, values.into_iter().map(float).collect());
    }

    pub fn reals(&mut self, name: &str, values: impl IntoIterator<Item = f64>) {
        self.array("real", name, values.into_iter().map(real).collect());
    }
}

pub fn idx(v: usize) -> i64 {
    v as i64
}

pub fn opt(v: Option<usize>) -> i64 {
    v.map_or(-1, idx)
}
