mod g1rig;

use g1rig::G1Rig;
use robot_daemon::caps::{TICK_US, WATCHDOG_US};
use robot_daemon::fault::Fault;
use robot_daemon::g1::{G1Run, LOST_STATE_US};
use servo_emu::g1::G1Fault;

const HAND_BACK_US: u64 = 100_000;

fn assert_beginner_message(message: &str) {
    let lower = message.to_lowercase();

    assert!(message.ends_with('.'), "{message}");
    assert!(message.len() <= 200, "{message}");
    assert!(
        ["0x", "crc", "dds", "nan", "please", "oops", "invalid"]
            .iter()
            .all(|word| !lower.contains(word)),
        "{message}"
    );
}

fn assert_handed_back(rig: &G1Rig, onset_us: u64, detect_limit_us: u64, code: &str) {
    let (fault_at, found, message) = rig.first_fault().expect("no fault reported");
    let handed_back = rig.handed_back_at(fault_at).expect("the weight never reached 0");

    assert_eq!(found, code);
    assert!(
        fault_at - onset_us <= detect_limit_us,
        "noticed after {} us",
        fault_at - onset_us
    );
    assert!(
        handed_back - fault_at <= HAND_BACK_US,
        "handed back after {} us",
        handed_back - fault_at
    );
    assert_eq!(rig.robot_weight(), 0.0);
    assert_eq!(rig.daemon.run(), G1Run::Stopped);
    assert!(rig.daemon.is_sealed());
    assert!(rig.published_after(handed_back).is_empty(), "wrote after handing back");
    assert_beginner_message(&message);
}

#[test]
fn fault_g1_lowstate_lost() {
    let mut rig = G1Rig::new();

    rig.climb_to_test();
    rig.ticks(10);

    let onset = rig.now();

    rig.robot.lock().unwrap().set_fault(Some(G1Fault::Silent));
    rig.ticks(20);

    assert_handed_back(&rig, onset, LOST_STATE_US + 2 * TICK_US, "lowstate_lost");
    assert_eq!(Fault::StateLost.code(), "lowstate_lost");
}

#[test]
fn fault_g1_app_lost() {
    let mut rig = G1Rig::new();

    rig.climb_to_test();
    rig.ticks(10);

    let onset = rig.now();

    rig.client_alive = false;
    rig.ticks(20);

    assert_handed_back(&rig, onset, WATCHDOG_US + 2 * TICK_US, "client_lost");
}

#[test]
fn a_motor_error_while_running_hands_the_arms_back() {
    let mut rig = G1Rig::new();

    rig.climb_to_test();

    let onset = rig.now();

    rig.robot
        .lock()
        .unwrap()
        .set_fault(Some(G1Fault::MotorDown { motor: 26 }));
    rig.ticks(10);

    assert_handed_back(&rig, onset, 2 * TICK_US, "motor_error");
    assert!(rig.first_fault().unwrap().2.contains("motor 26"));
}
