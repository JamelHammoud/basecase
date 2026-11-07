use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc::channel;
use std::time::{Duration, Instant};

const CALIBRATION: &str = r#"{"joints":[
 {"id":1,"name":"base","zero_counts":2048,"direction":1,"min_rad":-1.0,"max_rad":1.0},
 {"id":2,"name":"elbow","zero_counts":2048,"direction":1,"min_rad":-1.0,"max_rad":1.0}
]}"#;

fn artefacts_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("robot-daemon-e2e-{}", std::process::id()));

    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("calibration.json"), CALIBRATION).unwrap();

    dir
}

#[test]
fn the_app_can_drive_the_emulated_robot_over_json_lines() {
    let dir = artefacts_dir();
    let mut child = Command::new(env!("CARGO_BIN_EXE_robot-daemon"))
        .args([
            "--family",
            "feetech",
            "--ids",
            "1,2",
            "--emulated",
            "--latency-ms",
            "16",
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

    while started.elapsed() < Duration::from_millis(2500) {
        writeln!(stdin, r#"{{"cmd":"intent","joints":[0.2,-0.1]}}"#).unwrap();
        std::thread::sleep(Duration::from_millis(20));
        seen.extend(lines.try_iter());
    }

    drop(stdin);

    let status = child.wait_timeout_or_kill(Duration::from_secs(5));

    reader.join().ok();
    seen.extend(lines.try_iter());
    std::fs::remove_dir_all(&dir).ok();

    let all = seen.join("\n");

    assert!(
        seen.first().is_some_and(|line| line.contains(r#""event":"hello""#)),
        "the first line should be hello: {all}"
    );
    assert!(all.contains(r#""mode":"test""#), "never reached Test: {all}");
    assert!(all.contains(r#""run":"running""#), "never ran: {all}");
    let stopped_on_close = all.contains(r#""code":"client_lost""#);
    let stopped_on_starved_sender = all.contains(r#""code":"intent_stale""#);

    assert!(
        stopped_on_close || stopped_on_starved_sender,
        "closing the app should stop the robot: {all}"
    );
    assert!(
        status,
        "the daemon should exit once its app is gone and the robot is still"
    );
}

#[test]
fn the_default_build_refuses_a_real_port() {
    let output = Command::new(env!("CARGO_BIN_EXE_robot-daemon"))
        .args(["--family", "feetech", "--ids", "1", "--port", "/dev/null"])
        .output()
        .unwrap();
    let message = String::from_utf8_lossy(&output.stderr);

    assert!(!output.status.success());
    assert!(message.contains("Real motors are locked"), "{message}");
}

trait WaitOrKill {
    fn wait_timeout_or_kill(&mut self, limit: Duration) -> bool;
}

impl WaitOrKill for std::process::Child {
    fn wait_timeout_or_kill(&mut self, limit: Duration) -> bool {
        let started = Instant::now();

        while started.elapsed() < limit {
            if let Ok(Some(_)) = self.try_wait() {
                return true;
            }

            std::thread::sleep(Duration::from_millis(20));
        }

        let _ = self.kill();

        false
    }
}
