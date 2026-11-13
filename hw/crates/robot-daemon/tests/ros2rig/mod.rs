#![allow(dead_code)]

use robot_daemon::artefacts::MemoryArtefacts;
use robot_daemon::caps::TICK_US;
use robot_daemon::intent::IntentWriter;
use robot_daemon::ladder::Mode;
use robot_daemon::ros2::{Ros2Daemon, Ros2Parts, Ros2Run, Ros2Spec};
use robot_daemon::{Command, DaemonEvent};
use servo_emu::ros2::{in_process_ros2, Ros2Options, SharedRos2};
use servo_wire::ros2::{ControllerKind, Float64MultiArray, Header, JointState, JointTrajectory, Twist};
use servo_wire::{Clock, Sample, Topic, TopicTransport, TransportError, VirtualClock};
use std::f32::consts::TAU;
use std::sync::{Arc, Mutex};

pub const ARM: [&str; 6] = [
    "shoulder_pan",
    "shoulder_lift",
    "elbow",
    "wrist_flex",
    "wrist_roll",
    "gripper",
];
pub const WHEELS: [&str; 2] = ["left_wheel", "right_wheel"];
pub const CALIBRATED_RAD: f32 = 2.8;
pub const COUNT_RAD: f32 = TAU / 4096.0;

pub type Published = Arc<Mutex<Vec<(u64, Topic, Vec<u8>)>>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tamper {
    Pass,
    Drop,
    NotANumber,
    Huge,
    Garbage,
    Duplicate,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Sent {
    Positions(Vec<f64>),
    Trajectory(JointTrajectory),
    Twist(Twist),
    Unreadable(Topic),
}

pub fn decode(topic: Topic, payload: &[u8]) -> Sent {
    let decoded = match topic {
        Topic::PositionCommands => Float64MultiArray::decode(payload)
            .ok()
            .map(|array| Sent::Positions(array.data)),
        Topic::TrajectoryCommands => JointTrajectory::decode(payload).ok().map(Sent::Trajectory),
        Topic::CmdVel => Twist::decode(payload).ok().map(Sent::Twist),
        _ => None,
    };

    decoded.unwrap_or(Sent::Unreadable(topic))
}

pub fn calibration(joints: &[&str]) -> String {
    let entries: Vec<String> = joints
        .iter()
        .enumerate()
        .map(|(at, name)| {
            format!(
                r#"{{"id":{},"name":"{name}","zero_counts":2048,"direction":1,"min_rad":-2.8,"max_rad":2.8}}"#,
                at + 1
            )
        })
        .collect();

    format!(r#"{{"joints":[{}],"class":"arm"}}"#, entries.join(","))
}

fn hostile(kind: Tamper, sample: Sample, count: u64) -> Option<Sample> {
    if kind == Tamper::Drop {
        return None;
    }

    if kind == Tamper::Pass || count.is_multiple_of(2) {
        return Some(sample);
    }

    let state = |name: Vec<String>, position: Vec<f64>| JointState {
        header: Header::default(),
        name,
        position,
        ..JointState::default()
    };
    let payload = match kind {
        Tamper::Pass | Tamper::Drop => return Some(sample),
        Tamper::NotANumber => state(vec!["shoulder_pan".into()], vec![f64::NAN]).encode(),
        Tamper::Huge => state((0..10_000).map(|at| format!("j{at}")).collect(), vec![2.5; 10_000]).encode(),
        Tamper::Garbage => vec![0, 1, 0, 0, 0xFF, 0xFF, 0xFF, 0x7F, 1, 2, 3],
        Tamper::Duplicate => state(vec!["elbow".into(), "elbow".into()], vec![2.5, 2.5]).encode(),
    };

    Some(Sample {
        topic: Topic::JointStates,
        payload,
    })
}

struct Tapped {
    inner: servo_emu::ros2::InProcessRos2,
    clock: Arc<dyn Clock>,
    published: Published,
}

impl TopicTransport for Tapped {
    fn publish(&mut self, topic: Topic, payload: &[u8]) -> Result<(), TransportError> {
        self.published
            .lock()
            .unwrap()
            .push((self.clock.now_micros(), topic, payload.to_vec()));
        self.inner.publish(topic, payload)
    }

    fn receive(&mut self, timeout_micros: u64) -> Result<Option<Sample>, TransportError> {
        self.inner.receive(timeout_micros)
    }
}

pub struct Ros2Rig {
    pub daemon: Ros2Daemon,
    pub clock: VirtualClock,
    pub robot: SharedRos2,
    pub artefacts: MemoryArtefacts,
    pub joints: Vec<String>,
    pub writer: IntentWriter,
    pub published: Published,
    pub tamper: Arc<Mutex<Tamper>>,
    pub client_alive: bool,
    pub intents_flow: bool,
    pub target: Vec<f32>,
    pub events: Vec<DaemonEvent>,
    ticks: u64,
}

impl Ros2Rig {
    pub fn arm(kind: ControllerKind) -> Self {
        Self::with(Ros2Options::new(kind, &ARM), 0)
    }

    pub fn base() -> Self {
        Self::with(Ros2Options::new(ControllerKind::DiffDrive, &WHEELS), 0)
    }

    pub fn with(options: Ros2Options, latency_us: u64) -> Self {
        let clock = VirtualClock::new();
        let shared: Arc<dyn Clock> = Arc::new(clock.clone());
        let joints = options.joints.clone();
        let names: Vec<&str> = joints.iter().map(String::as_str).collect();
        let artefacts = MemoryArtefacts::new(Some(calibration(&names).into_bytes()), None);
        let spec = Ros2Spec {
            kind: options.controller,
            joints: joints.clone(),
        };
        let (mut inner, robot) = in_process_ros2(options, shared.clone(), latency_us).unwrap();
        let tamper = Arc::new(Mutex::new(Tamper::Pass));
        let tampering = tamper.clone();

        let mut seen = 0u64;

        inner.set_filter(Box::new(move |sample| {
            seen += 1;
            hostile(*tampering.lock().unwrap(), sample, seen)
        }));

        let published = Published::default();
        let transport = Tapped {
            inner,
            clock: shared.clone(),
            published: published.clone(),
        };
        let daemon = Ros2Daemon::new(Ros2Parts {
            spec,
            transport: Box::new(transport),
            clock: shared,
            artefacts: Box::new(artefacts.clone()),
        });
        let inputs = daemon.inputs();
        let target = match daemon.spec().kind {
            ControllerKind::DiffDrive => vec![0.0; 2],
            _ => robot.lock().unwrap().positions().iter().map(|q| *q as f32).collect(),
        };

        Self {
            writer: IntentWriter::new(inputs.intents.clone(), inputs.heartbeat.clone()),
            daemon,
            clock,
            robot,
            artefacts,
            joints,
            published,
            tamper,
            client_alive: true,
            intents_flow: true,
            target,
            events: Vec::new(),
            ticks: 0,
        }
    }

    pub fn now(&self) -> u64 {
        self.clock.now_micros()
    }

    pub fn set_tamper(&self, tamper: Tamper) {
        *self.tamper.lock().unwrap() = tamper;
    }

    pub fn tick(&mut self) {
        if self.client_alive {
            self.writer.heartbeat();
        }

        if self.client_alive && self.intents_flow {
            self.writer.write_intent(&self.target);
        }

        self.daemon.tick();
        self.events.extend(self.daemon.take_events());
        self.ticks += 1;
        self.clock.advance_to(self.clock.now_micros().max(self.ticks * TICK_US));
    }

    pub fn ticks(&mut self, count: u32) {
        for _ in 0..count {
            self.tick();
        }
    }

    pub fn command(&mut self, command: Command) -> Result<(), String> {
        let outcome = self.daemon.command(command);

        self.events.extend(self.daemon.take_events());
        outcome
    }

    pub fn tick_until(&mut self, limit: u32, done: impl Fn(&Ros2Rig) -> bool) -> bool {
        for _ in 0..limit {
            if done(self) {
                return true;
            }

            self.tick();
        }

        done(self)
    }

    pub fn climb_to_test(&mut self) {
        self.ticks(5);
        self.command(Command::Enter(Mode::SetUp)).unwrap();
        self.command(Command::Enter(Mode::Test)).unwrap();
        assert!(self.tick_until(10, |rig| rig.daemon.run() == Ros2Run::Running));
    }

    pub fn position(&self, joint: usize) -> f64 {
        self.robot.lock().unwrap().positions()[joint]
    }

    pub fn measured(&self) -> Vec<Option<f64>> {
        self.daemon.reading().map_or_else(
            || vec![None; self.joints.len()],
            |reading| reading.positions_of(&self.joints),
        )
    }

    pub fn published(&self) -> Vec<(u64, Topic, Vec<u8>)> {
        self.published.lock().unwrap().clone()
    }

    pub fn sent(&self) -> Vec<(u64, Sent)> {
        self.published()
            .into_iter()
            .map(|(at, topic, payload)| (at, decode(topic, &payload)))
            .collect()
    }

    pub fn sent_after(&self, at_us: u64) -> Vec<(u64, Sent)> {
        self.sent().into_iter().filter(|(at, _)| *at > at_us).collect()
    }

    pub fn first_fault(&self) -> Option<(u64, String, String)> {
        self.events.iter().find_map(|event| match event {
            DaemonEvent::Fault { at_us, code, message } => Some((*at_us, code.clone(), message.clone())),
            _ => None,
        })
    }

    pub fn refusals(&self) -> Vec<String> {
        self.events
            .iter()
            .filter_map(|event| match event {
                DaemonEvent::Refused { message } => Some(message.clone()),
                _ => None,
            })
            .collect()
    }
}

pub fn positions_of(sent: &Sent) -> Option<Vec<f64>> {
    match sent {
        Sent::Positions(positions) => Some(positions.clone()),
        Sent::Trajectory(trajectory) => trajectory.points.first().map(|point| point.positions.clone()),
        Sent::Twist(_) | Sent::Unreadable(_) => None,
    }
}
