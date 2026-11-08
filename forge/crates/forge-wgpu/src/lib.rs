mod device;
mod run;

pub use device::{Access, Gpu, Program};
pub use run::Target;

#[derive(Clone, Copy, Debug, Default)]
pub struct Timing {
    pub seconds: f64,
}
