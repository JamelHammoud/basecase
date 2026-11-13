use super::*;
use crate::cdr::HEADER;

fn framed(body: &[u8]) -> Vec<u8> {
    let mut payload = HEADER.to_vec();

    payload.extend_from_slice(body);
    payload
}

#[test]
fn joint_state_is_stamp_then_frame_id_then_names_then_counted_f64s_each_padded_to_8_from_the_body() {
    let state = JointState {
        header: Header {
            stamp: Time { sec: 1, nanosec: 2 },
            frame_id: String::new(),
        },
        name: vec!["abcd".into()],
        position: vec![0.5],
        velocity: vec![],
        effort: vec![2.0],
    };
    let body: [u8; 64] = [
        1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, b'a', b'b', b'c', b'd', 0, 0, 0, 0, 1,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xE0, 0x3F, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x40,
    ];

    assert_eq!(state.encode(), framed(&body));
    assert_eq!(JointState::decode(&framed(&body)), Ok(state));
}

#[test]
fn float64_multi_array_is_dimensions_of_label_size_stride_then_offset_then_f64_data_padded_to_8() {
    let array = Float64MultiArray {
        layout: MultiArrayLayout {
            dim: vec![MultiArrayDimension {
                label: "x".into(),
                size: 2,
                stride: 2,
            }],
            data_offset: 0,
        },
        data: vec![1.0, -2.0],
    };
    let body: [u8; 48] = [
        1, 0, 0, 0, 2, 0, 0, 0, b'x', 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0xF0, 0x3F, 0, 0, 0, 0, 0, 0, 0, 0xC0,
    ];

    assert_eq!(array.encode(), framed(&body));
    assert_eq!(Float64MultiArray::decode(&framed(&body)), Ok(array));
}

#[test]
fn joint_trajectory_is_header_then_names_then_points_of_four_f64_sequences_and_a_sec_nanosec_duration() {
    let trajectory = JointTrajectory {
        header: Header::default(),
        joint_names: vec!["j".into()],
        points: vec![JointTrajectoryPoint::at(vec![0.25], Duration { sec: 1, nanosec: 500 })],
    };
    let body: [u8; 68] = [
        0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, b'j', 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xD0, 0x3F, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0xF4, 0x01, 0, 0,
    ];

    assert_eq!(trajectory.encode(), framed(&body));
    assert_eq!(JointTrajectory::decode(&framed(&body)), Ok(trajectory));
}

#[test]
fn twist_is_six_unpadded_f64_linear_xyz_then_angular_xyz() {
    let twist = Twist::planar(0.5, -1.0);
    let mut body = [0u8; 48];

    body[6..8].copy_from_slice(&[0xE0, 0x3F]);
    body[46..48].copy_from_slice(&[0xF0, 0xBF]);

    assert_eq!(twist.encode(), framed(&body));
    assert_eq!(Twist::decode(&framed(&body)), Ok(twist));
}

#[test]
fn time_converts_to_and_from_microseconds() {
    let time = Time::from_micros(3_250_017);

    assert_eq!(
        time,
        Time {
            sec: 3,
            nanosec: 250_017_000
        }
    );
    assert_eq!(time.as_micros(), Some(3_250_017));
    assert_eq!(Time { sec: -1, nanosec: 0 }.as_micros(), None);
}
