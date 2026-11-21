use std::path::Path;
use std::process::Command;

#[test]
fn bounded_body_commands_record_native_observations_and_keep_units_isolated() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    let result = Command::new("node")
        .arg(root.join("electron/robot/bodyMotionRuntime.fixture.mjs"))
        .arg(env!("CARGO_BIN_EXE_robot-daemon"))
        .current_dir(root)
        .output()
        .unwrap();

    assert!(
        result.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}
