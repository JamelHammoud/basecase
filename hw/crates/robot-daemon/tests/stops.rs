mod common;

use common::Rig;
use faultbox::Schedule;
use robot_daemon::ladder::Mode;
use robot_daemon::{Command, DaemonEvent, Run};
use servo_wire::Family;

fn feetech_goal(rig: &Rig, id: u8) -> i32 {
    i32::from(rig.servo_register(id, 42)) | (i32::from(rig.servo_register(id, 43)) << 8)
}

fn feetech_position(rig: &Rig, id: u8) -> i32 {
    i32::from(rig.servo_register(id, 56)) | (i32::from(rig.servo_register(id, 57)) << 8)
}

fn torque_limit_writes(rig: &Rig, after_us: u64) -> Vec<u32> {
    rig.writes_after(after_us)
        .into_iter()
        .filter(|write| write.address == 48)
        .map(|write| u32::from(u16::from_le_bytes([write.data[0], write.data[1]])))
        .collect()
}

#[test]
fn the_robot_is_not_sealed_while_it_runs() {
    let mut rig = Rig::new(Family::Feetech, Schedule::new());

    rig.start_test();
    assert!(rig.running());
    assert!(!rig.daemon.is_sealed());
}

#[test]
fn a_fall_softens_the_motors_to_ten_percent() {
    let mut rig = Rig::new(Family::Feetech, Schedule::new());

    rig.start_test();

    let at = rig.now();

    rig.command(Command::Fall).unwrap();
    rig.ticks(5);
    assert_eq!(torque_limit_writes(&rig, at - 1), vec![100; 3]);
    assert!(rig.daemon.is_sealed());
}

#[test]
fn a_fall_never_raises_the_torque_limit() {
    let mut rig = Rig::new(Family::Feetech, Schedule::new());

    rig.command(Command::Enter(Mode::SetUp)).unwrap();
    rig.command(Command::Enter(Mode::Test)).unwrap();
    rig.ticks(3);

    let at = rig.now();

    rig.command(Command::Fall).unwrap();
    rig.ticks(3);

    let limits = torque_limit_writes(&rig, at - 1);

    assert!(!limits.is_empty());
    assert!(
        limits.iter().all(|limit| *limit <= 60),
        "a fall raised torque: {limits:?}"
    );
}

#[test]
fn a_stop_holds_where_the_joint_is_not_where_it_was_heading() {
    let mut rig = Rig::new(Family::Feetech, Schedule::new());

    rig.target = Some(vec![0.0, 0.0, 0.0]);
    rig.start_test();
    rig.target = Some(vec![1.2, 0.0, 0.0]);
    rig.ticks(15);

    let heading = feetech_goal(&rig, 1);

    rig.command(Command::Stop).unwrap();
    rig.ticks(50);

    let held = feetech_goal(&rig, 1);
    let position = feetech_position(&rig, 1);

    assert_ne!(held, heading, "the goal should move back to the measured position");
    assert!((held - position).abs() <= 3, "held at {held}, joint at {position}");
    assert!(matches!(rig.daemon.run(), Run::Stopped));
}

#[test]
fn an_artefact_change_while_moving_holds_the_robot_and_voids_its_evidence() {
    let mut rig = Rig::new(Family::Dynamixel, Schedule::new());

    rig.climb_to_first_run();
    rig.command(Command::Enter(Mode::Look)).unwrap();
    rig.events.clear();
    rig.artefacts.set_policy(Some(b"policy v2".to_vec()));
    rig.command(Command::Recheck).unwrap();
    assert_eq!(rig.daemon.mode(), Mode::Look);

    let refused = rig.command(Command::Enter(Mode::SetUp));

    assert!(refused.is_ok());
    rig.command(Command::Enter(Mode::Test)).unwrap();
    rig.tick_until(80, Rig::running);
    rig.artefacts
        .set_calibration(Some(common::CALIBRATION.replace("1.5", "1.4").into_bytes()));
    rig.command(Command::Recheck).unwrap();
    rig.ticks(3);

    assert!(rig
        .events
        .iter()
        .any(|event| matches!(event, DaemonEvent::Stopped { .. })));
    assert!(
        rig.daemon.is_sealed(),
        "an artefact change while moving holds the robot"
    );
    assert_eq!(
        rig.command(Command::Enter(Mode::Rehearse)).unwrap_err(),
        "Test every joint with the current calibration first."
    );
}
