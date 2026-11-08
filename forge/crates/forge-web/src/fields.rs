use forge_ir::{Field, Fields, Source};
use forge_sim::rowmap::RowMap;
use forge_sim::world_params::WorldParams;
use forge_sim::Plan;
use serde_json::{json, Value};
use std::cell::RefCell;

thread_local! {
    static FIELDS: RefCell<Fields> = RefCell::new(Fields::default());
}

pub const F64: u32 = 0;
pub const I32: u32 = 1;
pub const F32: u32 = 2;
pub const U8: u32 = 3;
pub const SIZE: u32 = 4;
pub const OPTION: u32 = 5;
pub const STATE: u32 = 6;
pub const INTEGRATION: u32 = 7;
pub const ABSENT: u32 = 8;

const NAMES: [&str; 7] = [
    "names",
    "name_jntadr",
    "name_actuatoradr",
    "jnt_qposadr",
    "jnt_dofadr",
    "actuator_ctrllimited",
    "actuator_ctrlrange",
];

fn floats(bytes: &[u8]) -> Vec<f64> {
    bytes
        .as_chunks::<8>()
        .0
        .iter()
        .map(|c| f64::from_le_bytes(*c))
        .collect()
}

fn words(bytes: &[u8]) -> Vec<[u8; 4]> {
    bytes.as_chunks::<4>().0.to_vec()
}

fn array(kind: u32, bytes: &[u8]) -> Option<Field> {
    match kind {
        F64 => Some(Field::F64(floats(bytes))),
        I32 => Some(Field::I32(words(bytes).into_iter().map(i32::from_le_bytes).collect())),
        F32 => Some(Field::F32(words(bytes).into_iter().map(f32::from_le_bytes).collect())),
        U8 => Some(Field::U8(bytes.to_vec())),
        _ => None,
    }
}

pub fn set(kind: u32, name: &str, bytes: &[u8]) {
    FIELDS.with_borrow_mut(|f| {
        if let Some(field) = array(kind, bytes) {
            f.set_array(name, field);
            return;
        }

        let values = floats(bytes);
        let first = values.first().copied().unwrap_or(0.0);

        match kind {
            SIZE => f.set_size(name, first as i64),
            OPTION => f.set_option(name, values),
            STATE => f.set_state_size(name.parse().unwrap_or(0), first as usize),
            INTEGRATION => f.set_integration_state(first as i32),
            ABSENT => f.set_absent(name),
            _ => {}
        }
    });
}

fn touch(f: &Fields) -> Result<forge_ir::Kernel, String> {
    for name in NAMES {
        let _ = (f.u8s(name), f.i32s(name), f.f64s(name));
    }

    RowMap::new(f)?;
    WorldParams::new(f, 1)?;
    forge_ir::lower(f).map_err(|r| r.to_string())
}

pub fn prepare() -> Value {
    FIELDS.with_borrow(|f| {
        let lowered = touch(f);
        let missing = f.take_missing();

        if !missing.is_empty() {
            return json!({ "missing": missing });
        }

        match lowered {
            Err(why) => json!({ "refused": why }),
            Ok(kernel) => match forge_sim::wgsl::refusal(&Plan::new(kernel)) {
                Some(why) => json!({ "refused": why }),
                None => json!({ "ready": true }),
            },
        }
    })
}

pub fn take() -> Fields {
    FIELDS.with_borrow_mut(std::mem::take)
}

pub fn reset() {
    FIELDS.with_borrow_mut(|f| *f = Fields::default());
}
