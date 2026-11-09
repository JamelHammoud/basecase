use crate::source::Source;

pub struct Reader<'a> {
    model: &'a dyn Source,
}

fn missing(name: &str) -> String {
    format!("This MuJoCo build has no model field {name}")
}

impl<'a> Reader<'a> {
    pub fn new(model: &'a dyn Source) -> Self {
        Self { model }
    }

    pub fn f64s(&self, name: &str) -> Result<&'a [f64], String> {
        self.model.f64s(name).ok_or_else(|| missing(name))
    }

    pub fn i32s(&self, name: &str) -> Result<&'a [i32], String> {
        self.model.i32s(name).ok_or_else(|| missing(name))
    }

    pub fn f32s(&self, name: &str) -> Result<&'a [f32], String> {
        self.model.f32s(name).ok_or_else(|| missing(name))
    }

    pub fn u8s(&self, name: &str) -> Result<&'a [u8], String> {
        self.model.u8s(name).ok_or_else(|| missing(name))
    }

    pub fn size(&self, name: &str) -> Result<usize, String> {
        self.model
            .size(name)
            .and_then(|v| usize::try_from(v).ok())
            .ok_or_else(|| missing(name))
    }

    pub fn option(&self, name: &str) -> Result<Vec<f64>, String> {
        let values = self.model.option(name);

        if values.is_empty() {
            return Err(format!("This MuJoCo build has no option {name}"));
        }

        Ok(values)
    }

    pub fn scalar(&self, name: &str) -> Result<f64, String> {
        Ok(self.option(name)?[0])
    }

    pub fn flag(&self, name: &str) -> Result<i64, String> {
        Ok(self.scalar(name)? as i64)
    }
}

pub fn vec3(values: &[f64], i: usize) -> [f64; 3] {
    [values[3 * i], values[3 * i + 1], values[3 * i + 2]]
}

pub fn vec4(values: &[f64], i: usize) -> [f64; 4] {
    [values[4 * i], values[4 * i + 1], values[4 * i + 2], values[4 * i + 3]]
}

pub fn vec2(values: &[f64], i: usize) -> [f64; 2] {
    [values[2 * i], values[2 * i + 1]]
}

pub fn vec5(values: &[f64], i: usize) -> [f64; 5] {
    let s = &values[5 * i..5 * i + 5];

    [s[0], s[1], s[2], s[3], s[4]]
}

pub fn index(value: i32) -> Option<usize> {
    usize::try_from(value).ok()
}
