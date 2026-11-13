use std::path::PathBuf;
use std::process::{Command, Output, Stdio};

const XL430: &str = r#"{"volts":11.1,"kt":0.9,"resistance":4.1,"armature":0.01,
 "friction":{"base":0.03,"stribeck":0.0001,"loadMotor":0.04,"loadExternal":0.2,"loadMotorStribeck":1e-8,
 "loadExternalStribeck":0.14,"loadMotorQuad":0.007,"loadExternalQuad":0.003,"dthetaStribeck":0.37,
 "alpha":9.9,"viscous":0.03},
 "firmwareKp":640,"errorGain":0.003,"errorGainRatio":1.0,"maxDuty":1.0,"maxVelocity":6.0,"delayS":0.005}"#;

fn units_file(name: &str, text: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("robot-daemon-units-{}-{name}", std::process::id()));

    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("units.json"), text).unwrap();

    dir.join("units.json")
}

fn daemon(args: &[&str], units: &PathBuf) -> Output {
    Command::new(env!("CARGO_BIN_EXE_robot-daemon"))
        .args(args)
        .arg("--units")
        .arg(units)
        .stdin(Stdio::null())
        .output()
        .unwrap()
}

fn refused(output: &Output, words: &str) {
    let message = String::from_utf8_lossy(&output.stderr);

    assert!(!output.status.success());
    assert!(output.stdout.is_empty(), "no hello before a refusal");
    assert!(message.contains(words), "{message}");
}

#[test]
fn an_emulated_servo_bus_starts_with_one_model_per_id() {
    let units = units_file("good", &format!("[{XL430},null]"));
    let output = daemon(
        &["--family", "dynamixel", "--ids", "1,2", "--emulated", "--factory"],
        &units,
    );
    let stdout = String::from_utf8_lossy(&output.stdout);

    assert!(stdout.contains(r#""event":"hello""#), "{stdout}");
}

#[test]
fn units_are_refused_for_real_targets_and_other_robots() {
    let units = units_file("refused", &format!("[{XL430}]"));

    refused(
        &daemon(&["--family", "feetech", "--ids", "1", "--port", "/dev/null"], &units),
        "--units needs --emulated",
    );
    refused(
        &daemon(&["--family", "unitree-g1", "--emulated"], &units),
        "--units is for --family feetech or dynamixel only",
    );
    refused(
        &daemon(
            &[
                "--family",
                "ros2",
                "--controller",
                "forward_position",
                "--joints",
                "a",
                "--emulated",
            ],
            &units,
        ),
        "--units is for --family feetech or dynamixel only",
    );
}

#[test]
fn a_models_file_that_does_not_fit_the_ids_starts_nothing() {
    let short = units_file("short", &format!("[{XL430}]"));
    let wild = units_file("wild", &format!("[{}]", XL430.replace("\"kt\":0.9", "\"kt\":-1")));

    refused(
        &daemon(&["--family", "feetech", "--ids", "1,2", "--emulated"], &short),
        "The servo models file must give one entry per servo ID.",
    );
    refused(
        &daemon(&["--family", "feetech", "--ids", "4", "--emulated"], &wild),
        "The model for servo 4 has a number out of range.",
    );
    refused(
        &daemon(
            &["--family", "feetech", "--ids", "1", "--emulated"],
            &PathBuf::from("missing-units.json"),
        ),
        "The servo models file can't be read",
    );
}
