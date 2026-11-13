mod ros2rig;

use robot_daemon::caps::{TICK_US, WATCHDOG_US};
use robot_daemon::fault::Fault;
use robot_daemon::ros2::{Ros2Run, LOST_STATE_US};
use ros2rig::{positions_of, Ros2Rig, COUNT_RAD};
use servo_emu::ros2::Ros2Fault;
use servo_wire::ros2::ControllerKind;

const HOLD_US: u64 = 100_000;

fn assert_beginner_message(message: &str) {
    let lower = message.to_lowercase();

    assert!(message.ends_with('.'), "{message}");
    assert!(message.len() < 200, "{message}");
    assert!(
        ["0x", "dds", "cdr", "nan", "please", "oops", "invalid", "servo"]
            .iter()
            .all(|word| !lower.contains(word)),
        "{message}"
    );
}

fn assert_held(rig: &Ros2Rig, onset_us: u64, detect_limit_us: u64, code: &str) -> u64 {
    let (fault_at, found, message) = rig.first_fault().expect("no fault reported");
    let after = rig.sent_after(fault_at - 1);
    let (held_at, hold) = after.first().expect("no hold was published");
    let measured = rig.measured();
    let goals = positions_of(hold).expect("the hold isn't a position command");

    assert_eq!(found, code);
    assert!(
        fault_at - onset_us <= detect_limit_us,
        "noticed after {} us",
        fault_at - onset_us
    );
    assert!(held_at - fault_at <= HOLD_US, "held after {} us", held_at - fault_at);
    assert!(
        goals
            .iter()
            .zip(&measured)
            .all(|(goal, now)| (goal - now.unwrap()).abs() <= f64::from(COUNT_RAD)),
        "held at {goals:?}, measured {measured:?}"
    );
    assert_eq!(after.len(), 1, "wrote after the hold: {after:?}");
    assert_eq!(rig.daemon.run(), Ros2Run::Stopped);
    assert!(rig.daemon.is_sealed());
    assert_beginner_message(&message);
    eprintln!(
        "{code}: noticed {} us after onset, held {} us after",
        fault_at - onset_us,
        held_at - fault_at
    );

    held_at - onset_us
}

#[test]
fn fault_ros2_joint_states_lost() {
    let mut rig = Ros2Rig::arm(ControllerKind::ForwardPosition);

    rig.climb_to_test();
    rig.ticks(10);

    let onset = rig.now();

    rig.robot.lock().unwrap().set_fault(Some(Ros2Fault::Silent));
    rig.ticks(20);

    let stopped = assert_held(&rig, onset, LOST_STATE_US + 2 * TICK_US, "joint_states_lost");

    assert!(stopped <= HOLD_US, "held {stopped} us after the robot went quiet");
    assert_eq!(Fault::JointStatesLost.code(), "joint_states_lost");
}

#[test]
fn fault_ros2_app_lost() {
    let mut rig = Ros2Rig::arm(ControllerKind::JointTrajectory);

    rig.climb_to_test();
    rig.ticks(10);

    let onset = rig.now();

    rig.client_alive = false;
    rig.ticks(20);

    assert_held(&rig, onset, WATCHDOG_US + 2 * TICK_US, "client_lost");
}

#[test]
fn a_nan_intent_holds_a_base_at_zero_twist() {
    let mut rig = Ros2Rig::base();

    rig.climb_to_test();
    rig.target = vec![0.2, 0.0];
    rig.ticks(30);
    rig.target = vec![f32::NAN, 0.0];
    rig.ticks(5);

    let (fault_at, code, message) = rig.first_fault().expect("no fault");
    let after = rig.sent_after(fault_at - 1);

    assert_eq!(code, "intent_not_finite");
    assert_eq!(after.len(), 1);
    assert!(matches!(&after[0].1, ros2rig::Sent::Twist(twist) if twist.linear.x == 0.0 && twist.angular.z == 0.0));
    assert!(rig.daemon.is_sealed());
    assert_beginner_message(&message);
}
