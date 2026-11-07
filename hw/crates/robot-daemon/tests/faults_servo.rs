mod common;

use common::{assert_safe_stop, only_stop_writes_between, Rig};
use faultbox::{Fault, Schedule};
use servo_wire::Family;

const ONSET: u64 = 3_000_000;

fn ramping_rig(family: Family, schedule: Schedule) -> Rig {
    let mut rig = Rig::new(family, schedule);

    rig.target = Some(vec![0.0, 0.0, 0.0]);
    rig.start_test();

    while rig.now() < ONSET {
        rig.tick();
    }

    rig.target = Some(vec![0.6, 0.0, 0.0]);

    rig
}

fn goal_address(family: Family) -> u16 {
    match family {
        Family::Feetech => 42,
        Family::Dynamixel => 116,
    }
}

#[test]
fn fault_brownout_resets_servo() {
    for family in [Family::Feetech, Family::Dynamixel] {
        let schedule = Schedule::new().at(
            ONSET,
            Fault::Brownout {
                volts: 2.0,
                duration_us: 30_000,
            },
        );
        let mut rig = Rig::new(family, schedule);

        rig.start_test();
        rig.tick_until(400, |rig| rig.sealed_at().is_some());
        rig.ticks(50);

        let verdict = assert_safe_stop(&rig, ONSET, 200_000, &["servo_restarted", "no_reply", "bus_silent"]);
        let goal_writes = rig
            .writes_after(verdict.fault_at)
            .into_iter()
            .filter(|write| write.address == goal_address(family))
            .count();

        assert_eq!(
            goal_writes, 0,
            "a restarted servo must never be sent a goal, which could re-enable it"
        );

        for id in common::IDS {
            assert!(!rig.torque_on(id), "servo {id} was re-enabled after the brownout");
        }
    }
}

#[test]
fn fault_stuck_motor_overload() {
    for family in [Family::Feetech, Family::Dynamixel] {
        let mut rig = ramping_rig(family, Schedule::new().at(ONSET, Fault::StuckMotor { id: 1 }));

        rig.tick_until(400, |rig| rig.sealed_at().is_some());
        rig.ticks(25);

        let verdict = assert_safe_stop(&rig, ONSET, 1_000_000, &["stall"]);

        only_stop_writes_between(&rig, verdict.fault_at, verdict.sealed_at);
        assert!(verdict.message.contains("shoulder"));
        assert!(!rig.torque_on(1), "the stuck motor must be switched off");
        assert!(rig.torque_on(2) && rig.torque_on(3), "the other joints hold");
    }
}

#[test]
fn fault_overheat() {
    for family in [Family::Feetech, Family::Dynamixel] {
        let mut rig = Rig::new(
            family,
            Schedule::new().at(ONSET, Fault::Overheat { id: 3, watts: 60.0 }),
        );
        let mut crossed_at = None;

        rig.start_test();

        for _ in 0..2000 {
            let hot = {
                let mut bus = rig.bus.lock().unwrap();

                bus.advance_to(rig.now());
                bus.servo(3).unwrap().plant().temperature_c() >= 49.5
            };

            if hot && crossed_at.is_none() {
                crossed_at = Some(rig.now());
            }

            if rig.sealed_at().is_some() {
                break;
            }

            rig.tick();
        }

        rig.ticks(25);

        let crossed_at = crossed_at.expect("the servo never got hot");
        let verdict = assert_safe_stop(&rig, crossed_at, 100_000, &["overheat"]);

        only_stop_writes_between(&rig, verdict.fault_at, verdict.sealed_at);
        assert!(verdict.message.contains("50 °C"));
        assert!(!rig.torque_on(3));
        assert!(rig.torque_on(1) && rig.torque_on(2));
    }
}

#[test]
fn fault_wrong_direction() {
    for family in [Family::Feetech, Family::Dynamixel] {
        let mut rig = ramping_rig(family, Schedule::new().at(ONSET, Fault::InvertedDirection { id: 1 }));

        rig.tick_until(400, |rig| rig.sealed_at().is_some());
        rig.ticks(25);

        let verdict = assert_safe_stop(&rig, ONSET, 500_000, &["wrong_direction"]);

        only_stop_writes_between(&rig, verdict.fault_at, verdict.sealed_at);
        assert!(!rig.torque_on(1));
        assert!(rig.torque_on(2) && rig.torque_on(3));
    }
}
