use super::engine::{Engine, Entry};
use crate::gpu::vectors::{check, inputs, load, CASES};

pub fn qualify(engine: &mut Engine) -> Result<(), String> {
    let inputs = inputs();

    load(&mut engine.io, &inputs);
    engine.dispatch(Entry::Qualify, [CASES as u32, 0, 0])?;
    check(&engine.io, &inputs)
}
