mod ros2rig;

use proptest::prelude::*;
use robot_daemon::caps::{BASE_FORWARD_STEP_M_S, BASE_TURN_STEP_RAD_S, FIRST_RUN, TICK_US};
use robot_daemon::ladder::Mode;
use robot_daemon::Command;
use ros2rig::{decode, Ros2Rig, Sent, Tamper, ARM, CALIBRATED_RAD, COUNT_RAD, WHEELS};
use servo_emu::ros2::{Ros2Fault, Ros2Options};
use servo_wire::ros2::{ControllerKind, Float64MultiArray, Twist};
use servo_wire::Topic;
use std::sync::atomic::Ordering;

const STEP_RAD: f64 = 6.0 * COUNT_RAD as f64;
const SLACK: f64 = 1e-6;
const ELBOW: usize = 2;

#[derive(Debug, Clone)]
enum Step {
    Intent(Vec<f32>),
    Reach(usize, f32),
    SkipHeartbeat,
    StaleGap,
    Silence,
    Tamper(Tamper),
    Order(Command),
}

struct Action {
    sealed_before: bool,
    first: usize,
    last: usize,
    measured: Vec<Option<f64>>,
}

fn value_strategy() -> impl Strategy<Value = f32> {
    prop_oneof![
        6 => -3.5f32..3.5,
        1 => Just(f32::NAN),
        1 => Just(f32::INFINITY),
        1 => Just(1e30f32),
    ]
}

fn kind_strategy() -> impl Strategy<Value = ControllerKind> {
    prop_oneof![
        Just(ControllerKind::ForwardPosition),
        Just(ControllerKind::JointTrajectory),
        Just(ControllerKind::DiffDrive),
    ]
}

fn step_strategy() -> impl Strategy<Value = Step> {
    prop_oneof![
        5 => proptest::collection::vec(value_strategy(), 1..8).prop_map(Step::Intent),
        6 => (0usize..6, -3.5f32..3.5).prop_map(|(joint, value)| Step::Reach(joint, value)),
        1 => Just(Step::SkipHeartbeat),
        1 => Just(Step::StaleGap),
        1 => Just(Step::Silence),
        2 => prop_oneof![
            Just(Tamper::NotANumber),
            Just(Tamper::Huge),
            Just(Tamper::Garbage),
            Just(Tamper::Duplicate),
        ]
        .prop_map(Step::Tamper),
        2 => prop_oneof![
            Just(Command::Stop),
            Just(Command::Fall),
            Just(Command::Release),
            Just(Command::ClearFault),
            Just(Command::Recheck),
            Just(Command::Enter(Mode::SetUp)),
            Just(Command::Enter(Mode::Test)),
            Just(Command::Enter(Mode::Rehearse)),
        ]
        .prop_map(Step::Order),
    ]
}

fn act(rig: &mut Ros2Rig, record: &mut Vec<Action>, action: impl FnOnce(&mut Ros2Rig)) {
    let sealed_before = rig.daemon.is_sealed();
    let first = rig.published().len();

    action(rig);
    record.push(Action {
        sealed_before,
        first,
        last: rig.published().len(),
        measured: rig.measured(),
    });
}

fn apply(rig: &mut Ros2Rig, record: &mut Vec<Action>, step: &Step) {
    rig.client_alive = true;
    rig.intents_flow = true;
    rig.set_tamper(Tamper::Pass);
    rig.robot.lock().unwrap().set_fault(None);

    match step {
        Step::Intent(values) => rig.target = values.clone(),
        Step::Reach(joint, value) => {
            let at = joint % rig.target.len().max(1);

            if let Some(slot) = rig.target.get_mut(at) {
                *slot = *value;
            }
        }
        Step::SkipHeartbeat => rig.client_alive = false,
        Step::StaleGap => rig.intents_flow = false,
        Step::Silence => rig.robot.lock().unwrap().set_fault(Some(Ros2Fault::Silent)),
        Step::Tamper(tamper) => rig.set_tamper(*tamper),
        Step::Order(command) => {
            let command = command.clone();

            act(rig, record, |rig| {
                let _ = rig.command(command);
            });
        }
    }

    for _ in 0..3 {
        act(rig, record, Ros2Rig::tick);
    }
}

fn options(kind: ControllerKind, seed: u64) -> Ros2Options {
    let joints: &[&str] = if kind == ControllerKind::DiffDrive {
        &WHEELS
    } else {
        &ARM
    };
    let mut options = Ros2Options::new(kind, joints);

    options.seed = seed;
    options
}

fn run(options: Ros2Options, latency_us: u64, steps: &[Step]) -> (Ros2Rig, Vec<Action>) {
    let mut rig = Ros2Rig::with(options, latency_us);
    let mut record = Vec::new();

    act(&mut rig, &mut record, |rig| rig.ticks(5));
    act(&mut rig, &mut record, |rig| {
        let _ = rig.command(Command::Enter(Mode::SetUp));
        let _ = rig.command(Command::Enter(Mode::Test));
    });

    for _ in 0..20 {
        act(&mut rig, &mut record, Ros2Rig::tick);
    }

    for step in steps {
        apply(&mut rig, &mut record, step);
    }

    (rig, record)
}

#[derive(Debug, Clone, PartialEq)]
enum Command2 {
    Goals(Vec<f64>),
    Speed(f64, f64),
}

fn read(kind: ControllerKind, topic: Topic, payload: &[u8]) -> Result<Command2, String> {
    if topic != kind.command_topic() {
        return Err(format!("{topic:?} written for a {} controller", kind.as_str()));
    }

    match decode(topic, payload) {
        Sent::Positions(goals) if goals.len() == ARM.len() => Ok(Command2::Goals(goals)),
        Sent::Trajectory(trajectory) => {
            let named = trajectory.joint_names == ARM.map(String::from);
            let point = trajectory.points.first().filter(|_| trajectory.points.len() == 1);

            match point {
                Some(point)
                    if named
                        && point.positions.len() == ARM.len()
                        && point.time_from_start.as_micros() == Some(TICK_US) =>
                {
                    Ok(Command2::Goals(point.positions.clone()))
                }
                _ => Err(format!("a malformed trajectory: {trajectory:?}")),
            }
        }
        Sent::Twist(twist) if [twist.linear.y, twist.linear.z, twist.angular.x, twist.angular.y] == [0.0; 4] => {
            Ok(Command2::Speed(twist.linear.x, twist.angular.z))
        }
        other => Err(format!("a malformed command: {other:?}")),
    }
}

fn check_goals(previous: Option<&Command2>, goals: &[f64], measured: &[Option<f64>]) -> Result<(), String> {
    let limit = f64::from(CALIBRATED_RAD + COUNT_RAD);

    for (joint, goal) in goals.iter().enumerate() {
        if !goal.is_finite() || goal.abs() > limit {
            return Err(format!("joint {joint} goal {goal} outside its range"));
        }

        let stepped = match previous {
            Some(Command2::Goals(before)) => (goal - before[joint]).abs() <= STEP_RAD + f64::from(COUNT_RAD),
            _ => false,
        };
        let held = measured[joint].is_some_and(|now| (goal - now).abs() <= f64::from(COUNT_RAD));

        if !(stepped || held) {
            return Err(format!("joint {joint} jumped to {goal} from {previous:?}"));
        }
    }

    Ok(())
}

fn check_speed(previous: Option<&Command2>, forward: f64, turn: f64) -> Result<(), String> {
    let capped = forward.abs() <= f64::from(FIRST_RUN.base_forward_m_s) + SLACK
        && turn.abs() <= f64::from(FIRST_RUN.base_turn_rad_s) + SLACK;
    let (was_forward, was_turn) = match previous {
        Some(Command2::Speed(forward, turn)) => (*forward, *turn),
        _ => (0.0, 0.0),
    };
    let ramped = (forward - was_forward).abs() <= f64::from(BASE_FORWARD_STEP_M_S) + SLACK
        && (turn - was_turn).abs() <= f64::from(BASE_TURN_STEP_RAD_S) + SLACK;
    let halted = forward == 0.0 && turn == 0.0;

    if !capped || !(ramped || halted) {
        return Err(format!("twist ({forward}, {turn}) after ({was_forward}, {was_turn})"));
    }

    Ok(())
}

fn check(kind: ControllerKind, published: &[(u64, Topic, Vec<u8>)], record: &[Action]) -> Result<(), String> {
    let mut previous: Option<Command2> = None;

    for action in record {
        if action.sealed_before && action.last > action.first {
            return Err("a command was sent after the layer sealed".into());
        }

        for (_, topic, payload) in &published[action.first..action.last] {
            let command = read(kind, *topic, payload)?;

            match &command {
                Command2::Goals(goals) => check_goals(previous.as_ref(), goals, &action.measured)?,
                Command2::Speed(forward, turn) => check_speed(previous.as_ref(), *forward, *turn)?,
            }

            previous = Some(command);
        }
    }

    Ok(())
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 128, ..ProptestConfig::default() })]

    #[test]
    fn no_unsafe_write_reaches_a_ros2_robot(
        kind in kind_strategy(),
        seed in 1u64..1000,
        latency_us in prop_oneof![Just(0u64), 1_000u64..20_000],
        steps in proptest::collection::vec(step_strategy(), 1..30),
    ) {
        let (rig, record) = run(options(kind, seed), latency_us, &steps);

        prop_assert_eq!(check(kind, &rig.published(), &record), Ok(()));
    }
}

fn reaching_session(kind: ControllerKind) -> (Ros2Rig, Vec<Action>) {
    let probe = Ros2Rig::with(options(kind, 3), 4_000);
    let goal = if kind == ControllerKind::DiffDrive {
        1.0
    } else {
        probe.target[ELBOW] + 0.5
    };

    let reach = Step::Reach(if kind == ControllerKind::DiffDrive { 0 } else { ELBOW }, goal);

    run(options(kind, 3), 4_000, &vec![reach; 40])
}

#[test]
fn the_checker_sees_real_motion() {
    let (rig, record) = reaching_session(ControllerKind::ForwardPosition);
    let elbows: Vec<f64> = rig
        .published()
        .iter()
        .filter_map(
            |(_, topic, payload)| match read(ControllerKind::ForwardPosition, *topic, payload) {
                Ok(Command2::Goals(goals)) => Some(goals[ELBOW]),
                _ => None,
            },
        )
        .collect();
    let travel = elbows.iter().fold(0.0f64, |most, q| most.max((q - elbows[0]).abs()));

    assert_eq!(
        check(ControllerKind::ForwardPosition, &rig.published(), &record),
        Ok(())
    );
    assert!(travel > 0.3, "the elbow only travelled {travel} rad");
}

#[test]
fn the_checker_catches_a_planted_jump() {
    let (rig, record) = reaching_session(ControllerKind::ForwardPosition);
    let mut published = rig.published();
    let planted = published.len() - 5;
    let mut goals = Float64MultiArray::decode(&published[planted].2).unwrap();

    goals.data[ELBOW] += 0.2;
    published[planted].2 = goals.encode();

    assert!(check(ControllerKind::ForwardPosition, &published, &record).is_err());
}

#[test]
fn the_checker_catches_a_twist_over_the_cap() {
    let (rig, record) = reaching_session(ControllerKind::DiffDrive);
    let mut published = rig.published();
    let planted = published.len() - 5;

    assert_eq!(check(ControllerKind::DiffDrive, &published, &record), Ok(()));
    published[planted].2 = Twist::planar(0.5, 0.0).encode();
    assert!(check(ControllerKind::DiffDrive, &published, &record).is_err());
    assert!(rig.client_alive && !rig.daemon.is_sealed() && Ordering::SeqCst == Ordering::SeqCst);
}
