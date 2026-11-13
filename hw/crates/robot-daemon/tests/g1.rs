mod g1rig;

use g1rig::{weight_of, G1Rig, SHOULDER};
use robot_daemon::g1::{G1Run, POLICY_RUNGS_OUT};
use robot_daemon::ladder::Mode;
use robot_daemon::protocol::g1_status_line;
use robot_daemon::safety::{WEIGHT_FALL_PER_TICK, WEIGHT_RISE_PER_TICK};
use robot_daemon::Command;
use servo_emu::g1::{G1Fault, G1Options, STAND_POSE};
use servo_wire::unitree::g1::{LEGS, RIGHT_SHOULDER_PITCH, WEIGHT_SLOT};
use servo_wire::unitree::MotorCmd;
use std::sync::atomic::Ordering;

#[test]
fn the_emulated_g1_follows_an_arm_intent_round_trip() {
    let mut rig = G1Rig::with(G1Options::default(), 4_000);
    let goal = STAND_POSE[RIGHT_SHOULDER_PITCH] + 0.3;

    rig.climb_to_test();
    rig.target[SHOULDER] = goal;
    rig.ticks(150);

    let status: serde_json::Value = serde_json::from_str(&g1_status_line(&rig.daemon)).unwrap();

    assert!((rig.shoulder() - goal).abs() < 0.03, "shoulder at {}", rig.shoulder());
    assert_eq!(rig.robot_weight(), 1.0);
    assert_eq!(status["joints"].as_array().unwrap().len(), 29);
    assert_eq!(status["mode"], "test");
    assert_eq!(status["weight"], 1.0);
}

#[test]
fn the_weight_rises_over_a_second_and_never_jumps() {
    let mut rig = G1Rig::new();

    rig.climb_to_test();

    let weights: Vec<f32> = rig.published().iter().map(|(_, command)| weight_of(command)).collect();

    assert_eq!(weights.first(), Some(&0.0));
    assert_eq!(weights.last(), Some(&1.0));
    assert!(weights.len() >= 50, "{} publications", weights.len());
    assert!(weights
        .windows(2)
        .all(|pair| pair[1] >= pair[0] && pair[1] - pair[0] <= WEIGHT_RISE_PER_TICK + 1e-6));
}

#[test]
fn a_stale_intent_hands_the_arms_back_within_100_ms() {
    let mut rig = G1Rig::new();

    rig.climb_to_test();
    rig.intents_flow = false;
    rig.ticks(20);

    let (fault_at, code, _) = rig.first_fault().expect("no fault");
    let handed_back = rig.handed_back_at(fault_at).expect("weight never reached 0");

    assert_eq!(code, "intent_stale");
    assert!(handed_back - fault_at <= 100_000, "{} us", handed_back - fault_at);
    assert_eq!(rig.robot_weight(), 0.0);
    assert_eq!(rig.daemon.run(), G1Run::Stopped);
    assert!(rig.published_after(handed_back).is_empty());
}

#[test]
fn the_weight_falls_in_steps_no_larger_than_the_ramp() {
    let mut rig = G1Rig::new();

    rig.climb_to_test();

    let before = rig.now();

    rig.command(Command::Stop).unwrap();
    rig.ticks(10);

    let weights: Vec<f32> = rig
        .published_after(before - 1)
        .iter()
        .map(|(_, c)| weight_of(c))
        .collect();

    assert_eq!(weights.last(), Some(&0.0));
    assert!(weights.len() <= 5);
    assert!(weights
        .windows(2)
        .all(|pair| pair[0] - pair[1] <= WEIGHT_FALL_PER_TICK + 1e-6));
}

#[test]
fn entering_test_again_while_the_arms_are_held_is_refused() {
    let mut rig = G1Rig::new();

    rig.climb_to_test();

    let before = rig.now();

    assert!(rig.command(Command::Enter(Mode::Test)).is_err());
    rig.ticks(5);

    assert_eq!(rig.daemon.run(), G1Run::Running);
    assert_eq!(rig.robot_weight(), 1.0);

    rig.command(Command::Stop).unwrap();
    rig.tick();

    assert!(rig.command(Command::Enter(Mode::Test)).is_err());
    rig.ticks(10);

    let weights: Vec<f32> = rig
        .published_after(before - 1)
        .iter()
        .map(|(_, c)| weight_of(c))
        .collect();

    assert_eq!(weights.last(), Some(&0.0));
    assert!(weights
        .windows(2)
        .all(|pair| pair[0] - pair[1] <= WEIGHT_FALL_PER_TICK + 1e-6));
    assert_eq!(rig.daemon.run(), G1Run::Stopped);
}

#[test]
fn set_up_says_when_the_loco_service_doesnt_answer() {
    let mut rig = G1Rig::new();

    rig.mute_loco.store(true, Ordering::SeqCst);
    rig.ticks(5);

    assert!(rig.command(Command::Enter(Mode::SetUp)).is_err());
    assert_eq!(
        rig.first_fault().map(|(_, code, _)| code).as_deref(),
        Some("loco_silent")
    );
    assert_eq!(rig.daemon.mode(), Mode::Look);
}

#[test]
fn a_lowstate_with_a_bad_crc_is_refused() {
    let mut rig = G1Rig::new();

    rig.climb_to_test();
    rig.corrupt_state.store(true, std::sync::atomic::Ordering::SeqCst);
    rig.tick();
    rig.corrupt_state.store(false, std::sync::atomic::Ordering::SeqCst);
    rig.ticks(5);
    assert!(rig.first_fault().is_none(), "one bad sample isn't a fault");

    let refused_before = rig.daemon.reading().unwrap().at_us;

    rig.corrupt_state.store(true, std::sync::atomic::Ordering::SeqCst);
    rig.ticks(10);

    let (fault_at, code, _) = rig.first_fault().expect("no fault");

    assert_eq!(code, "lowstate_crc");
    assert!(rig.daemon.reading().unwrap().at_us <= fault_at);
    assert!(rig.daemon.reading().unwrap().at_us >= refused_before);
    assert!(rig.handed_back_at(fault_at).unwrap() - fault_at <= 100_000);
}

#[test]
fn leg_joints_are_never_written() {
    let mut rig = G1Rig::new();

    rig.climb_to_test();

    for wild in [2.5f32, -2.5, 0.0, f32::NAN] {
        rig.target = vec![wild; rig.target.len()];
        rig.ticks(20);
    }

    let published = rig.published();

    assert!(!published.is_empty());

    for (_, command) in &published {
        assert!(command.motor_cmd[LEGS]
            .iter()
            .all(|motor| *motor == MotorCmd::default()));
        assert!(command.motor_cmd[WEIGHT_SLOT + 1..]
            .iter()
            .all(|motor| *motor == MotorCmd::default()));
    }

    assert_eq!(rig.robot.lock().unwrap().counters().leg_writes, 0);
}

#[test]
fn policy_rungs_stay_out_for_the_g1() {
    let mut rig = G1Rig::new();

    rig.climb_to_test();

    assert_eq!(
        rig.command(Command::Enter(Mode::Rehearse)),
        Err(POLICY_RUNGS_OUT.to_string())
    );
    assert_eq!(rig.daemon.mode(), Mode::Test);
}

#[test]
fn set_up_needs_every_motor_and_the_locomotion_mode() {
    for (fault, code) in [
        (G1Fault::MotorDown { motor: 25 }, "motors_missing"),
        (G1Fault::NotBalancing, "not_balancing"),
        (G1Fault::Silent, "lowstate_lost"),
    ] {
        let mut rig = G1Rig::with(
            G1Options {
                seed: 2,
                fault: Some(fault),
            },
            0,
        );

        rig.ticks(5);

        assert!(rig.command(Command::Enter(Mode::SetUp)).is_err());
        assert_eq!(rig.first_fault().map(|(_, code, _)| code).as_deref(), Some(code));
        assert_eq!(rig.daemon.mode(), Mode::Look);
        assert!(rig.published().is_empty());
    }
}

#[test]
fn look_and_set_up_never_publish_an_arm_command() {
    let mut rig = G1Rig::new();

    rig.ticks(10);
    rig.command(Command::Enter(Mode::SetUp)).unwrap();
    rig.ticks(10);

    assert!(rig.published().is_empty());
    assert!(rig.daemon.reading().is_some());
}

#[test]
fn release_after_a_stop_returns_to_look_without_writing() {
    let mut rig = G1Rig::new();

    rig.climb_to_test();
    rig.command(Command::Stop).unwrap();
    rig.ticks(10);

    let sealed_at = rig.now();

    rig.command(Command::Release).unwrap();
    rig.ticks(5);

    assert_eq!(rig.daemon.mode(), Mode::Look);
    assert!(rig.published_after(sealed_at).is_empty());
}
