mod common;

use common::{assert_safe_stop, Rig};
use faultbox::Schedule;
use robot_daemon::fault::daemon_lost_message;
use robot_daemon::policy::Policy;
use servo_wire::Family;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

const LIMIT_US: u64 = 140_000;

#[derive(Clone, Default)]
struct Switches {
    poison: Arc<AtomicBool>,
    hang: Arc<AtomicBool>,
}

struct ScriptedPolicy {
    switches: Switches,
}

impl Policy for ScriptedPolicy {
    fn act(&mut self, observation: &[f32], action: &mut Vec<f32>) -> Result<(), String> {
        while self.switches.hang.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(5));
        }

        action.clear();
        action.extend(observation.iter().step_by(2).take(3));

        if self.switches.poison.load(Ordering::SeqCst) {
            action[0] = f32::NAN;
        }

        Ok(())
    }
}

fn policy_rig(family: Family) -> (Rig, Switches) {
    let switches = Switches::default();
    let mut rig = Rig::new(family, Schedule::new());

    rig.attach_policy(Box::new(ScriptedPolicy {
        switches: switches.clone(),
    }));
    rig.climb_to_first_run();

    (rig, switches)
}

#[test]
fn fault_daemon_host_death() {
    for family in [Family::Feetech, Family::Dynamixel] {
        let mut rig = Rig::new(family, Schedule::new());

        rig.start_test();

        let onset = rig.now();

        rig.client_alive = false;
        rig.tick_until(50, |rig| rig.sealed_at().is_some());
        rig.ticks(25);

        let verdict = assert_safe_stop(&rig, onset, LIMIT_US, &["client_lost"]);

        assert!(rig.torque_on(1), "an arm that loses its app holds its pose");
        assert!(verdict.message.contains("holding still"));
    }

    let mut rig = Rig::new(Family::Dynamixel, Schedule::new());

    rig.start_test();

    let died_at = rig.now();
    let writes_before = rig.writes().len();
    let mut tripped_at = None;

    for step in 1..=30u64 {
        let now = died_at + step * 10_000;

        rig.bus.lock().unwrap().advance_to(now);

        if tripped_at.is_none() && rig.servo_register(1, 98) == 0xFF {
            tripped_at = Some(now);
        }
    }

    let tripped_at = tripped_at.expect("the Dynamixel bus watchdog never stopped the servo");

    assert!(
        tripped_at - died_at <= 120_000,
        "watchdog took {} us",
        tripped_at - died_at
    );
    assert_eq!(rig.writes().len(), writes_before);
    common::assert_beginner_message(&daemon_lost_message(Family::Dynamixel));

    let mut feetech = Rig::new(Family::Feetech, Schedule::new());

    feetech.start_test();

    let held = feetech.bus.lock().unwrap().servo(1).unwrap().register(56);

    feetech.bus.lock().unwrap().advance_to(feetech.now() + 1_000_000);

    let later = feetech.bus.lock().unwrap().servo(1).unwrap().register(56);

    assert!(
        feetech.torque_on(1),
        "Feetech servos have no bus watchdog and keep holding"
    );
    assert!(
        held.abs_diff(later) <= 8,
        "a held Feetech servo should not drift far: {held} then {later}"
    );
    common::assert_beginner_message(&daemon_lost_message(Family::Feetech));
}

#[test]
fn fault_policy_nan() {
    for family in [Family::Feetech, Family::Dynamixel] {
        let (mut rig, switches) = policy_rig(family);

        assert_eq!(rig.first_fault(), None, "climbing to first run should be clean");
        rig.events.clear();

        let onset = rig.now();

        switches.poison.store(true, Ordering::SeqCst);
        rig.tick_until(50, |rig| rig.sealed_at().is_some());
        rig.ticks(25);

        let verdict = assert_safe_stop(&rig, onset, LIMIT_US, &["policy_not_finite"]);

        assert!(verdict.message.contains("isn't a number"));
        assert!(rig.torque_on(1), "an arm holds when its policy misbehaves");
    }
}

#[test]
fn fault_policy_hang() {
    for family in [Family::Feetech, Family::Dynamixel] {
        let (mut rig, switches) = policy_rig(family);

        assert_eq!(rig.first_fault(), None, "climbing to first run should be clean");
        rig.events.clear();

        let onset = rig.now();

        switches.hang.store(true, Ordering::SeqCst);
        rig.tick_until(50, |rig| rig.sealed_at().is_some());
        rig.ticks(25);

        let verdict = assert_safe_stop(&rig, onset, LIMIT_US, &["policy_stale"]);

        assert!(verdict.message.contains("stopped answering"));
        assert!(
            rig.worst_tick < Duration::from_millis(15),
            "a hung policy must never slow the control loop: worst tick {:?}",
            rig.worst_tick
        );
    }
}
