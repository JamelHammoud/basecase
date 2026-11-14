mod network_support;

use network_support::{Link, Robot};
use robot_daemon::network::{auth_mac, pair_client};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::process::{Command, Stdio};
use std::time::Duration;

#[test]
fn all_robot_families_watchdog_stop_after_socket_drop_and_reconnect_in_look() {
    for (family, count, class) in [
        ("feetech", 6, "arm"),
        ("feetech", 18, "legged"),
        ("dynamixel", 6, "arm"),
        ("unitree-g1", 29, "legged"),
        ("ros2", 6, "arm"),
    ] {
        let robot = Robot::start(family, count, class);
        let key = robot.pair();
        let mut link = robot.connect(key);
        robot.drive(&mut link);
        robot.events.try_iter().for_each(drop);
        link.close();
        let disconnected = robot.next(|event| event["event"] == "client_disconnected", Duration::from_secs(2));
        let fault = robot.next(|event| event["event"] == "fault", Duration::from_secs(2));
        assert_eq!(fault["code"], "client_lost", "{family}: {fault}");
        let elapsed = fault["at_us"]
            .as_u64()
            .unwrap()
            .saturating_sub(disconnected["at_us"].as_u64().unwrap());
        assert!(elapsed <= 150_000, "{family} socket drop took {elapsed} us");
        assert!(
            fault["message"].as_str().unwrap().contains("robot") || fault["message"].as_str().unwrap().contains("G1"),
            "{fault}"
        );
        let stopped = robot.next(
            |event| event["event"] == "status" && event["run"] == "stopped",
            Duration::from_secs(5),
        );
        assert_eq!(stopped["sealed"], true, "{family}: {stopped}");

        if family == "unitree-g1" {
            assert_eq!(stopped["weight"], 0.0);
        }

        let after = robot.next(|event| event["event"] == "status", Duration::from_secs(1));
        assert_eq!(after["run"], "stopped");
        assert_eq!(after["sealed"], true);
        let mut reconnected = robot.connect(key);
        let status = reconnected.event();
        assert_eq!(status["event"], "status");
        assert_eq!(status["mode"], "look");
        assert_eq!(status["run"], "idle");
        assert_eq!(status["fault_latched"], false);
        reconnected.send(json!({"cmd":"enter","mode":"test"}));
        let refused = robot.next(|event| event["event"] == "refused", Duration::from_secs(1));
        assert!(refused["message"].as_str().unwrap().len() > 5);
    }
}

#[test]
fn unpaired_commands_replayed_auth_and_replayed_command_sequences_never_enter_setup() {
    let robot = Robot::start("feetech", 2, "arm");
    let (mut stream, mut reader, _) = Link::challenge(robot.address);
    writeln!(stream, "{}", json!({"cmd":"enter","mode":"set_up"})).unwrap();
    let mut line = String::new();
    assert_eq!(reader.read_line(&mut line).unwrap(), 0);
    drop(stream);
    let key = robot.pair();
    let mut link = robot.connect(key);
    let proof = auth_mac(&key, &link.nonce);
    let copied = link.envelope(&json!({"cmd":"heartbeat"}));
    link.send(json!({"cmd":"heartbeat"}));
    writeln!(link.stream, "{copied}").unwrap();
    robot.next(|event| event["event"] == "client_disconnected", Duration::from_secs(2));
    drop(link);
    let (mut stream, mut reader, fresh) = Link::challenge(robot.address);
    writeln!(stream, "{}", json!({"cmd":"authenticate","proof":proof})).unwrap();
    line.clear();
    assert_eq!(reader.read_line(&mut line).unwrap(), 0);
    assert_eq!(fresh["event"], "challenge");
    drop(stream);
    let mut connection = robot.connect(key);
    let state = connection.event();
    assert_eq!(state["mode"], "look");
    assert!(robot.events.try_iter().all(|event| event["mode"] != "set_up"));
}

#[test]
fn silent_authenticated_client_cannot_hold_the_listener_forever() {
    let robot = Robot::start("feetech", 2, "arm");
    let key = robot.pair();
    let _silent = robot.connect(key);
    std::thread::sleep(Duration::from_millis(1200));
    let mut next = robot.connect(key);
    let state = next.event();
    assert_eq!(state["mode"], "look");
}

#[test]
fn first_start_code_is_consumed_and_secure_pairing_helper_returns_only_the_local_key() {
    let robot = Robot::start("feetech", 2, "arm");
    let mut helper = Command::new(env!("CARGO_BIN_EXE_robot-daemon"))
        .args(["--pair-client", &robot.address.to_string()])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    writeln!(helper.stdin.take().unwrap(), "{}", json!({"code":"123456"})).unwrap();
    let result = helper.wait_with_output().unwrap();
    assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
    let paired: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(paired["event"], "paired");
    assert_eq!(paired["key"].as_str().unwrap().len(), 64);
    assert_eq!(paired.as_object().unwrap().len(), 2);
    let connection = robot.connect(robot.key());
    connection.close();
    drop(connection);
    assert!(pair_client::pair(robot.address, "123456").is_err());
    let persisted: Value =
        serde_json::from_slice(&std::fs::read(robot.directory.join("pairing.json")).unwrap()).unwrap();
    assert!(persisted["code"].is_null());
    assert_eq!(persisted["key"], paired["key"]);
    let _connection = robot.connect(robot.key());
}

#[test]
fn public_bind_addresses_are_refused_before_any_listener_starts() {
    for address in ["0.0.0.0:7447", "8.8.8.8:7447", "[::]:7447", "[2001:4860::1]:7447"] {
        let output = Command::new(env!("CARGO_BIN_EXE_robot-daemon"))
            .args(["--family", "feetech", "--ids", "1", "--emulated", "--listen", address])
            .output()
            .unwrap();
        assert!(!output.status.success());
        assert!(String::from_utf8_lossy(&output.stderr).contains("private network address"));
    }
}

#[test]
fn one_gigabyte_unauthenticated_stream_is_closed_after_the_small_handshake_cap() {
    use std::io::{copy, Read};
    let robot = Robot::start("feetech", 2, "arm");
    let (mut stream, _, _) = Link::challenge(robot.address);
    let mut bytes = std::io::repeat(b'x').take(1024 * 1024 * 1024);
    assert!(copy(&mut bytes, &mut stream).is_err());
    drop(stream);
    let key = robot.pair();
    let mut connection = robot.connect(key);
    assert_eq!(connection.event()["mode"], "look");
}

#[test]
fn authenticated_artefact_paths_are_fixed_and_policy_and_calibration_keep_their_limits() {
    use base64::Engine;
    let robot = Robot::start("feetech", 2, "arm");
    let key = robot.pair();
    let mut link = robot.connect(key);
    let data = base64::engine::general_purpose::STANDARD.encode([1, 2, 3]);
    link.send(json!({"cmd":"put_artefact","name":"policy.onnx","data":data}));
    robot.next(|event| event["event"] == "artefact", Duration::from_secs(2));
    assert_eq!(std::fs::read(robot.directory.join("policy.onnx")).unwrap(), [1, 2, 3]);
    link.send(json!({"cmd":"put_artefact","name":"../outside","data":"YQ=="}));
    robot.next(|event| event["event"] == "client_disconnected", Duration::from_secs(2));
    drop(link);
    let mut link = robot.connect(key);
    link.send(json!({"cmd":"put_artefact","name":"calibration.json","data":base64::engine::general_purpose::STANDARD.encode(vec![b'x';65537])}));
    robot.next(|event| event["event"] == "client_disconnected", Duration::from_secs(2));
    let calibration = std::fs::read(robot.directory.join("calibration.json")).unwrap();
    assert!(serde_json::from_slice::<Value>(&calibration).is_ok());
}

#[test]
fn a_dropped_pairing_reply_can_be_retried_but_old_spake_messages_cannot_be_replayed() {
    use robot_daemon::network::enrollment::{transcript, Exchange};
    use robot_daemon::network::hmac;
    let robot = Robot::start("feetech", 2, "arm");
    let (mut stream, mut reader, challenge) = Link::challenge(robot.address);
    let exchange = Exchange::client("123456");
    let message = exchange.message.clone();
    let nonce = challenge["nonce"].as_str().unwrap();
    let server_message = challenge["pairing_message"].as_str().unwrap();
    let key = exchange.finish(server_message, nonce).unwrap();
    let context = transcript(nonce, server_message, &message);
    let request = json!({"cmd":"pair","message":message,"proof":hmac(&key,&context)});
    writeln!(stream, "{request}").unwrap();
    let mut response = String::new();
    reader.read_line(&mut response).unwrap();
    assert!(!response.contains(&robot.key().iter().map(|byte| format!("{byte:02x}")).collect::<String>()));
    drop(reader);
    drop(stream);
    let (mut stream, mut reader, fresh) = Link::challenge(robot.address);
    assert_ne!(challenge["nonce"], fresh["nonce"]);
    writeln!(stream, "{request}").unwrap();
    response.clear();
    assert_eq!(reader.read_line(&mut response).unwrap(), 0);
    drop(reader);
    drop(stream);
    let key = robot.pair();
    let _connection = robot.connect(key);
}

#[test]
fn preauthentication_drip_feed_has_an_absolute_five_second_deadline() {
    use std::time::Instant;
    let robot = Robot::start("feetech", 2, "arm");
    let (mut stream, _, _) = Link::challenge(robot.address);
    let started = Instant::now();
    let mut closed = false;

    while started.elapsed() < Duration::from_secs(8) {
        if stream.write_all(b" ").is_err() {
            closed = true;
            break;
        }

        std::thread::sleep(Duration::from_millis(200));
    }

    assert!(closed, "drip-fed authentication kept the listener occupied");
    drop(stream);
    let key = robot.pair();
    let _connection = robot.connect(key);
}
