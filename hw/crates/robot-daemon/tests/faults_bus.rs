mod common;

use common::{assert_safe_stop, Rig};
use faultbox::{Fault, Schedule};
use robot_daemon::ladder::Mode;
use robot_daemon::Command;
use servo_emu::inprocess::WINDOWS_LATENCY_US;
use servo_wire::Family;

const ONSET: u64 = 3_000_000;
const COMM_LIMIT_US: u64 = 100_000;

fn run_into(fault: Fault, family: Family) -> Rig {
    let mut rig = Rig::new(family, Schedule::new().at(ONSET, fault));

    rig.start_test();
    rig.tick_until(400, |rig| rig.sealed_at().is_some());
    rig.ticks(25);

    rig
}

#[test]
fn fault_unplug_mid_packet() {
    for family in [Family::Feetech, Family::Dynamixel] {
        let rig = run_into(Fault::UnplugMidPacket { after_reply_bytes: 5 }, family);

        assert_safe_stop(&rig, ONSET, COMM_LIMIT_US, &["no_reply", "bus_silent", "garbled"]);
    }

    let rig = run_into(Fault::AdapterGone, Family::Feetech);
    let verdict = assert_safe_stop(&rig, ONSET, COMM_LIMIT_US, &["bus_gone"]);

    assert!(verdict.message.contains("unplugged"));
}

#[test]
fn fault_corrupt_packets() {
    let mut rig = Rig::new(
        Family::Feetech,
        Schedule::new()
            .at(ONSET, Fault::BitFlip { replies: 1 })
            .at(ONSET + 400_000, Fault::Truncate { replies: 1 }),
    );

    rig.start_test();

    while rig.now() < ONSET + 800_000 {
        rig.tick();
    }

    assert_eq!(
        rig.first_fault(),
        None,
        "one damaged reply should be survived without a stop"
    );

    for family in [Family::Feetech, Family::Dynamixel] {
        let flipped = run_into(Fault::BitFlip { replies: 300 }, family);
        let verdict = assert_safe_stop(&flipped, ONSET, COMM_LIMIT_US, &["garbled", "no_reply", "wrong_id"]);

        assert_eq!(flipped.writes_after(verdict.fault_at), Vec::new());

        let truncated = run_into(Fault::Truncate { replies: 300 }, family);

        assert_safe_stop(&truncated, ONSET, COMM_LIMIT_US, &["garbled", "no_reply"]);
    }
}

#[test]
fn fault_wrong_id_answer() {
    for family in [Family::Feetech, Family::Dynamixel] {
        let rig = run_into(Fault::WrongIdReply { replies: 300 }, family);
        let verdict = assert_safe_stop(&rig, ONSET, COMM_LIMIT_US, &["wrong_id"]);

        assert_eq!(rig.writes_after(verdict.fault_at), Vec::new());
        assert!(verdict.message.contains("answered when servo"));
    }
}

#[test]
fn fault_latency_spike() {
    let mut steady = Rig::with_latency(Family::Feetech, Schedule::new(), WINDOWS_LATENCY_US);

    steady.start_test();
    steady.ticks(200);
    assert_eq!(
        steady.first_fault(),
        None,
        "16 ms of adapter latency must fit in a tick"
    );

    let brief = Schedule::new().at(
        ONSET,
        Fault::LatencySpike {
            extra_us: 30_000,
            duration_us: 15_000,
        },
    );
    let mut rig = Rig::new(Family::Dynamixel, brief);

    rig.start_test();

    while rig.now() < ONSET + 600_000 {
        rig.tick();
    }

    assert_eq!(
        rig.first_fault(),
        None,
        "a single late reply should be survived without a stop"
    );

    for family in [Family::Feetech, Family::Dynamixel] {
        let long = Fault::LatencySpike {
            extra_us: 40_000,
            duration_us: 2_000_000,
        };
        let rig = run_into(long, family);
        let verdict = assert_safe_stop(&rig, ONSET, COMM_LIMIT_US, &["replies_late"]);

        assert_eq!(rig.writes_after(verdict.fault_at), Vec::new());
    }
}

#[test]
fn fault_duplicate_id() {
    for family in [Family::Feetech, Family::Dynamixel] {
        let mut rig = Rig::new(family, Schedule::new().at(0, Fault::DuplicateId { id: 2 }));
        let refused = rig
            .command(Command::Enter(Mode::SetUp))
            .expect_err("set up should be refused");

        assert!(refused.contains("Two servos answer to ID 2"), "{refused}");
        common::assert_beginner_message(&refused);
        assert_eq!(rig.daemon.mode(), Mode::Look);
        assert_eq!(
            rig.writes(),
            Vec::new(),
            "nothing may be written to a bus with a duplicate ID"
        );

        let running = run_into(Fault::DuplicateId { id: 2 }, family);
        let verdict = assert_safe_stop(&running, ONSET, COMM_LIMIT_US, &["garbled", "wrong_id", "no_reply"]);

        assert_eq!(running.writes_after(verdict.fault_at), Vec::new());
    }
}
