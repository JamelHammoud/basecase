mod g1rig;

use g1rig::{weight_of, G1Rig, SHOULDER};
use proptest::prelude::*;
use robot_daemon::ladder::Mode;
use robot_daemon::safety::{ARM_KD, ARM_KP, WEIGHT_FALL_PER_TICK, WEIGHT_RISE_PER_TICK};
use robot_daemon::Command;
use servo_emu::g1::{G1Fault, G1Options, STAND_POSE};
use servo_wire::unitree::g1::{LEGS, LIMITS, WEIGHT_SLOT, WRITABLE};
use servo_wire::unitree::{LowCmd, MotorCmd};
use std::f32::consts::TAU;
use std::sync::atomic::Ordering;

const COUNT_RAD: f32 = TAU / 4096.0;
const STEP_RAD: f32 = 6.0 * COUNT_RAD;
const CALIBRATED_RAD: f32 = 2.8;

#[derive(Debug, Clone)]
enum Step {
    Intent(Vec<f32>),
    Reach(f32),
    SkipHeartbeat,
    CorruptState,
    Silence,
    Order(Command),
}

struct Action {
    sealed_before: bool,
    first: usize,
    last: usize,
    present: Vec<Option<f32>>,
}

fn value_strategy() -> impl Strategy<Value = f32> {
    prop_oneof![
        6 => -3.5f32..3.5,
        1 => Just(f32::NAN),
        1 => Just(f32::INFINITY),
        1 => Just(1e30f32),
    ]
}

fn step_strategy() -> impl Strategy<Value = Step> {
    prop_oneof![
        6 => proptest::collection::vec(value_strategy(), 15..19).prop_map(Step::Intent),
        6 => (-3.5f32..3.5).prop_map(Step::Reach),
        1 => Just(Step::SkipHeartbeat),
        1 => Just(Step::CorruptState),
        1 => Just(Step::Silence),
        2 => prop_oneof![
            Just(Command::Stop),
            Just(Command::Fall),
            Just(Command::Release),
            Just(Command::ClearFault),
            Just(Command::Enter(Mode::SetUp)),
            Just(Command::Enter(Mode::Test)),
            Just(Command::Enter(Mode::Rehearse)),
        ]
        .prop_map(Step::Order),
    ]
}

fn present(rig: &G1Rig) -> Vec<Option<f32>> {
    WRITABLE
        .map(|motor| {
            rig.daemon
                .reading()
                .and_then(|reading| reading.motors.get(motor))
                .map(|m| m.q)
        })
        .collect()
}

fn act(rig: &mut G1Rig, record: &mut Vec<Action>, action: impl FnOnce(&mut G1Rig)) {
    let sealed_before = rig.daemon.is_sealed();
    let first = rig.published().len();

    action(rig);
    record.push(Action {
        sealed_before,
        first,
        last: rig.published().len(),
        present: present(rig),
    });
}

fn apply(rig: &mut G1Rig, record: &mut Vec<Action>, step: &Step) {
    rig.client_alive = true;
    rig.corrupt_state.store(false, Ordering::SeqCst);
    rig.robot.lock().unwrap().set_fault(None);

    match step {
        Step::Intent(values) => rig.target = values.clone(),
        Step::Reach(value) => rig.target[SHOULDER] = *value,
        Step::SkipHeartbeat => rig.client_alive = false,
        Step::CorruptState => rig.corrupt_state.store(true, Ordering::SeqCst),
        Step::Silence => rig.robot.lock().unwrap().set_fault(Some(G1Fault::Silent)),
        Step::Order(command) => {
            let command = command.clone();

            act(rig, record, |rig| {
                let _ = rig.command(command);
            });
        }
    }

    for _ in 0..3 {
        act(rig, record, G1Rig::tick);
    }
}

fn run(latency_us: u64, steps: &[Step]) -> (G1Rig, Vec<Action>) {
    let mut rig = G1Rig::with(G1Options { seed: 3, fault: None }, latency_us);
    let mut record = Vec::new();

    act(&mut rig, &mut record, |rig| rig.ticks(5));
    act(&mut rig, &mut record, |rig| {
        let _ = rig.command(Command::Enter(Mode::SetUp));
        let _ = rig.command(Command::Enter(Mode::Test));
    });

    for _ in 0..60 {
        act(&mut rig, &mut record, G1Rig::tick);
    }

    for step in steps {
        apply(&mut rig, &mut record, step);
    }

    (rig, record)
}

fn check_fields(command: &LowCmd) -> Result<(), String> {
    let weight = weight_of(command);

    if !(0.0..=1.0).contains(&weight) {
        return Err(format!("weight {weight}"));
    }

    if command.motor_cmd[LEGS]
        .iter()
        .any(|motor| *motor != MotorCmd::default())
    {
        return Err("a leg was written".into());
    }

    if command.motor_cmd[WEIGHT_SLOT + 1..]
        .iter()
        .any(|motor| *motor != MotorCmd::default())
    {
        return Err("a slot past the weight was written".into());
    }

    for motor in WRITABLE {
        let cmd = command.motor_cmd[motor];
        let (min, max) = LIMITS[motor];
        let inside = cmd.q >= min.max(-CALIBRATED_RAD) - COUNT_RAD && cmd.q <= max.min(CALIBRATED_RAD) + COUNT_RAD;

        if !(cmd.q.is_finite() && inside) {
            return Err(format!("motor {motor} goal {} outside its range", cmd.q));
        }

        if (cmd.mode, cmd.kp, cmd.kd, cmd.tau, cmd.dq) != (1, ARM_KP, ARM_KD, 0.0, 0.0) {
            return Err(format!("motor {motor} gains or feed-forward changed: {cmd:?}"));
        }
    }

    Ok(())
}

fn check_motion(previous: &LowCmd, command: &LowCmd, measured: &[Option<f32>]) -> Result<(), String> {
    let change = weight_of(command) - weight_of(previous);

    if change > WEIGHT_RISE_PER_TICK + 1e-5 || -change > WEIGHT_FALL_PER_TICK + 1e-5 {
        return Err(format!(
            "weight jumped {} → {}",
            weight_of(previous),
            weight_of(command)
        ));
    }

    for (index, motor) in WRITABLE.enumerate() {
        let q = command.motor_cmd[motor].q;
        let stepped = (q - previous.motor_cmd[motor].q).abs() <= STEP_RAD + COUNT_RAD;
        let held = measured[index].is_some_and(|m| (q - m).abs() <= COUNT_RAD);

        if !(stepped || held) {
            return Err(format!(
                "motor {motor} jumped to {q} from {}",
                previous.motor_cmd[motor].q
            ));
        }
    }

    Ok(())
}

fn check(published: &[(u64, LowCmd)], record: &[Action]) -> Result<(), String> {
    let mut previous: Option<&LowCmd> = None;

    for action in record {
        if action.sealed_before && action.last > action.first {
            return Err("an arm command was sent after the layer sealed".into());
        }

        for (_, command) in &published[action.first..action.last] {
            check_fields(command)?;

            if let Some(previous) = previous {
                check_motion(previous, command, &action.present)?;
            }

            previous = Some(command);
        }
    }

    Ok(())
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 128, ..ProptestConfig::default() })]

    #[test]
    fn no_unsafe_write_reaches_the_g1(
        latency_us in prop_oneof![Just(0u64), 1_000u64..20_000],
        steps in proptest::collection::vec(step_strategy(), 1..30),
    ) {
        let (rig, record) = run(latency_us, &steps);

        prop_assert_eq!(check(&rig.published(), &record), Ok(()));
        prop_assert_eq!(rig.robot.lock().unwrap().counters().leg_writes, 0);
    }
}

fn reaching_session() -> (G1Rig, Vec<Action>) {
    let goal = STAND_POSE[servo_wire::unitree::g1::RIGHT_SHOULDER_PITCH] + 0.4;

    run(4_000, &vec![Step::Reach(goal); 40])
}

#[test]
fn the_checker_sees_real_motion() {
    let (rig, record) = reaching_session();
    let shoulders: Vec<f32> = rig
        .published()
        .iter()
        .map(|(_, command)| command.motor_cmd[servo_wire::unitree::g1::RIGHT_SHOULDER_PITCH].q)
        .collect();
    let travel = shoulders
        .iter()
        .fold(0.0f32, |most, q| most.max((q - shoulders[0]).abs()));

    assert_eq!(check(&rig.published(), &record), Ok(()));
    assert!(travel > 0.3, "the shoulder only travelled {travel} rad");
}

#[test]
fn the_checker_catches_a_planted_jump() {
    let (rig, record) = reaching_session();
    let mut published = rig.published();
    let planted = published.len() - 5;

    published[planted].1.motor_cmd[servo_wire::unitree::g1::RIGHT_SHOULDER_PITCH].q += 0.2;

    assert!(check(&published, &record).is_err());
}

#[test]
fn the_checker_catches_a_planted_weight_drop() {
    let (rig, record) = reaching_session();
    let mut published = rig.published();
    let planted = published.len() - 5;

    published[planted].1.motor_cmd[WEIGHT_SLOT].q = 0.0;

    assert!(check(&published, &record).is_err());
}
