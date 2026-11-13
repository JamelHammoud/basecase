use super::*;
use crate::cdr::{Writer, HEADER};
use proptest::prelude::*;

fn state(names: &[&str], position: Vec<f64>) -> JointState {
    JointState {
        header: Header::default(),
        name: names.iter().map(|name| name.to_string()).collect(),
        position,
        ..JointState::default()
    }
}

fn names(count: usize) -> Vec<String> {
    (0..count).map(|at| format!("j{at}")).collect()
}

fn claiming(count: u32) -> Vec<u8> {
    let mut writer = Writer::new();

    writer.i32(0);
    writer.u32(0);
    writer.string("");
    writer.u32(count);
    writer.u32(2);
    writer.u8(b'a');
    writer.u8(0);
    writer.finish()
}

#[test]
fn a_joint_state_with_ten_thousand_entries_is_refused_at_its_count() {
    let huge = JointState {
        name: names(10_000),
        position: vec![0.0; 10_000],
        ..JointState::default()
    };

    assert_eq!(JointState::decode(&huge.encode()), Err(Ros2Error::TooMany));
    assert_eq!(JointState::decode(&claiming(10_000)), Err(Ros2Error::TooMany));
    assert_eq!(JointState::decode(&claiming(u32::MAX)), Err(Ros2Error::TooMany));
}

#[test]
fn a_count_larger_than_the_bytes_left_is_refused_before_reading() {
    assert_eq!(JointState::decode(&claiming(60)), Err(Ros2Error::Short));
}

#[test]
fn sixty_four_joints_decode_and_sixty_five_do_not() {
    let most = JointState {
        name: names(64),
        position: vec![0.1; 64],
        ..JointState::default()
    };
    let over = JointState {
        name: names(65),
        position: vec![0.1; 65],
        ..JointState::default()
    };

    assert_eq!(JointState::decode(&most.encode()), Ok(most));
    assert_eq!(JointState::decode(&over.encode()), Err(Ros2Error::TooMany));
}

#[test]
fn a_joint_state_with_a_nan_or_infinite_position_is_refused() {
    let nan = state(&["a", "b"], vec![0.0, f64::NAN]);
    let infinite = state(&["a"], vec![f64::INFINITY]);
    let mut unknown_velocity = state(&["a"], vec![0.0]);

    unknown_velocity.velocity = vec![f64::NAN];

    assert_eq!(JointState::decode(&nan.encode()), Err(Ros2Error::NotFinite));
    assert_eq!(JointState::decode(&infinite.encode()), Err(Ros2Error::NotFinite));
    assert!(JointState::decode(&unknown_velocity.encode()).is_ok());
}

#[test]
fn a_joint_state_whose_counts_disagree_is_refused() {
    let short_positions = state(&["a", "b"], vec![0.0]);
    let mut wrong_velocity = state(&["a", "b"], vec![0.0, 0.0]);
    let mut wrong_effort = state(&["a", "b"], vec![0.0, 0.0]);

    wrong_velocity.velocity = vec![1.0];
    wrong_effort.effort = vec![1.0, 2.0, 3.0];

    assert_eq!(
        JointState::decode(&short_positions.encode()),
        Err(Ros2Error::Mismatched)
    );
    assert_eq!(JointState::decode(&wrong_velocity.encode()), Err(Ros2Error::Mismatched));
    assert_eq!(JointState::decode(&wrong_effort.encode()), Err(Ros2Error::Mismatched));
}

#[test]
fn a_joint_state_naming_a_joint_twice_is_refused() {
    let twice = state(&["a", "b", "a"], vec![0.0, 0.0, 0.0]);

    assert_eq!(JointState::decode(&twice.encode()), Err(Ros2Error::Duplicate));
}

#[test]
fn strings_must_be_short_terminated_utf8_without_inner_nul() {
    let long = state(&[&"x".repeat(257)], vec![0.0]);
    let longest = state(&[&"x".repeat(256)], vec![0.0]);
    let inner_nul = state(&["a\0b"], vec![0.0]);
    let mut unterminated = Writer::new();

    unterminated.i32(0);
    unterminated.u32(0);
    unterminated.u32(1);
    unterminated.u8(b'x');

    assert_eq!(JointState::decode(&long.encode()), Err(Ros2Error::TooLong));
    assert!(JointState::decode(&longest.encode()).is_ok());
    assert_eq!(JointState::decode(&inner_nul.encode()), Err(Ros2Error::NotText));
    assert_eq!(JointState::decode(&unterminated.finish()), Err(Ros2Error::NotText));
}

#[test]
fn not_utf8_is_refused() {
    let mut payload = state(&["ab"], vec![0.0]).encode();
    let at = payload.windows(2).position(|pair| pair == b"ab").unwrap();

    payload[at] = 0xFF;

    assert_eq!(JointState::decode(&payload), Err(Ros2Error::NotText));
}

type Decodes = fn(&[u8]) -> bool;

fn samples() -> Vec<(Vec<u8>, Decodes)> {
    let trajectory = JointTrajectory {
        joint_names: names(2),
        points: vec![JointTrajectoryPoint::at(vec![0.1, 0.2], Time::from_micros(500_000))],
        ..JointTrajectory::default()
    };

    vec![
        (state(&["a", "b"], vec![0.1, 0.2]).encode(), |bytes| {
            JointState::decode(bytes).is_ok()
        }),
        (Float64MultiArray::new(vec![0.1, 0.2]).encode(), |bytes| {
            Float64MultiArray::decode(bytes).is_ok()
        }),
        (trajectory.encode(), |bytes| JointTrajectory::decode(bytes).is_ok()),
        (Twist::planar(0.1, 0.2).encode(), |bytes| Twist::decode(bytes).is_ok()),
    ]
}

#[test]
fn every_truncated_message_is_refused() {
    for (payload, decodes) in samples() {
        assert!(decodes(&payload));

        for cut in 0..payload.len() {
            assert!(!decodes(&payload[..cut]), "cut at {cut} of {}", payload.len());
        }
    }
}

#[test]
fn command_messages_have_the_same_caps() {
    let too_much = Float64MultiArray::new(vec![0.0; 65]);
    let nan = Float64MultiArray::new(vec![0.0, f64::NAN]);
    let point = JointTrajectoryPoint::at(vec![0.0], Time::default());
    let too_many_points = JointTrajectory {
        joint_names: names(1),
        points: vec![point.clone(); 65],
        ..JointTrajectory::default()
    };
    let twice = JointTrajectory {
        joint_names: vec!["a".into(), "a".into()],
        points: vec![JointTrajectoryPoint::at(vec![0.0, 0.0], Time::default())],
        ..JointTrajectory::default()
    };
    let short_point = JointTrajectory {
        joint_names: names(2),
        points: vec![point],
        ..JointTrajectory::default()
    };
    let nan_point = JointTrajectory {
        joint_names: names(1),
        points: vec![JointTrajectoryPoint::at(vec![f64::NAN], Time::default())],
        ..JointTrajectory::default()
    };

    assert_eq!(Float64MultiArray::decode(&too_much.encode()), Err(Ros2Error::TooMany));
    assert_eq!(Float64MultiArray::decode(&nan.encode()), Err(Ros2Error::NotFinite));
    assert_eq!(
        JointTrajectory::decode(&too_many_points.encode()),
        Err(Ros2Error::TooMany)
    );
    assert_eq!(JointTrajectory::decode(&twice.encode()), Err(Ros2Error::Duplicate));
    assert_eq!(
        JointTrajectory::decode(&short_point.encode()),
        Err(Ros2Error::Mismatched)
    );
    assert_eq!(JointTrajectory::decode(&nan_point.encode()), Err(Ros2Error::NotFinite));
    assert_eq!(
        Twist::decode(&Twist::planar(f64::INFINITY, 0.0).encode()),
        Err(Ros2Error::NotFinite)
    );
}

fn joint_state() -> impl Strategy<Value = JointState> {
    let stamp = (any::<i32>(), any::<u32>(), "[a-z_]{0,12}");

    (0usize..8, any::<bool>(), any::<bool>(), stamp).prop_flat_map(|(count, moving, pushing, stamp)| {
        let (sec, nanosec, frame_id) = stamp;

        (
            prop::collection::vec(-10.0f64..10.0, count),
            prop::collection::vec(-10.0f64..10.0, if moving { count } else { 0 }),
            prop::collection::vec(any::<f64>(), if pushing { count } else { 0 }),
        )
            .prop_map(move |(position, velocity, effort)| JointState {
                header: Header {
                    stamp: Time { sec, nanosec },
                    frame_id: frame_id.clone(),
                },
                name: names(count),
                position,
                velocity,
                effort,
            })
    })
}

fn trajectory() -> impl Strategy<Value = JointTrajectory> {
    (1usize..6, 0usize..5).prop_flat_map(|(joints, points)| {
        prop::collection::vec(
            (
                prop::collection::vec(-3.0f64..3.0, joints),
                0i32..5,
                0u32..1_000_000_000,
            ),
            points,
        )
        .prop_map(move |points| JointTrajectory {
            header: Header::default(),
            joint_names: names(joints),
            points: points
                .into_iter()
                .map(|(positions, sec, nanosec)| JointTrajectoryPoint::at(positions, Time { sec, nanosec }))
                .collect(),
        })
    })
}

proptest! {
    #[test]
    fn decoding_random_bytes_never_panics(body in prop::collection::vec(any::<u8>(), 0..512)) {
        let mut payload = HEADER.to_vec();

        payload.extend_from_slice(&body);

        let _ = JointState::decode(&payload);
        let _ = Float64MultiArray::decode(&payload);
        let _ = JointTrajectory::decode(&payload);
        let _ = Twist::decode(&payload);
        let _ = JointState::decode(&body);
    }

    #[test]
    fn joint_states_round_trip(state in joint_state()) {
        let decoded = JointState::decode(&state.encode()).unwrap();

        prop_assert_eq!(decoded.encode(), state.encode());
    }

    #[test]
    fn trajectories_round_trip(trajectory in trajectory()) {
        prop_assert_eq!(JointTrajectory::decode(&trajectory.encode()), Ok(trajectory));
    }

    #[test]
    fn arrays_and_twists_round_trip(data in prop::collection::vec(-1e6f64..1e6, 0..64), twist in prop::array::uniform6(-1e3f64..1e3)) {
        let array = Float64MultiArray::new(data);
        let twist = Twist {
            linear: Vector3 { x: twist[0], y: twist[1], z: twist[2] },
            angular: Vector3 { x: twist[3], y: twist[4], z: twist[5] },
        };

        prop_assert_eq!(Float64MultiArray::decode(&array.encode()), Ok(array));
        prop_assert_eq!(Twist::decode(&twist.encode()), Ok(twist));
    }
}
