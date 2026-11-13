#![allow(dead_code)]

use faultbox::{decode_writes, FaultyBus, Schedule, Tap, WriteRecord};
use robot_daemon::artefacts::{ArtefactSource, DirectoryArtefacts, MemoryArtefacts};
use robot_daemon::caps::TICK_US;
use robot_daemon::intent::IntentWriter;
use robot_daemon::ladder::Mode;
use robot_daemon::policy::{Policy, PolicyWorker};
use robot_daemon::{Command, Daemon, DaemonConfig, DaemonEvent, Run};
use servo_emu::{BusOptions, InProcessBus, ServoBus, SharedBus};
use servo_wire::{Clock, Family, VirtualClock};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub const IDS: [u8; 3] = [1, 2, 3];
pub const CALIBRATION: &str = r#"{"joints":[
 {"id":1,"name":"shoulder","zero_counts":2048,"direction":1,"min_rad":-1.5,"max_rad":1.5},
 {"id":2,"name":"elbow","zero_counts":2048,"direction":-1,"min_rad":-1.5,"max_rad":1.5},
 {"id":3,"name":"wrist","zero_counts":2048,"direction":1,"min_rad":-1.5,"max_rad":1.5}
]}"#;

pub struct Rig {
    pub daemon: Daemon,
    pub clock: VirtualClock,
    pub bus: SharedBus,
    pub tap: Tap,
    pub writer: IntentWriter,
    pub artefacts: MemoryArtefacts,
    pub family: Family,
    pub client_alive: bool,
    pub wave: bool,
    pub target: Option<Vec<f32>>,
    pub worker: Option<PolicyWorker>,
    pub events: Vec<DaemonEvent>,
    pub worst_tick: Duration,
    ticks: u64,
}

impl Rig {
    pub fn new(family: Family, schedule: Schedule) -> Self {
        Self::with_latency(family, schedule, 0)
    }

    pub fn with_latency(family: Family, schedule: Schedule, latency_us: u64) -> Self {
        Self::on_bus(ServoBus::new(family, &IDS, BusOptions::default()), schedule, latency_us)
    }

    pub fn factory(family: Family, schedule: Schedule) -> Self {
        Self::on_bus(ServoBus::factory(family, BusOptions::default()), schedule, 0)
    }

    pub fn in_folder(family: Family, folder: std::path::PathBuf) -> Self {
        let servos = ServoBus::new(family, &IDS, BusOptions::default());

        Self::build(
            servos,
            (Schedule::new(), 0),
            Box::new(DirectoryArtefacts::new(folder)),
            MemoryArtefacts::default(),
        )
    }

    fn on_bus(servos: ServoBus, schedule: Schedule, latency_us: u64) -> Self {
        let artefacts = MemoryArtefacts::new(Some(CALIBRATION.as_bytes().to_vec()), Some(b"policy v1".to_vec()));

        Self::build(servos, (schedule, latency_us), Box::new(artefacts.clone()), artefacts)
    }

    fn build(
        servos: ServoBus,
        (schedule, latency_us): (Schedule, u64),
        source: Box<dyn ArtefactSource>,
        artefacts: MemoryArtefacts,
    ) -> Self {
        let family = servos.family();
        let clock = VirtualClock::new();
        let shared_clock: Arc<dyn Clock> = Arc::new(clock.clone());
        let bus = servos.shared();
        let inner = InProcessBus::new(bus.clone(), shared_clock.clone(), latency_us);
        let faulty = FaultyBus::new(inner, schedule, 7);
        let tap = faulty.tap();
        let config = DaemonConfig {
            family,
            ids: IDS.to_vec(),
            class: robot_daemon::calibration::RobotClass::Arm,
        };
        let daemon = Daemon::new(config, Box::new(faulty), shared_clock, source);
        let inputs = daemon.inputs();
        let writer = IntentWriter::new(inputs.intents.clone(), inputs.heartbeat.clone());

        Self {
            daemon,
            clock,
            bus,
            tap,
            writer,
            artefacts,
            family,
            client_alive: true,
            wave: true,
            target: None,
            worker: None,
            events: Vec::new(),
            worst_tick: Duration::ZERO,
            ticks: 0,
        }
    }

    pub fn now(&self) -> u64 {
        self.clock.now_micros()
    }

    pub fn attach_policy(&mut self, policy: Box<dyn Policy>) {
        let inputs = self.daemon.attach_policy();

        self.worker = Some(PolicyWorker::spawn(policy, &inputs));
    }

    pub fn tick(&mut self) {
        if self.client_alive {
            self.writer.heartbeat();
        }

        if let (true, Some(target)) = (self.client_alive, self.target.clone()) {
            self.writer.write_intent(&target);
        } else if self.client_alive && self.wave {
            let phase = self.ticks as f32 * 0.02;

            self.writer
                .write_intent(&[0.12 * phase.sin(), 0.12 * phase.cos() - 0.12, 0.08 * phase.sin()]);
        }

        let inputs = self.daemon.inputs();
        let before = (
            inputs.observations.version(),
            self.worker.as_ref().map(PolicyWorker::consumed),
            inputs.policy_actions.version(),
        );
        let started = Instant::now();

        self.daemon.tick();
        self.worst_tick = self.worst_tick.max(started.elapsed());
        self.events.extend(self.daemon.take_events());
        self.settle_policy(before);
        self.ticks += 1;
        self.clock.advance_to(self.ticks * TICK_US);
    }

    fn settle_policy(&self, before: (u64, Option<u64>, u64)) {
        let (observed_before, consumed_before, acted_before) = before;
        let inputs = self.daemon.inputs();
        let (Some(worker), Some(consumed_before)) = (self.worker.as_ref(), consumed_before) else {
            return;
        };

        if inputs.observations.version() == observed_before {
            return;
        }

        wait_for(|| worker.consumed() != consumed_before);
        wait_for(|| inputs.policy_actions.version() != acted_before);
    }

    pub fn ticks(&mut self, count: u32) {
        for _ in 0..count {
            self.tick();
        }
    }

    pub fn command(&mut self, command: Command) -> Result<(), String> {
        let result = self.daemon.command(command);

        self.events.extend(self.daemon.take_events());

        result
    }

    pub fn tick_until(&mut self, limit: u32, done: impl Fn(&Rig) -> bool) -> bool {
        for _ in 0..limit {
            if done(self) {
                return true;
            }

            self.tick();
        }

        done(self)
    }

    pub fn running(&self) -> bool {
        matches!(self.daemon.run(), Run::Running)
    }

    pub fn start_test(&mut self) {
        self.command(Command::Enter(Mode::SetUp)).expect("set up");
        self.command(Command::Enter(Mode::Test)).expect("test");
        assert!(self.tick_until(80, Rig::running), "soft start never finished");
        self.ticks(20);
    }

    pub fn climb_to_first_run(&mut self) {
        self.start_test();
        assert!(
            self.tick_until(600, |rig| rig.completed(Mode::Test)),
            "test never completed"
        );
        self.command(Command::Enter(Mode::Rehearse)).expect("rehearse");
        assert!(
            self.tick_until(700, |rig| rig.completed(Mode::Rehearse)),
            "rehearsal never completed"
        );
        self.command(Command::Enter(Mode::FirstRun)).expect("first run");
        assert!(self.tick_until(80, Rig::running), "first run never started");
        self.ticks(10);
    }

    pub fn completed(&self, mode: Mode) -> bool {
        self.events
            .iter()
            .any(|event| matches!(event, DaemonEvent::Completed { mode: done, .. } if *done == mode))
    }

    pub fn first_fault(&self) -> Option<(u64, String, String)> {
        self.events.iter().find_map(|event| match event {
            DaemonEvent::Fault { at_us, code, message } => Some((*at_us, code.clone(), message.clone())),
            _ => None,
        })
    }

    pub fn sealed_at(&self) -> Option<u64> {
        self.events.iter().find_map(|event| match event {
            DaemonEvent::Stopped { at_us, .. } => Some(*at_us),
            _ => None,
        })
    }

    pub fn plug_in(&self) {
        self.bus.lock().unwrap().plug_in_new_servo();
    }

    pub fn servo_ids(&self) -> Vec<u8> {
        self.bus.lock().unwrap().servo_ids()
    }

    pub fn assign(&mut self, id: u8) -> Result<(), String> {
        let model = robot_daemon::control::expected_model(self.family);

        self.command(Command::AssignId { id, model })
    }

    pub fn writes(&self) -> Vec<WriteRecord> {
        decode_writes(self.family, &self.tap.events())
    }

    pub fn writes_after(&self, at_us: u64) -> Vec<WriteRecord> {
        self.writes().into_iter().filter(|write| write.at_us > at_us).collect()
    }

    pub fn torque_on(&self, id: u8) -> bool {
        self.bus
            .lock()
            .unwrap()
            .servo(id)
            .is_some_and(|servo| servo.torque_enabled())
    }

    pub fn servo_register(&self, id: u8, address: u16) -> u8 {
        self.bus
            .lock()
            .unwrap()
            .servo(id)
            .map_or(0, |servo| servo.register(address))
    }
}

fn wait_for(done: impl Fn() -> bool) {
    let deadline = Instant::now() + Duration::from_millis(200);

    while !done() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_micros(200));
    }
}

pub struct Verdict {
    pub fault_at: u64,
    pub sealed_at: u64,
    pub code: String,
    pub message: String,
}

pub fn assert_safe_stop(rig: &Rig, onset_us: u64, limit_us: u64, codes: &[&str]) -> Verdict {
    let (fault_at, code, message) = rig.first_fault().expect("no fault was reported");
    let sealed_at = rig.sealed_at().expect("the robot never reached a sealed safe state");

    assert!(codes.contains(&code.as_str()), "unexpected fault {code}: {message}");
    assert!(fault_at >= onset_us, "fault reported before the onset");
    assert!(
        sealed_at - onset_us <= limit_us,
        "safe state took {} us, limit {limit_us}",
        sealed_at - onset_us
    );
    assert!(rig.daemon.is_sealed());
    assert_eq!(rig.writes_after(sealed_at), Vec::new(), "writes after the safe state");
    assert_beginner_message(&message);
    println!(
        "{code} at +{} us, sealed at +{} us: {message}",
        fault_at - onset_us,
        sealed_at - onset_us
    );

    Verdict {
        fault_at,
        sealed_at,
        code,
        message,
    }
}

pub fn assert_beginner_message(message: &str) {
    let lower = message.to_lowercase();
    let jargon = [
        "0x", "err(", "errno", "panic", "nan", "checksum", "crc", "packet", "please", "oops", "invalid",
    ];

    assert!(message.ends_with('.'), "message should be a sentence: {message}");
    assert!(message.len() <= 200, "message too long: {message}");
    assert!(
        jargon.iter().all(|word| !lower.contains(word)),
        "message has jargon: {message}"
    );
}

pub fn only_stop_writes_between(rig: &Rig, from_us: u64, to_us: u64) {
    let torque = match rig.family {
        Family::Feetech => 40,
        Family::Dynamixel => 64,
    };
    let goal = match rig.family {
        Family::Feetech => 42,
        Family::Dynamixel => 116,
    };

    for write in rig
        .writes()
        .iter()
        .filter(|write| write.at_us > from_us && write.at_us <= to_us)
    {
        let switches_off = write.address == torque && write.data.iter().all(|byte| *byte == 0);
        let holds = write.address == goal;
        let softens = matches!(
            (rig.family, write.address),
            (Family::Feetech, 48) | (Family::Dynamixel, 100)
        );

        assert!(
            switches_off || holds || softens,
            "unexpected write while stopping: {write:?}"
        );
    }
}
