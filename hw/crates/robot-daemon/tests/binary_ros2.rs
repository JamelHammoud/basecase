use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Output, Stdio};
use std::sync::mpsc::channel;
use std::time::{Duration, Instant};

const JOINTS: [&str; 2] = ["shoulder_pan_joint", "elbow_joint"];
const FORWARD_TOPIC: &str = "/forward_position_controller/commands";

fn calibration() -> String {
    let joints: Vec<String> = JOINTS
        .iter()
        .enumerate()
        .map(|(at, name)| {
            format!(
                r#"{{"id":{},"name":"{name}","zero_counts":2048,"direction":1,"min_rad":-2.8,"max_rad":2.8}}"#,
                at + 1
            )
        })
        .collect();

    format!(r#"{{"joints":[{}],"class":"arm"}}"#, joints.join(","))
}

fn artefacts_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("robot-daemon-ros2-{}", std::process::id()));

    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("calibration.json"), calibration()).unwrap();

    dir
}

fn wait_or_kill(child: &mut std::process::Child, limit: Duration) -> bool {
    let started = Instant::now();

    while started.elapsed() < limit {
        if let Ok(Some(_)) = child.try_wait() {
            return true;
        }

        std::thread::sleep(Duration::from_millis(20));
    }

    let _ = child.kill();

    false
}

fn daemon(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_robot-daemon"))
        .args(args)
        .output()
        .unwrap()
}

fn shoulder_counts(line: &str) -> Option<i64> {
    let status: serde_json::Value = serde_json::from_str(line).ok()?;

    (status["event"] == "status")
        .then(|| status["joints"][0]["position"].as_i64())
        .flatten()
}

#[test]
fn the_app_can_drive_an_emulated_ros2_arm_over_json_lines_and_loopback() {
    let dir = artefacts_dir();
    let mut child = Command::new(env!("CARGO_BIN_EXE_robot-daemon"))
        .args([
            "--family",
            "ros2",
            "--controller",
            "forward_position",
            "--topic",
            FORWARD_TOPIC,
            "--joints",
            &JOINTS.join(","),
            "--emulated",
            "--latency-ms",
            "4",
            "--artefacts",
        ])
        .arg(&dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let (lines_tx, lines) = channel::<String>();
    let reader = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = lines_tx.send(line);
        }
    });

    writeln!(stdin, r#"{{"cmd":"enter","mode":"set_up"}}"#).unwrap();
    writeln!(stdin, r#"{{"cmd":"enter","mode":"test"}}"#).unwrap();

    let started = Instant::now();
    let mut seen = Vec::new();

    while started.elapsed() < Duration::from_millis(3000) {
        writeln!(stdin, r#"{{"cmd":"intent","joints":[0.4,0.0]}}"#).unwrap();
        std::thread::sleep(Duration::from_millis(20));
        seen.extend(lines.try_iter());
    }

    drop(stdin);

    let exited = wait_or_kill(&mut child, Duration::from_secs(5));

    reader.join().ok();
    seen.extend(lines.try_iter());
    std::fs::remove_dir_all(&dir).ok();

    let all = seen.join("\n");
    let shoulder: Vec<i64> = seen.iter().filter_map(|line| shoulder_counts(line)).collect();
    let moved = shoulder
        .first()
        .zip(shoulder.iter().max())
        .is_some_and(|(first, high)| high > first);

    assert!(
        seen.first().is_some_and(|line| line.contains(r#""family":"ros2""#)),
        "the first line should be the ROS 2 hello: {all}"
    );
    assert!(all.contains(r#""mode":"test""#), "never reached Test: {all}");
    assert!(all.contains(r#""run":"running""#), "never ran: {all}");
    assert!(moved, "the shoulder never followed the intents: {shoulder:?}");
    assert!(
        all.contains(r#""code":"client_lost""#) || all.contains(r#""code":"intent_stale""#),
        "closing the app should hold the robot: {all}"
    );
    assert!(
        exited,
        "the daemon should exit once its app is gone and the robot holds"
    );
}

#[test]
fn the_default_build_refuses_a_network_interface_for_ros2() {
    let output = daemon(&[
        "--family",
        "ros2",
        "--controller",
        "forward_position",
        "--joints",
        "a",
        "--interface",
        "en0",
    ]);
    let message = String::from_utf8_lossy(&output.stderr);

    assert!(!output.status.success());
    assert!(message.contains("Real motors are locked"), "{message}");
}

#[test]
fn crafted_topics_and_joint_names_are_refused_before_hello() {
    let crafted = [
        ("forward_position", "/x/../commands", "a"),
        ("forward_position", "/a__b/commands", "a"),
        ("forward_position", "rt/x/commands", "a"),
        ("forward_position", "/joint_trajectory_controller/joint_trajectory", "a"),
        ("forward_position", FORWARD_TOPIC, "a,b;rm"),
        ("forward_position", FORWARD_TOPIC, "--port"),
        ("diff_drive", "/cmd_vel", "left,right,third"),
    ];

    for (kind, topic, joints) in crafted {
        let output = daemon(&[
            "--family",
            "ros2",
            "--controller",
            kind,
            "--topic",
            topic,
            "--joints",
            joints,
            "--emulated",
        ]);

        assert_eq!(output.status.code(), Some(2), "{kind} {topic} {joints}");
        assert!(output.stdout.is_empty(), "{kind} {topic} {joints} said hello");
    }
}
