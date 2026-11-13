#![allow(dead_code)]

use robot_daemon::artefacts::MemoryArtefacts;
use robot_daemon::caps::TICK_US;
use robot_daemon::g1::{G1Daemon, G1Run};
use robot_daemon::intent::IntentWriter;
use robot_daemon::ladder::Mode;
use robot_daemon::{Command, DaemonEvent};
use servo_emu::g1::{G1Emulator, G1Options, InProcessG1, SharedG1, STAND_POSE};
use servo_wire::unitree::g1::{joint_id, RIGHT_SHOULDER_PITCH, WRITABLE};
use servo_wire::unitree::LowCmd;
use servo_wire::{Clock, Sample, Topic, TopicTransport, TransportError, VirtualClock};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

pub const SHOULDER: usize = RIGHT_SHOULDER_PITCH - WRITABLE.start;

pub type Published = Arc<Mutex<Vec<(u64, LowCmd)>>>;

pub fn calibration() -> String {
    let joints: Vec<String> = WRITABLE
        .map(|motor| {
            format!(
                r#"{{"id":{},"name":"motor {motor}","zero_counts":2048,"direction":1,"min_rad":-2.8,"max_rad":2.8}}"#,
                joint_id(motor)
            )
        })
        .collect();

    format!(r#"{{"joints":[{}],"class":"legged"}}"#, joints.join(","))
}

struct Tapped {
    inner: InProcessG1,
    clock: Arc<dyn Clock>,
    published: Published,
}

impl TopicTransport for Tapped {
    fn publish(&mut self, topic: Topic, payload: &[u8]) -> Result<(), TransportError> {
        if let (Topic::ArmSdk, Ok(command)) = (topic, LowCmd::decode(payload)) {
            self.published.lock().unwrap().push((self.clock.now_micros(), command));
        }

        self.inner.publish(topic, payload)
    }

    fn receive(&mut self, timeout_micros: u64) -> Result<Option<Sample>, TransportError> {
        self.inner.receive(timeout_micros)
    }
}

pub struct G1Rig {
    pub daemon: G1Daemon,
    pub clock: VirtualClock,
    pub robot: SharedG1,
    pub writer: IntentWriter,
    pub published: Published,
    pub corrupt_state: Arc<AtomicBool>,
    pub client_alive: bool,
    pub intents_flow: bool,
    pub target: Vec<f32>,
    pub events: Vec<DaemonEvent>,
    ticks: u64,
}

fn corrupting(flag: Arc<AtomicBool>) -> impl FnMut(Sample) -> Option<Sample> + Send {
    move |mut sample: Sample| {
        if sample.topic == Topic::LowState && flag.load(Ordering::SeqCst) {
            let last = sample.payload.len() - 1;

            sample.payload[last] ^= 0x01;
        }

        Some(sample)
    }
}

impl G1Rig {
    pub fn new() -> Self {
        Self::with(G1Options::default(), 0)
    }

    pub fn with(options: G1Options, latency_us: u64) -> Self {
        let clock = VirtualClock::new();
        let shared: Arc<dyn Clock> = Arc::new(clock.clone());
        let robot = G1Emulator::new(options).shared();
        let corrupt_state = Arc::new(AtomicBool::new(false));
        let mut inner = InProcessG1::new(robot.clone(), shared.clone(), latency_us);

        inner.set_filter(Box::new(corrupting(corrupt_state.clone())));

        let published = Published::default();
        let tapped = Tapped {
            inner,
            clock: shared.clone(),
            published: published.clone(),
        };
        let artefacts = MemoryArtefacts::new(Some(calibration().into_bytes()), None);
        let daemon = G1Daemon::new(Box::new(tapped), shared, Box::new(artefacts));
        let inputs = daemon.inputs();

        Self {
            writer: IntentWriter::new(inputs.intents.clone(), inputs.heartbeat.clone()),
            daemon,
            clock,
            robot,
            published,
            corrupt_state,
            client_alive: true,
            intents_flow: true,
            target: WRITABLE.map(|motor| STAND_POSE[motor]).collect(),
            events: Vec::new(),
            ticks: 0,
        }
    }

    pub fn now(&self) -> u64 {
        self.clock.now_micros()
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
        self.clock.advance_to(self.ticks * TICK_US);
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

    pub fn tick_until(&mut self, limit: u32, done: impl Fn(&G1Rig) -> bool) -> bool {
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
        assert!(self.tick_until(80, |rig| rig.daemon.run() == G1Run::Running));
    }

    pub fn shoulder(&self) -> f32 {
        self.robot.lock().unwrap().position(RIGHT_SHOULDER_PITCH)
    }

    pub fn robot_weight(&self) -> f32 {
        self.robot.lock().unwrap().weight()
    }

    pub fn published(&self) -> Vec<(u64, LowCmd)> {
        self.published.lock().unwrap().clone()
    }

    pub fn published_after(&self, at_us: u64) -> Vec<(u64, LowCmd)> {
        self.published().into_iter().filter(|(at, _)| *at > at_us).collect()
    }

    pub fn first_fault(&self) -> Option<(u64, String, String)> {
        self.events.iter().find_map(|event| match event {
            DaemonEvent::Fault { at_us, code, message } => Some((*at_us, code.clone(), message.clone())),
            _ => None,
        })
    }

    pub fn handed_back_at(&self, after_us: u64) -> Option<u64> {
        self.published()
            .into_iter()
            .find(|(at, command)| *at >= after_us && weight_of(command) == 0.0)
            .map(|(at, _)| at)
    }
}

pub fn weight_of(command: &LowCmd) -> f32 {
    command.motor_cmd[servo_wire::unitree::g1::WEIGHT_SLOT].q
}
