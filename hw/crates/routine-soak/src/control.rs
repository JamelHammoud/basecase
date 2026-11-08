use crate::timing::sleep_until;
use basecase_coordinator::{ControlReader, IntentSlot, NO_SKILL};
use robot_daemon::artefacts::MemoryArtefacts;
use robot_daemon::calibration::RobotClass;
use robot_daemon::intent::IntentWriter;
use robot_daemon::transport::{open, Target};
use robot_daemon::{Daemon, DaemonConfig};
use servo_wire::{Clock, Family, SystemClock};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

const TICK_US: u64 = 20_000;
const SERVO_IDS: [u8; 12] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GAIT_HZ: f64 = 1.5;
const GAIT_RAD: f64 = 0.25;

pub struct ControlConfig {
    pub seconds: u64,
    pub skills: Vec<String>,
    pub safe_stop: u16,
    pub deadline_ms: u32,
}

#[derive(Debug, Default)]
pub struct ControlReport {
    pub lateness_us: Vec<u64>,
    pub tripped: bool,
    pub body_ticks: BTreeMap<String, u64>,
}

fn daemon() -> Result<Daemon, String> {
    let clock: Arc<dyn Clock> = Arc::new(SystemClock::new());
    let target = Target::Emulated { latency_us: 0, seed: 1 };
    let transport = open(&target, Family::Feetech, &SERVO_IDS, clock.clone())?;
    let config = DaemonConfig {
        family: Family::Feetech,
        ids: SERVO_IDS.to_vec(),
        class: RobotClass::Legged,
    };

    Ok(Daemon::new(
        config,
        transport,
        clock,
        Box::new(MemoryArtefacts::new(None, None)),
    ))
}

fn joint_targets(walking: bool, t_s: f64, out: &mut [f32; 12]) {
    for (i, value) in out.iter_mut().enumerate() {
        let phase = if i % 2 == 0 { 0.0 } else { std::f64::consts::PI };
        let swing = (2.0 * std::f64::consts::PI * GAIT_HZ * t_s + phase).sin() * GAIT_RAD;

        *value = if walking { swing as f32 } else { 0.0 };
    }
}

fn skill_name(skills: &[String], index: u16) -> String {
    if index == NO_SKILL {
        return "none".into();
    }

    skills
        .get(usize::from(index))
        .cloned()
        .unwrap_or_else(|| format!("skill {index}"))
}

pub fn run(slot: &IntentSlot, start: Instant, config: &ControlConfig) -> Result<ControlReport, String> {
    let mut daemon = daemon()?;
    let inputs = daemon.inputs();
    let writer = IntentWriter::new(inputs.intents.clone(), inputs.heartbeat.clone());
    let mut reader = ControlReader::new(config.deadline_ms, config.safe_stop);
    let mut report = ControlReport::default();
    let mut joints = [0.0f32; 12];
    let total = config.seconds * 1_000_000 / TICK_US;

    report.lateness_us.reserve(usize::try_from(total).unwrap_or_default());

    for k in 0..total {
        let target = start + Duration::from_micros(k * TICK_US);

        sleep_until(target);

        let late = u64::try_from(Instant::now().duration_since(target).as_micros()).unwrap_or(u64::MAX);
        let command = reader.read(slot, k * TICK_US / 1000);
        let name = skill_name(&config.skills, command.body);

        report.lateness_us.push(late);
        report.tripped |= command.tripped;
        joint_targets(name == "walk", (k * TICK_US) as f64 / 1e6, &mut joints);
        writer.write_intent(&joints);
        daemon.tick();
        daemon.take_events();
        *report.body_ticks.entry(name).or_default() += 1;
    }

    Ok(report)
}
