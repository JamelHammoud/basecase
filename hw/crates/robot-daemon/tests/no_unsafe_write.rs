mod common;

use common::{Rig, CALIBRATION, IDS};
use faultbox::{Fault, Schedule, WriteRecord};
use proptest::prelude::*;
use robot_daemon::calibration::Calibration;
use robot_daemon::ladder::Mode;
use robot_daemon::{Command, DaemonEvent};
use servo_wire::Family;

const STEP_COUNTS: i32 = 6;
const LEAD_COUNTS: i32 = 162;

#[derive(Debug, Clone)]
enum Step {
    Intent(Vec<f32>),
    SkipHeartbeat,
    Inject(Fault),
    Order(Command),
}

struct Registers {
    torque: u16,
    goal: u16,
    limit: u16,
    speed: u16,
    max_limit: u32,
    soft_limit: u32,
    max_speed: u32,
}

fn registers(family: Family) -> Registers {
    match family {
        Family::Feetech => Registers {
            torque: 40,
            goal: 42,
            limit: 48,
            speed: 46,
            max_limit: 300,
            soft_limit: 50,
            max_speed: 325,
        },
        Family::Dynamixel => Registers {
            torque: 64,
            goal: 116,
            limit: 100,
            speed: 112,
            max_limit: 265,
            soft_limit: 44,
            max_speed: 20,
        },
    }
}

fn value_strategy() -> impl Strategy<Value = f32> {
    prop_oneof![
        6 => -3.0f32..3.0,
        1 => Just(f32::NAN),
        1 => Just(f32::INFINITY),
        1 => Just(f32::NEG_INFINITY),
        1 => Just(1e30f32),
        1 => Just(-0.0f32),
    ]
}

fn fault_strategy() -> impl Strategy<Value = Fault> {
    let id = 1u8..=3;

    prop_oneof![
        Just(Fault::UnplugMidPacket { after_reply_bytes: 4 }),
        Just(Fault::AdapterGone),
        (10_000u64..80_000).prop_map(|duration_us| Fault::Brownout {
            volts: 2.0,
            duration_us
        }),
        id.clone().prop_map(|id| Fault::StuckMotor { id }),
        (1u32..20).prop_map(|replies| Fault::BitFlip { replies }),
        (1u32..20).prop_map(|replies| Fault::Truncate { replies }),
        (1u32..20).prop_map(|replies| Fault::WrongIdReply { replies }),
        id.clone().prop_map(|id| Fault::Overheat { id, watts: 400.0 }),
        (5_000u64..60_000).prop_map(|extra_us| Fault::LatencySpike {
            extra_us,
            duration_us: 100_000
        }),
        id.clone().prop_map(|id| Fault::InvertedDirection { id }),
        id.prop_map(|id| Fault::DuplicateId { id }),
    ]
}

fn step_strategy() -> impl Strategy<Value = Step> {
    prop_oneof![
        12 => proptest::collection::vec(value_strategy(), 0..5).prop_map(Step::Intent),
        2 => Just(Step::SkipHeartbeat),
        1 => fault_strategy().prop_map(Step::Inject),
        2 => prop_oneof![
            Just(Command::Stop),
            Just(Command::Fall),
            Just(Command::Release),
            Just(Command::ClearFault),
            Just(Command::Enter(Mode::SetUp)),
            Just(Command::Enter(Mode::Test)),
        ]
        .prop_map(Step::Order),
    ]
}

struct Record {
    windows: Vec<(u64, u64, Vec<Option<i32>>)>,
    commands: Vec<u64>,
}

fn run(family: Family, steps: &[Step]) -> (Rig, Record) {
    let mut schedule = Schedule::new();
    let mut at = 2_000_000u64;

    for step in steps {
        if let Step::Inject(fault) = step {
            schedule = schedule.at(at, fault.clone());
        }

        at += 40_000;
    }

    let mut rig = Rig::new(family, schedule);
    let mut record = Record {
        windows: Vec::new(),
        commands: Vec::new(),
    };

    rig.wave = false;
    rig.target = Some(vec![0.0, 0.0, 0.0]);
    let _ = rig.command(Command::Enter(Mode::SetUp));
    let _ = rig.command(Command::Enter(Mode::Test));

    while rig.now() < 2_000_000 {
        observe_tick(&mut rig, &mut record);
    }

    for step in steps {
        apply(&mut rig, &mut record, step);
        observe_tick(&mut rig, &mut record);
        rig.client_alive = true;
        observe_tick(&mut rig, &mut record);
    }

    (rig, record)
}

fn apply(rig: &mut Rig, record: &mut Record, step: &Step) {
    match step {
        Step::Intent(values) => rig.target = Some(values.clone()),
        Step::SkipHeartbeat => rig.client_alive = false,
        Step::Inject(_) => {}
        Step::Order(command) => {
            record.commands.push(rig.now());
            let _ = rig.command(command.clone());
        }
    }
}

fn observe_tick(rig: &mut Rig, record: &mut Record) {
    let start = rig.now();

    rig.tick();

    let positions = rig
        .daemon
        .samples()
        .iter()
        .map(|sample| sample.telemetry().map(|t| t.position))
        .collect();

    record.windows.push((start, rig.now(), positions));
}

fn value(write: &WriteRecord) -> u32 {
    let mut bytes = [0u8; 4];

    for (slot, byte) in bytes.iter_mut().zip(&write.data) {
        *slot = *byte;
    }

    u32::from_le_bytes(bytes)
}

fn position_seen(record: &Record, at_us: u64, id: u8) -> Vec<i32> {
    let index = IDS.iter().position(|candidate| *candidate == id).unwrap();

    record
        .windows
        .iter()
        .filter(|(start, end, _)| *start <= at_us && at_us <= *end)
        .filter_map(|(_, _, positions)| positions.get(index).copied().flatten())
        .collect()
}

fn check(rig: &Rig, record: &Record) -> Result<(), TestCaseError> {
    let regs = registers(rig.family);
    let calibration = Calibration::parse(CALIBRATION.as_bytes()).unwrap();
    let mut last_goal = [None::<i32>; 4];
    let mut last_limit = [u32::MAX; 4];

    for write in rig.writes() {
        let id = usize::from(write.id);
        let raw = value(&write);

        prop_assert!(IDS.contains(&write.id), "write to an unknown servo: {write:?}");

        if write.address == regs.goal {
            let goal = raw as i32;
            let bounds = calibration.joints[id - 1].bounds();
            let stepped = last_goal[id].is_none_or(|last| (goal - last).abs() <= STEP_COUNTS);
            let seen = position_seen(record, write.at_us, write.id);
            let holds = seen.contains(&goal);
            let leads_safely = seen.iter().any(|present| {
                let lead = (goal - present).abs();

                lead <= LEAD_COUNTS || last_goal[id].is_some_and(|last| lead <= (last - present).abs())
            });

            prop_assert!(bounds.contains(goal), "goal outside calibration: {write:?}");
            prop_assert!(stepped || holds, "goal jumped from {:?}: {write:?}", last_goal[id]);
            prop_assert!(
                seen.is_empty() || leads_safely,
                "goal ran ahead of the joint {seen:?}: {write:?}"
            );
            last_goal[id] = Some(goal);
        }

        if write.address == regs.limit {
            prop_assert!(raw <= regs.max_limit, "torque limit above the first-run cap: {write:?}");
            last_limit[id] = raw;
        }

        if write.address == regs.speed {
            prop_assert!(raw <= regs.max_speed, "speed above the first-run cap: {write:?}");
        }

        if write.address == regs.torque && raw == 1 {
            prop_assert!(
                last_limit[id] <= regs.soft_limit,
                "torque enabled without a soft start: {write:?}"
            );
        }
    }

    check_silence_after_seal(rig, record)
}

fn check_silence_after_seal(rig: &Rig, record: &Record) -> Result<(), TestCaseError> {
    let seals = rig.events.iter().filter_map(|event| match event {
        DaemonEvent::Stopped { at_us, .. } => Some(*at_us),
        _ => None,
    });

    for sealed_at in seals {
        let resumed_at = record
            .commands
            .iter()
            .copied()
            .find(|at| *at >= sealed_at)
            .unwrap_or(u64::MAX);
        let leaked: Vec<_> = rig
            .writes()
            .into_iter()
            .filter(|write| write.at_us > sealed_at && write.at_us < resumed_at)
            .collect();

        prop_assert!(leaked.is_empty(), "writes after the safe state: {leaked:?}");
    }

    Ok(())
}

fn sweep() -> Vec<Step> {
    (0..80)
        .map(|index| {
            let angle = 0.6 * (index as f32 * 0.1).sin();

            Step::Intent(vec![angle, -angle, angle / 2.0])
        })
        .collect()
}

#[test]
fn the_checker_sees_real_motion() {
    for family in [Family::Feetech, Family::Dynamixel] {
        let (rig, record) = run(family, &sweep());
        let goals = rig
            .writes()
            .iter()
            .filter(|write| write.address == registers(family).goal)
            .count();

        assert!(goals > 100, "only {goals} goal writes: the property would be vacuous");
        check(&rig, &record).unwrap();
    }
}

#[test]
fn the_checker_catches_a_goal_running_ahead_of_a_stuck_joint() {
    let mut steps = vec![Step::Inject(Fault::StuckMotor { id: 1 })];

    steps.extend((0..60).map(|_| Step::Intent(vec![1.4, 0.0, 0.0])));

    let (rig, record) = run(Family::Feetech, &steps);
    let ahead = servo_wire::feetech::raw_frame(0xFE, 0x83, &[42, 2, 1, 0x00, 0x0A]);

    check(&rig, &record).unwrap();
    rig.tap.record(rig.now() - 5_000, &ahead);
    assert!(check(&rig, &record).is_err());
}

#[test]
fn the_checker_catches_a_planted_jump() {
    let (rig, record) = run(Family::Feetech, &sweep());
    let jump = servo_wire::feetech::raw_frame(0xFE, 0x83, &[42, 2, 1, 0x00, 0x0C]);

    rig.tap.record(rig.now(), &jump);
    assert!(check(&rig, &record).is_err());
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 256, ..ProptestConfig::default() })]

    #[test]
    fn no_unsafe_write_under_any_input_sequence(
        dynamixel in any::<bool>(),
        steps in proptest::collection::vec(step_strategy(), 1..60),
    ) {
        let family = if dynamixel { Family::Dynamixel } else { Family::Feetech };
        let (rig, record) = run(family, &steps);

        check(&rig, &record)?;
    }
}
