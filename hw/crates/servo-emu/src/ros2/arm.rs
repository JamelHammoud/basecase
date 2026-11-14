use super::command::Waypoint;
use crate::joint::{Build, Drive, Gains, Hidden, Joint};
use plant_bam::SplitMix;
use std::f32::consts::PI;

pub const START_SPREAD_RAD: f64 = 0.2;
pub const ARM_GAINS: Gains = Gains { kp: 50.0, kd: 3.0 };
pub const ARM_TORQUE_LIMIT: f32 = 10.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Reading {
    pub position: f64,
    pub velocity: f64,
    pub effort: f64,
}

pub fn seeded_start(rng: &mut SplitMix) -> f64 {
    START_SPREAD_RAD * (2.0 * rng.unit() - 1.0)
}

struct Playing {
    start_us: u64,
    from: Vec<f64>,
    waypoints: Vec<Waypoint>,
}

impl Playing {
    fn setpoint_at(&self, now_us: u64) -> Option<Vec<f64>> {
        let elapsed = now_us.saturating_sub(self.start_us);
        let next = self.waypoints.iter().position(|point| point.after_us > elapsed)?;
        let (from_us, from) = match next.checked_sub(1) {
            Some(previous) => (self.waypoints[previous].after_us, &self.waypoints[previous].positions),
            None => (0, &self.from),
        };
        let to = &self.waypoints[next];
        let fraction = (elapsed - from_us) as f64 / (to.after_us - from_us) as f64;

        Some(
            from.iter()
                .zip(&to.positions)
                .map(|(start, end)| start + (end - start) * fraction)
                .collect(),
        )
    }

    fn last(&self) -> Option<&Vec<f64>> {
        self.waypoints.last().map(|point| &point.positions)
    }
}

pub struct Arm {
    joints: Vec<Joint>,
    setpoint: Vec<f64>,
    playing: Option<Playing>,
}

impl Arm {
    pub fn new(count: usize, rng: &mut SplitMix) -> Self {
        let joints: Vec<Joint> = (0..count)
            .map(|_| {
                let build = Build {
                    at: seeded_start(rng) as f32,
                    range: (-PI, PI),
                    torque_limit: ARM_TORQUE_LIMIT,
                };

                Joint::new(build, Hidden::seeded(rng))
            })
            .collect();
        let setpoint = joints.iter().map(|joint| f64::from(joint.q)).collect();

        Self {
            joints,
            setpoint,
            playing: None,
        }
    }

    pub fn hold(&mut self, positions: Vec<f64>) {
        self.playing = None;
        self.setpoint = positions;
    }

    pub fn play(&mut self, now_us: u64, waypoints: Vec<Waypoint>) {
        self.playing = Some(Playing {
            start_us: now_us,
            from: self.setpoint.clone(),
            waypoints,
        });
    }

    fn follow(&mut self, now_us: u64) {
        let Some(playing) = &self.playing else {
            return;
        };

        if let Some(setpoint) = playing.setpoint_at(now_us) {
            self.setpoint = setpoint;

            return;
        }

        if let Some(last) = playing.last() {
            self.setpoint = last.clone();
        }

        self.playing = None;
    }

    pub fn step(&mut self, now_us: u64) {
        self.follow(now_us);

        for (joint, target) in self.joints.iter_mut().zip(&self.setpoint) {
            joint.step(Drive {
                target: *target as f32,
                velocity: 0.0,
                feedforward: 0.0,
                gains: ARM_GAINS,
            });
        }
    }

    pub fn setpoint(&self) -> &[f64] {
        &self.setpoint
    }

    pub fn hidden(&self, joint: usize) -> Option<Hidden> {
        self.joints.get(joint).map(|joint| joint.hidden)
    }

    pub fn readings(&self) -> Vec<Reading> {
        self.joints
            .iter()
            .map(|joint| Reading {
                position: f64::from(joint.q),
                velocity: f64::from(joint.dq),
                effort: f64::from(joint.tau),
            })
            .collect()
    }
}
