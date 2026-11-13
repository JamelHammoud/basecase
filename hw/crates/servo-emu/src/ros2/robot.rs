use super::arm::{Arm, Reading};
use super::base::Base;
use super::command::{heard, Command, Heard};
use crate::joint::Hidden;
use crate::topic_robot::TopicRobot;
use plant_bam::SplitMix;
use servo_wire::ros2::{checked_joints, checked_topic, ControllerKind, Header, JointState, Time};
use servo_wire::{Endpoints, Sample, Topic};

pub const JOINT_STATES_EVERY_US: u64 = 10_000;
const SUBSTEP_US: u64 = 1_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Ros2Fault {
    Silent,
    MissingJoint(String),
    ExtraJoint(String),
    Malformed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ros2Options {
    pub joints: Vec<String>,
    pub controller: ControllerKind,
    pub controller_topic: String,
    pub seed: u64,
    pub fault: Option<Ros2Fault>,
}

impl Ros2Options {
    pub fn new(controller: ControllerKind, joints: &[&str]) -> Self {
        Self {
            joints: joints.iter().map(|name| (*name).to_string()).collect(),
            controller,
            controller_topic: controller.default_topic().to_string(),
            seed: 1,
            fault: None,
        }
    }

    pub fn endpoints(&self) -> Result<Endpoints, String> {
        Endpoints::ros2(self.controller, &self.controller_topic)
    }

    fn checked(&self) -> Result<(), String> {
        checked_joints(self.controller, &self.joints)?;
        checked_topic(self.controller, &self.controller_topic)?;

        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Ros2Counters {
    pub states: u64,
    pub accepted: u64,
    pub rejected: u64,
    pub unreadable: u64,
}

enum Body {
    Arm(Arm),
    Base(Base),
}

impl Body {
    fn step(&mut self, now_us: u64) {
        match self {
            Body::Arm(arm) => arm.step(now_us),
            Body::Base(base) => base.step(now_us),
        }
    }

    fn readings(&self) -> Vec<Reading> {
        match self {
            Body::Arm(arm) => arm.readings(),
            Body::Base(base) => base.readings(),
        }
    }

    fn hidden(&self, joint: usize) -> Option<Hidden> {
        match self {
            Body::Arm(arm) => arm.hidden(joint),
            Body::Base(base) => base.hidden(joint),
        }
    }

    fn obey(&mut self, now_us: u64, command: Command) -> bool {
        match (self, command) {
            (Body::Arm(arm), Command::Positions(positions)) => arm.hold(positions),
            (Body::Arm(arm), Command::Trajectory(waypoints)) => arm.play(now_us, waypoints),
            (Body::Base(base), Command::Twist { forward, turn }) => base.command(now_us, forward, turn),
            _ => return false,
        }

        true
    }
}

fn shuffled(count: usize, rng: &mut SplitMix) -> Vec<usize> {
    let mut order: Vec<usize> = (0..count).collect();

    for last in (1..count).rev() {
        let pick = rng.below(last as u64 + 1) as usize;

        order.swap(last, pick);
    }

    order
}

pub struct Ros2Emulator {
    joints: Vec<String>,
    controller: ControllerKind,
    body: Body,
    order: Vec<usize>,
    time_us: u64,
    next_state_us: u64,
    fault: Option<Ros2Fault>,
    counters: Ros2Counters,
}

impl Ros2Emulator {
    pub fn new(options: Ros2Options) -> Result<Self, String> {
        options.checked()?;

        let mut rng = SplitMix::new(options.seed);
        let body = match options.controller {
            ControllerKind::DiffDrive => Body::Base(Base::new(&mut rng)),
            ControllerKind::ForwardPosition | ControllerKind::JointTrajectory => {
                Body::Arm(Arm::new(options.joints.len(), &mut rng))
            }
        };
        let order = shuffled(options.joints.len(), &mut rng);

        Ok(Self {
            joints: options.joints,
            controller: options.controller,
            body,
            order,
            time_us: 0,
            next_state_us: JOINT_STATES_EVERY_US,
            fault: options.fault,
            counters: Ros2Counters::default(),
        })
    }

    pub fn shared(self) -> super::SharedRos2 {
        std::sync::Arc::new(std::sync::Mutex::new(self))
    }

    pub fn set_fault(&mut self, fault: Option<Ros2Fault>) {
        self.fault = fault;
    }

    pub fn counters(&self) -> Ros2Counters {
        self.counters
    }

    pub fn now_us(&self) -> u64 {
        self.time_us
    }

    pub fn joints(&self) -> &[String] {
        &self.joints
    }

    pub fn publish_order(&self) -> Vec<&str> {
        self.order.iter().map(|at| self.joints[*at].as_str()).collect()
    }

    pub fn positions(&self) -> Vec<f64> {
        self.body.readings().iter().map(|reading| reading.position).collect()
    }

    pub fn position(&self, name: &str) -> Option<f64> {
        let at = self.joints.iter().position(|joint| joint == name)?;

        self.positions().get(at).copied()
    }

    pub fn hidden(&self, joint: usize) -> Option<Hidden> {
        self.body.hidden(joint)
    }

    pub fn setpoint(&self) -> Option<Vec<f64>> {
        match &self.body {
            Body::Arm(arm) => Some(arm.setpoint().to_vec()),
            Body::Base(_) => None,
        }
    }

    pub fn base_velocity(&self) -> Option<(f64, f64)> {
        match &self.body {
            Body::Base(base) => Some(base.velocity()),
            Body::Arm(_) => None,
        }
    }

    pub fn deliver(&mut self, sample: &Sample) {
        match heard(self.controller, &self.joints, sample) {
            Heard::Taken(command) => self.obey(command),
            Heard::Rejected => self.counters.rejected += 1,
            Heard::Unreadable => self.counters.unreadable += 1,
            Heard::NotOurs => {}
        }
    }

    fn obey(&mut self, command: Command) {
        if self.body.obey(self.time_us, command) {
            self.counters.accepted += 1;
        } else {
            self.counters.rejected += 1;
        }
    }

    pub fn advance_to(&mut self, now_us: u64) -> Vec<(u64, Sample)> {
        let mut published = Vec::new();

        while self.time_us + SUBSTEP_US <= now_us {
            self.time_us += SUBSTEP_US;
            self.body.step(self.time_us);

            if self.time_us >= self.next_state_us {
                published.extend(self.publish_state());
                self.next_state_us += JOINT_STATES_EVERY_US;
            }
        }

        published
    }

    fn state(&self) -> JointState {
        let readings = self.body.readings();
        let mut state = JointState {
            header: Header {
                stamp: Time::from_micros(self.time_us),
                frame_id: String::new(),
            },
            ..JointState::default()
        };
        let missing = match &self.fault {
            Some(Ros2Fault::MissingJoint(name)) => Some(name.as_str()),
            _ => None,
        };

        for at in &self.order {
            let name = &self.joints[*at];

            if missing != Some(name.as_str()) {
                state.name.push(name.clone());
                state.position.push(readings[*at].position);
                state.velocity.push(readings[*at].velocity);
                state.effort.push(readings[*at].effort);
            }
        }

        self.faulted(state)
    }

    fn faulted(&self, mut state: JointState) -> JointState {
        match &self.fault {
            Some(Ros2Fault::ExtraJoint(name)) => {
                state.name.push(name.clone());
                state.position.push(0.0);
                state.velocity.push(0.0);
                state.effort.push(0.0);
            }
            Some(Ros2Fault::Malformed) => {
                if let Some(first) = state.position.first_mut() {
                    *first = f64::NAN;
                }
            }
            _ => {}
        }

        state
    }

    fn publish_state(&mut self) -> Option<(u64, Sample)> {
        if self.fault == Some(Ros2Fault::Silent) {
            return None;
        }

        self.counters.states += 1;

        Some((
            self.time_us,
            Sample {
                topic: Topic::JointStates,
                payload: self.state().encode(),
            },
        ))
    }
}

impl TopicRobot for Ros2Emulator {
    fn advance_to(&mut self, at_us: u64) -> Vec<(u64, Sample)> {
        Ros2Emulator::advance_to(self, at_us)
    }

    fn deliver(&mut self, sample: &Sample) {
        Ros2Emulator::deliver(self, sample);
    }
}

#[cfg(test)]
#[path = "robot_tests.rs"]
mod tests;
