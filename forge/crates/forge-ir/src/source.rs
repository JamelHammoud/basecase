use std::collections::{BTreeMap, BTreeSet};
use std::sync::Mutex;

pub const INTEGRATION_STATE: i32 = 16383;

pub trait Source {
    fn f64s(&self, name: &str) -> Option<&[f64]>;
    fn i32s(&self, name: &str) -> Option<&[i32]>;
    fn f32s(&self, name: &str) -> Option<&[f32]>;
    fn u8s(&self, name: &str) -> Option<&[u8]>;
    fn size(&self, name: &str) -> Option<i64>;
    fn option(&self, name: &str) -> Vec<f64>;
    fn state_size(&self, signature: i32) -> Option<usize>;
    fn integration_state(&self) -> i32;
}

#[derive(Clone, Debug)]
pub enum Field {
    F64(Vec<f64>),
    I32(Vec<i32>),
    F32(Vec<f32>),
    U8(Vec<u8>),
}

#[derive(Debug, Default)]
pub struct Fields {
    arrays: BTreeMap<String, Field>,
    sizes: BTreeMap<String, i64>,
    options: BTreeMap<String, Vec<f64>>,
    states: BTreeMap<i32, usize>,
    integration: Option<i32>,
    absent: BTreeSet<String>,
    asked: Mutex<BTreeSet<String>>,
}

impl Fields {
    pub fn set_array(&mut self, name: &str, field: Field) {
        self.arrays.insert(name.to_owned(), field);
    }

    pub fn set_size(&mut self, name: &str, value: i64) {
        self.sizes.insert(name.to_owned(), value);
    }

    pub fn set_option(&mut self, name: &str, values: Vec<f64>) {
        self.options.insert(name.to_owned(), values);
    }

    pub fn set_state_size(&mut self, signature: i32, size: usize) {
        self.states.insert(signature, size);
    }

    pub fn set_absent(&mut self, key: &str) {
        self.absent.insert(key.to_owned());
    }

    pub fn set_integration_state(&mut self, signature: i32) {
        self.integration = Some(signature);
    }

    pub fn take_missing(&self) -> Vec<String> {
        self.asked
            .lock()
            .map(|mut a| std::mem::take(&mut *a).into_iter().collect())
            .unwrap_or_default()
    }

    fn missed(&self, kind: &str, name: &str) {
        let key = format!("{kind}:{name}");

        if self.absent.contains(&key) {
            return;
        }

        if let Ok(mut asked) = self.asked.lock() {
            asked.insert(key);
        }
    }

    fn array(&self, name: &str) -> Option<&Field> {
        let found = self.arrays.get(name);

        if found.is_none() {
            self.missed("array", name);
        }

        found
    }
}

impl Source for Fields {
    fn f64s(&self, name: &str) -> Option<&[f64]> {
        match self.array(name)? {
            Field::F64(v) => Some(v),
            _ => None,
        }
    }

    fn i32s(&self, name: &str) -> Option<&[i32]> {
        match self.array(name)? {
            Field::I32(v) => Some(v),
            _ => None,
        }
    }

    fn f32s(&self, name: &str) -> Option<&[f32]> {
        match self.array(name)? {
            Field::F32(v) => Some(v),
            _ => None,
        }
    }

    fn u8s(&self, name: &str) -> Option<&[u8]> {
        match self.array(name)? {
            Field::U8(v) => Some(v),
            _ => None,
        }
    }

    fn size(&self, name: &str) -> Option<i64> {
        let found = self.sizes.get(name).copied();

        if found.is_none() {
            self.missed("size", name);
        }

        found
    }

    fn option(&self, name: &str) -> Vec<f64> {
        let found = self.options.get(name).cloned();

        if found.is_none() {
            self.missed("option", name);
        }

        found.unwrap_or_default()
    }

    fn state_size(&self, signature: i32) -> Option<usize> {
        let found = self.states.get(&signature).copied();

        if found.is_none() {
            self.missed("state", &signature.to_string());
        }

        found
    }

    fn integration_state(&self) -> i32 {
        self.integration.unwrap_or(INTEGRATION_STATE)
    }
}

#[cfg(feature = "mujoco")]
impl Source for forge_mujoco::Model {
    fn f64s(&self, name: &str) -> Option<&[f64]> {
        self.array(name)?.f64s()
    }

    fn i32s(&self, name: &str) -> Option<&[i32]> {
        self.array(name)?.i32s()
    }

    fn f32s(&self, name: &str) -> Option<&[f32]> {
        self.array(name)?.f32s()
    }

    fn u8s(&self, name: &str) -> Option<&[u8]> {
        self.array(name)?.u8s()
    }

    fn size(&self, name: &str) -> Option<i64> {
        forge_mujoco::Model::size(self, name)
    }

    fn option(&self, name: &str) -> Vec<f64> {
        forge_mujoco::Model::option(self, name)
    }

    fn state_size(&self, signature: i32) -> Option<usize> {
        Some(forge_mujoco::Model::state_size(self, signature))
    }

    fn integration_state(&self) -> i32 {
        forge_mujoco::integration_state()
    }
}
