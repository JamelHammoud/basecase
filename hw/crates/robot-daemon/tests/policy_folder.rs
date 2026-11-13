mod common;

use common::{Rig, CALIBRATION};
use robot_daemon::ladder::Mode;
use robot_daemon::Command;
use servo_wire::Family;
use std::path::PathBuf;

fn artefacts_folder(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("robot-daemon-{name}-{}", std::process::id()));

    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("calibration.json"), CALIBRATION).unwrap();

    dir
}

#[test]
fn a_policy_written_after_connect_unlocks_rehearse_and_a_new_one_voids_its_evidence() {
    let dir = artefacts_folder("policy-folder");
    let mut rig = Rig::in_folder(Family::Feetech, dir.clone());

    rig.start_test();
    assert!(
        rig.tick_until(600, |rig| rig.completed(Mode::Test)),
        "test never completed"
    );
    assert_eq!(
        rig.command(Command::Enter(Mode::Rehearse)).unwrap_err(),
        "Load a policy first."
    );

    std::fs::write(dir.join("policy.onnx"), b"policy v1").unwrap();
    rig.command(Command::Recheck).unwrap();
    rig.command(Command::Enter(Mode::Rehearse))
        .expect("rehearse with the policy the app wrote");
    assert!(
        rig.tick_until(700, |rig| rig.completed(Mode::Rehearse)),
        "rehearsal never completed"
    );

    std::fs::write(dir.join("policy.onnx"), b"policy v2").unwrap();
    rig.command(Command::Recheck).unwrap();
    assert_eq!(
        rig.command(Command::Enter(Mode::FirstRun)).unwrap_err(),
        "Rehearse the current policy first."
    );
    std::fs::remove_dir_all(&dir).ok();
}
