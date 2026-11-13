use super::arm::{seeded_start, Reading};
use crate::joint::Hidden;
use plant_bam::SplitMix;

pub const WHEEL_RADIUS_M: f64 = 0.033;
pub const WHEEL_SEPARATION_M: f64 = 0.160;
pub const LINEAR_ACCEL: f64 = 1.0;
pub const ANGULAR_ACCEL: f64 = 4.0;
pub const CMD_VEL_TIMEOUT_US: u64 = 500_000;
const STEP_S: f64 = 0.001;

fn toward(current: f64, target: f64, most: f64) -> f64 {
    current + (target - current).clamp(-most, most)
}

pub struct Base {
    forward: f64,
    turn: f64,
    target: (f64, f64),
    heard_at_us: Option<u64>,
    wheels: [f64; 2],
    rates: [f64; 2],
    hidden: [Hidden; 2],
}

impl Base {
    pub fn new(rng: &mut SplitMix) -> Self {
        let wheels = [seeded_start(rng), seeded_start(rng)];
        let hidden = [Hidden::seeded(rng), Hidden::seeded(rng)];

        Self {
            forward: 0.0,
            turn: 0.0,
            target: (0.0, 0.0),
            heard_at_us: None,
            wheels,
            rates: [0.0; 2],
            hidden,
        }
    }

    pub fn command(&mut self, now_us: u64, forward: f64, turn: f64) {
        self.target = (forward, turn);
        self.heard_at_us = Some(now_us);
    }

    fn timed_out(&self, now_us: u64) -> bool {
        self.heard_at_us
            .is_none_or(|heard| now_us.saturating_sub(heard) >= CMD_VEL_TIMEOUT_US)
    }

    pub fn step(&mut self, now_us: u64) {
        if self.timed_out(now_us) {
            self.target = (0.0, 0.0);
        }

        self.forward = toward(self.forward, self.target.0, LINEAR_ACCEL * STEP_S);
        self.turn = toward(self.turn, self.target.1, ANGULAR_ACCEL * STEP_S);

        let spin = self.turn * WHEEL_SEPARATION_M / 2.0;
        let ideal = [self.forward - spin, self.forward + spin];

        for (((wheel, rate), hidden), ideal) in self.wheels.iter_mut().zip(&mut self.rates).zip(&self.hidden).zip(ideal)
        {
            *rate = ideal / WHEEL_RADIUS_M * f64::from(hidden.gain);
            *wheel += *rate * STEP_S;
        }
    }

    pub fn velocity(&self) -> (f64, f64) {
        (self.forward, self.turn)
    }

    pub fn hidden(&self, wheel: usize) -> Option<Hidden> {
        self.hidden.get(wheel).copied()
    }

    pub fn readings(&self) -> Vec<Reading> {
        (0..2)
            .map(|wheel| Reading {
                position: self.wheels[wheel],
                velocity: self.rates[wheel],
                effort: 0.0,
            })
            .collect()
    }
}
