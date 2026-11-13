use crate::physics::Physics;
use crate::robot::{ModelRef, Robot};

pub struct EyeRays;

impl EyeRays {
    pub fn new(_robot: &Robot, _count: usize, _threads: usize) -> Self {
        Self
    }

    pub fn see_all(&mut self, _model: &ModelRef, _batch: &mut Physics) {}

    pub fn see_one(&mut self, _model: &ModelRef, _batch: &mut Physics, _sim: usize) {}

    pub fn values(&self, _sim: usize) -> &[f32] {
        &[]
    }
}
