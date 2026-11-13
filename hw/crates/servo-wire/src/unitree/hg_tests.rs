use super::*;

fn sample_cmd() -> LowCmd {
    let mut cmd = LowCmd {
        mode_machine: 5,
        ..LowCmd::default()
    };

    for (k, motor) in cmd.motor_cmd.iter_mut().enumerate() {
        motor.mode = 1;
        motor.q = 0.1 * k as f32;
        motor.kp = 60.0;
        motor.kd = 1.5;
    }

    cmd.motor_cmd[29].q = 0.5;
    cmd
}

fn sample_state() -> LowState {
    let mut state = LowState {
        version: [1, 2],
        mode_machine: 5,
        tick: 1234,
        ..LowState::default()
    };

    state.imu_state.quaternion[0] = 1.0;
    state.imu_state.temperature = 30;

    for (k, motor) in state.motor_state.iter_mut().enumerate() {
        let k16 = i16::try_from(k).unwrap();

        motor.mode = 1;
        motor.q = 0.01 * k as f32;
        motor.dq = -0.02 * k as f32;
        motor.tau_est = 0.5;
        motor.temperature = [30 + k16, 31 + k16];
        motor.vol = 24.5;
        motor.sensor[0] = u32::try_from(k).unwrap();
    }

    for (i, byte) in state.wireless_remote.iter_mut().enumerate() {
        *byte = u8::try_from(i).unwrap();
    }

    state
}

#[test]
fn the_crc_matches_unitree_sdk2_over_the_c_struct_layout() {
    assert_eq!(sample_cmd().image().len(), 1004);
    assert_eq!(sample_cmd().computed_crc(), 0x7672_f636);
    assert_eq!(sample_state().image().len(), 2092);
    assert_eq!(sample_state().computed_crc(), 0xe5b6_24a9);
}

#[test]
fn the_wire_carries_cdr_with_its_own_alignment() {
    assert_eq!(sample_cmd().encode().len(), 4 + 1000);
    assert_eq!(sample_state().encode().len(), 4 + 2088);
}

#[test]
fn low_cmd_survives_the_wire() {
    let cmd = sample_cmd().with_crc();
    let back = LowCmd::decode(&cmd.encode()).unwrap();

    assert_eq!(back, cmd);
    assert!(back.crc_ok());
}

#[test]
fn low_state_survives_the_wire() {
    let state = sample_state().with_crc();
    let back = LowState::decode(&state.encode()).unwrap();

    assert_eq!(back, state);
    assert!(back.crc_ok());
}

#[test]
fn a_changed_value_breaks_the_crc() {
    let mut cmd = sample_cmd().with_crc();

    cmd.motor_cmd[3].q += 0.001;
    assert!(!cmd.crc_ok());
}

#[test]
fn a_truncated_sample_is_refused() {
    let bytes = sample_state().encode();

    assert!(LowState::decode(&bytes[..bytes.len() - 1]).is_err());
    assert!(LowCmd::decode(&sample_cmd().encode()[..500]).is_err());
}
