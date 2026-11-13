use super::*;
use crate::ros2::START_SPREAD_RAD;
use servo_wire::ros2::{Float64MultiArray, JointTrajectory, JointTrajectoryPoint, Ros2Error, Twist};

const ARM: [&str; 3] = ["shoulder", "elbow", "wrist"];
const WHEELS: [&str; 2] = ["left_wheel", "right_wheel"];

fn arm(controller: ControllerKind) -> Ros2Emulator {
    Ros2Emulator::new(Ros2Options::new(controller, &ARM)).unwrap()
}

fn faulty(fault: Ros2Fault) -> Ros2Emulator {
    Ros2Emulator::new(Ros2Options {
        fault: Some(fault),
        ..Ros2Options::new(ControllerKind::ForwardPosition, &ARM)
    })
    .unwrap()
}

fn positions(data: &[f64]) -> Sample {
    Sample {
        topic: Topic::PositionCommands,
        payload: Float64MultiArray::new(data.to_vec()).encode(),
    }
}

fn trajectory(names: &[&str], points: &[(&[f64], u64)]) -> Sample {
    let message = JointTrajectory {
        joint_names: names.iter().map(|name| (*name).to_string()).collect(),
        points: points
            .iter()
            .map(|(at, micros)| JointTrajectoryPoint::at(at.to_vec(), Time::from_micros(*micros)))
            .collect(),
        ..JointTrajectory::default()
    };

    Sample {
        topic: Topic::TrajectoryCommands,
        payload: message.encode(),
    }
}

fn twist(forward: f64, turn: f64) -> Sample {
    Sample {
        topic: Topic::CmdVel,
        payload: Twist::planar(forward, turn).encode(),
    }
}

fn decoded(published: &[(u64, Sample)]) -> Vec<Result<JointState, Ros2Error>> {
    published
        .iter()
        .filter(|(_, sample)| sample.topic == Topic::JointStates)
        .map(|(_, sample)| JointState::decode(&sample.payload))
        .collect()
}

fn close(actual: Vec<f64>, expected: &[f64], within: f64) {
    for (got, want) in actual.iter().zip(expected) {
        assert!((got - want).abs() < within, "{actual:?} against {expected:?}");
    }
}

#[test]
fn joint_states_arrive_every_ten_milliseconds_with_every_joint() {
    let mut robot = arm(ControllerKind::ForwardPosition);
    let states = decoded(&robot.advance_to(100_000));

    assert_eq!(states.len(), 10);

    for state in states {
        let state = state.unwrap();

        assert_eq!(state.name.len(), 3);
        assert_eq!(state.velocity.len(), 3);
        assert_eq!(state.effort.len(), 3);
    }

    assert_eq!(robot.counters().states, 10);
}

#[test]
fn the_starting_pose_is_within_a_fifth_of_a_radian() {
    for seed in 0..20 {
        let robot = Ros2Emulator::new(Ros2Options {
            seed,
            ..Ros2Options::new(ControllerKind::ForwardPosition, &ARM)
        })
        .unwrap();

        assert!(robot.positions().iter().all(|q| q.abs() <= START_SPREAD_RAD));
    }
}

#[test]
fn a_forward_position_command_reaches_its_target_and_holds() {
    let mut robot = arm(ControllerKind::ForwardPosition);
    let target = [0.6, -0.4, 1.0];

    robot.deliver(&positions(&target));
    robot.advance_to(2_000_000);

    close(robot.positions(), &target, 0.03);
    assert_eq!(robot.setpoint(), Some(target.to_vec()));
    assert_eq!(robot.base_velocity(), None);
    assert_eq!(robot.counters().accepted, 1);
}

#[test]
fn a_forward_position_command_of_the_wrong_length_is_ignored() {
    let mut robot = arm(ControllerKind::ForwardPosition);

    robot.deliver(&positions(&[0.5, 0.5, 0.5]));
    robot.advance_to(1_000_000);

    let held = robot.positions();

    robot.deliver(&positions(&[-1.0, -1.0]));
    robot.advance_to(2_000_000);

    close(robot.positions(), &held, 0.01);
    assert_eq!(robot.counters().rejected, 1);
}

#[test]
fn a_trajectory_is_followed_by_joint_name_in_any_order() {
    let mut robot = arm(ControllerKind::JointTrajectory);

    robot.deliver(&trajectory(
        &["wrist", "shoulder", "elbow"],
        &[(&[0.2, 0.4, 0.0], 500_000), (&[0.9, -0.5, 0.3], 1_000_000)],
    ));
    robot.advance_to(2_500_000);

    close(robot.positions(), &[-0.5, 0.3, 0.9], 0.03);
    assert_eq!(robot.counters().accepted, 1);
}

#[test]
fn a_trajectory_interpolates_from_the_current_setpoint() {
    let mut robot = arm(ControllerKind::JointTrajectory);

    robot.deliver(&trajectory(&ARM, &[(&[0.0, 0.0, 0.0], 100_000)]));
    robot.advance_to(1_000_000);
    robot.deliver(&trajectory(&ARM, &[(&[1.0, 1.0, 1.0], 2_000_000)]));
    robot.advance_to(2_000_000);

    close(robot.positions(), &[0.5, 0.5, 0.5], 0.1);
}

#[test]
fn a_trajectory_naming_an_unknown_or_missing_joint_is_ignored() {
    let mut robot = arm(ControllerKind::JointTrajectory);

    robot.deliver(&trajectory(&ARM, &[(&[0.1, 0.1, 0.1], 100_000)]));
    robot.advance_to(1_000_000);

    let held = robot.positions();

    robot.deliver(&trajectory(
        &["shoulder", "elbow", "gripper"],
        &[(&[1.0, 1.0, 1.0], 100_000)],
    ));
    robot.deliver(&trajectory(&["shoulder", "elbow"], &[(&[1.0, 1.0], 100_000)]));
    robot.advance_to(2_000_000);

    close(robot.positions(), &held, 0.01);
    assert_eq!(robot.counters().rejected, 2);
}

#[test]
fn a_trajectory_whose_times_go_backwards_is_ignored() {
    let mut robot = arm(ControllerKind::JointTrajectory);

    robot.deliver(&trajectory(
        &ARM,
        &[(&[1.0, 1.0, 1.0], 500_000), (&[0.0, 0.0, 0.0], 400_000)],
    ));

    assert_eq!(robot.counters().rejected, 1);
}

#[test]
fn a_twist_turns_the_wheels_the_right_way_and_stops_after_the_timeout() {
    let mut robot = Ros2Emulator::new(Ros2Options::new(ControllerKind::DiffDrive, &WHEELS)).unwrap();
    let start = robot.positions();

    robot.deliver(&twist(0.2, 0.0));
    robot.advance_to(400_000);

    let rolled = robot.positions();

    assert!(rolled[0] > start[0] && rolled[1] > start[1], "{rolled:?}");

    robot.deliver(&twist(0.0, 1.0));
    robot.advance_to(800_000);

    let turned = robot.positions();

    assert!(turned[1] - rolled[1] > turned[0] - rolled[0], "{turned:?}");

    robot.advance_to(3_000_000);

    let stopped = robot.positions();

    robot.advance_to(4_000_000);
    close(robot.positions(), &stopped, 1e-9);
    assert_eq!(robot.base_velocity(), Some((0.0, 0.0)));
    assert_eq!(robot.setpoint(), None);
}

#[test]
fn a_command_for_another_controller_is_not_ours() {
    let mut robot = arm(ControllerKind::ForwardPosition);

    robot.deliver(&twist(1.0, 0.0));
    robot.deliver(&trajectory(&ARM, &[(&[1.0, 1.0, 1.0], 100_000)]));

    assert_eq!(robot.counters(), Ros2Counters::default());
}

#[test]
fn unreadable_commands_are_ignored_and_counted() {
    let mut robot = arm(ControllerKind::ForwardPosition);
    let mut garbled = positions(&[0.5, 0.5, 0.5]);

    garbled.payload.truncate(10);
    robot.deliver(&garbled);
    robot.deliver(&Sample {
        topic: Topic::PositionCommands,
        payload: Vec::new(),
    });

    assert_eq!(robot.counters().unreadable, 2);
    assert_eq!(robot.counters().accepted, 0);
}

#[test]
fn joints_are_published_in_a_seeded_permutation() {
    let orders: Vec<Vec<String>> = (0..8)
        .map(|seed| {
            let mut robot = Ros2Emulator::new(Ros2Options {
                seed,
                ..Ros2Options::new(ControllerKind::ForwardPosition, &ARM)
            })
            .unwrap();
            let state = decoded(&robot.advance_to(JOINT_STATES_EVERY_US)).remove(0).unwrap();

            assert_eq!(robot.publish_order(), state.name);
            state.name
        })
        .collect();

    assert!(orders.iter().any(|order| order != &ARM));

    for order in orders {
        let mut sorted = order.clone();

        sorted.sort();
        assert_eq!(sorted, ["elbow", "shoulder", "wrist"]);
    }
}

#[test]
fn a_silent_robot_publishes_nothing() {
    let mut robot = faulty(Ros2Fault::Silent);

    assert!(robot.advance_to(100_000).is_empty());
    assert_eq!(robot.counters().states, 0);
}

#[test]
fn a_missing_joint_is_left_out_of_joint_states() {
    let mut robot = faulty(Ros2Fault::MissingJoint("elbow".to_string()));
    let state = decoded(&robot.advance_to(JOINT_STATES_EVERY_US)).remove(0).unwrap();

    assert_eq!(state.name.len(), 2);
    assert_eq!(state.position_of("elbow"), None);
}

#[test]
fn an_extra_joint_is_added_to_joint_states() {
    let mut robot = faulty(Ros2Fault::ExtraJoint("gripper".to_string()));
    let state = decoded(&robot.advance_to(JOINT_STATES_EVERY_US)).remove(0).unwrap();

    assert_eq!(state.name.len(), 4);
    assert_eq!(state.position_of("gripper"), Some(0.0));
}

#[test]
fn a_malformed_joint_state_carries_a_nan_position() {
    let mut robot = faulty(Ros2Fault::Malformed);
    let states = decoded(&robot.advance_to(JOINT_STATES_EVERY_US));

    assert_eq!(states, [Err(Ros2Error::NotFinite)]);
}

#[test]
fn hidden_parameters_come_from_the_seed() {
    let seeded = |seed| {
        Ros2Emulator::new(Ros2Options {
            seed,
            ..Ros2Options::new(ControllerKind::ForwardPosition, &ARM)
        })
        .unwrap()
    };
    let base = |seed| {
        Ros2Emulator::new(Ros2Options {
            seed,
            ..Ros2Options::new(ControllerKind::DiffDrive, &WHEELS)
        })
        .unwrap()
    };

    assert_eq!(seeded(4).hidden(1), seeded(4).hidden(1));
    assert_ne!(seeded(4).hidden(1), seeded(5).hidden(1));
    assert_ne!(base(4).hidden(0), base(5).hidden(0));
    assert_eq!(seeded(4).hidden(3), None);
}

#[test]
fn a_spec_the_controller_cannot_drive_is_refused() {
    let wheels = Ros2Options::new(ControllerKind::DiffDrive, &ARM);
    let topic = Ros2Options {
        controller_topic: "/cmd_vel".to_string(),
        ..Ros2Options::new(ControllerKind::ForwardPosition, &ARM)
    };

    assert!(Ros2Emulator::new(wheels).is_err());
    assert!(Ros2Emulator::new(topic).is_err());
}
