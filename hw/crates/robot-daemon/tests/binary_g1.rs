use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc::channel;
use std::time::{Duration, Instant};

fn calibration() -> String {
    let joints: Vec<String> = (13..=29)
        .map(|id| {
            format!(
                r#"{{"id":{id},"name":"joint {id}","zero_counts":2048,"direction":1,"min_rad":-2.8,"max_rad":2.8}}"#
            )
        })
        .collect();

    format!(r#"{{"joints":[{}],"class":"legged"}}"#, joints.join(","))
}

fn artefacts_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("robot-daemon-g1-{}", std::process::id()));

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

#[test]
fn the_app_can_drive_the_emulated_g1_over_json_lines_and_loopback() {
    let dir = artefacts_dir();
    let mut child = Command::new(env!("CARGO_BIN_EXE_robot-daemon"))
        .args([
            "--family",
            "unitree-g1",
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

    let intent = format!(r#"{{"cmd":"intent","joints":[0.2{}]}}"#, ",0.0".repeat(16));
    let started = Instant::now();
    let mut seen = Vec::new();

    while started.elapsed() < Duration::from_millis(3000) {
        writeln!(stdin, "{intent}").unwrap();
        std::thread::sleep(Duration::from_millis(20));
        seen.extend(lines.try_iter());
    }

    drop(stdin);

    let exited = wait_or_kill(&mut child, Duration::from_secs(5));

    reader.join().ok();
    seen.extend(lines.try_iter());
    std::fs::remove_dir_all(&dir).ok();

    let all = seen.join("\n");

    assert!(
        seen.first()
            .is_some_and(|line| line.contains(r#""family":"unitree-g1""#)),
        "the first line should be the G1's hello: {all}"
    );
    assert!(all.contains(r#""mode":"test""#), "never reached Test: {all}");
    assert!(all.contains(r#""run":"running""#), "never ran: {all}");
    assert!(
        all.contains(r#""weight":1.0"#),
        "the arms never took the full weight: {all}"
    );
    assert!(
        all.contains(r#""code":"client_lost""#) || all.contains(r#""code":"intent_stale""#),
        "closing the app should hand the arms back: {all}"
    );
    assert!(all.contains("back with its own controller"), "{all}");
    assert!(
        exited,
        "the daemon should exit once its app is gone and the arms are handed back"
    );
}

#[test]
fn the_default_build_refuses_a_network_interface() {
    let output = Command::new(env!("CARGO_BIN_EXE_robot-daemon"))
        .args(["--family", "unitree-g1", "--interface", "en0"])
        .output()
        .unwrap();
    let message = String::from_utf8_lossy(&output.stderr);

    assert!(!output.status.success());
    assert!(message.contains("Real motors are locked"), "{message}");
}
