use super::*;
use servo_wire::unitree::g1::RIGHT_SHOULDER_PITCH;

fn arm_sdk(weight: f32, shoulder: f32) -> Sample {
    let mut command = LowCmd::default();

    for motor in servo_wire::unitree::g1::WRITABLE {
        command.motor_cmd[motor] = MotorCmd {
            mode: 1,
            q: STAND_POSE[motor],
            kp: 60.0,
            kd: 1.5,
            ..MotorCmd::default()
        };
    }

    command.motor_cmd[RIGHT_SHOULDER_PITCH].q = shoulder;
    command.motor_cmd[WEIGHT_SLOT].q = weight;

    Sample {
        topic: Topic::ArmSdk,
        payload: command.with_crc().encode(),
    }
}

fn states(published: &[(u64, Sample)]) -> Vec<LowState> {
    published
        .iter()
        .filter(|(_, sample)| sample.topic == Topic::LowState)
        .map(|(_, sample)| LowState::decode(&sample.payload).unwrap())
        .collect()
}

#[test]
fn lowstate_arrives_every_two_milliseconds_with_a_good_crc() {
    let mut g1 = G1Emulator::new(G1Options::default());
    let published = states(&g1.advance_to(20_000));

    assert_eq!(published.len(), 10);
    assert!(published.iter().all(LowState::crc_ok));
    assert_eq!(published[0].mode_machine, MODE_MACHINE);
    assert!((published[0].motor_state[3].q - STAND_POSE[3]).abs() < 1e-3);
}

#[test]
fn a_weighted_arm_sdk_command_moves_the_arm() {
    let mut g1 = G1Emulator::new(G1Options::default());

    g1.deliver(&arm_sdk(1.0, 0.8));
    g1.advance_to(2_000_000);

    assert!((g1.position(RIGHT_SHOULDER_PITCH) - 0.8).abs() < 0.03);
    assert_eq!(g1.counters().accepted, 1);
}

#[test]
fn weight_zero_leaves_the_arm_with_its_own_controller() {
    let mut g1 = G1Emulator::new(G1Options::default());

    g1.deliver(&arm_sdk(0.0, 0.8));
    g1.advance_to(2_000_000);

    assert!((g1.position(RIGHT_SHOULDER_PITCH) - STAND_POSE[RIGHT_SHOULDER_PITCH]).abs() < 0.03);
}

#[test]
fn an_arm_sdk_command_with_a_bad_crc_is_refused() {
    let mut g1 = G1Emulator::new(G1Options::default());
    let mut sample = arm_sdk(1.0, 0.8);
    let crc_at = sample.payload.len() - 1;

    sample.payload[crc_at] ^= 0x40;
    g1.deliver(&sample);
    g1.advance_to(1_000_000);

    assert_eq!(g1.counters().refused_crc, 1);
    assert_eq!(g1.weight(), 0.0);
    assert!((g1.position(RIGHT_SHOULDER_PITCH) - STAND_POSE[RIGHT_SHOULDER_PITCH]).abs() < 0.03);
}

#[test]
fn leg_entries_are_counted_and_ignored() {
    let mut g1 = G1Emulator::new(G1Options::default());
    let mut command = LowCmd::decode(&arm_sdk(1.0, 0.3).payload).unwrap();

    command.motor_cmd[3] = MotorCmd {
        mode: 1,
        q: 1.5,
        kp: 300.0,
        ..MotorCmd::default()
    };
    g1.deliver(&Sample {
        topic: Topic::ArmSdk,
        payload: command.with_crc().encode(),
    });
    g1.advance_to(1_000_000);

    assert_eq!(g1.counters().leg_writes, 1);
    assert!((g1.position(3) - STAND_POSE[3]).abs() < 0.03);
}

#[test]
fn the_loco_service_reports_the_fsm() {
    for (fault, fsm) in [(None, LOCOMOTION_FSM), (Some(G1Fault::NotBalancing), DAMP_FSM)] {
        let mut g1 = G1Emulator::new(G1Options { seed: 1, fault });

        g1.deliver(&Sample {
            topic: Topic::LocoRequest,
            payload: Request::get_fsm_id(9).encode(),
        });

        let answers: Vec<Response> = g1
            .advance_to(1_000)
            .iter()
            .filter(|(_, sample)| sample.topic == Topic::LocoResponse)
            .map(|(_, sample)| Response::decode(&sample.payload).unwrap())
            .collect();

        assert_eq!(answers.len(), 1);
        assert_eq!(answers[0].id, 9);
        assert_eq!(answers[0].data_number(), Some(fsm));
    }
}

#[test]
fn faults_show_on_the_wire() {
    let mut silent = G1Emulator::new(G1Options {
        seed: 1,
        fault: Some(G1Fault::Silent),
    });
    let mut garbled = G1Emulator::new(G1Options {
        seed: 1,
        fault: Some(G1Fault::BadCrc),
    });
    let mut down = G1Emulator::new(G1Options {
        seed: 1,
        fault: Some(G1Fault::MotorDown { motor: 20 }),
    });

    assert!(states(&silent.advance_to(20_000)).is_empty());
    assert!(states(&garbled.advance_to(20_000)).iter().all(|state| !state.crc_ok()));
    assert_ne!(states(&down.advance_to(20_000))[0].motor_state[20].motorstate, 0);
}

#[test]
fn hidden_parameters_come_from_the_seed() {
    let a = G1Emulator::new(G1Options { seed: 4, fault: None });
    let b = G1Emulator::new(G1Options { seed: 4, fault: None });
    let c = G1Emulator::new(G1Options { seed: 5, fault: None });

    assert_eq!(a.hidden(20), b.hidden(20));
    assert_ne!(a.hidden(20), c.hidden(20));
}
