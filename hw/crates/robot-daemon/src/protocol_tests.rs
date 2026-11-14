use super::*;

#[test]
fn reads_every_documented_command() {
    assert!(matches!(
        parse_line(r#"{"cmd":"enter","mode":"first_run"}"#),
        Ok(Routed::Command(Command::Enter(Mode::FirstRun)))
    ));
    assert!(matches!(parse_line(r#"{"cmd":"heartbeat"}"#), Ok(Routed::Heartbeat)));
    assert!(matches!(
        parse_line(r#"{"cmd":"stop"}"#),
        Ok(Routed::Command(Command::Stop))
    ));
    assert!(matches!(
        parse_line(r#"{"cmd":"release"}"#),
        Ok(Routed::Command(Command::Release))
    ));
    assert!(matches!(
        parse_line(r#"{"cmd":"assign_id","id":3,"model":777}"#),
        Ok(Routed::Command(Command::AssignId { id: 3, model: 777 }))
    ));
    assert!(matches!(parse_line(r#"{"cmd":"plug_in"}"#), Ok(Routed::PlugIn)));
}

#[test]
fn an_assign_id_outside_a_servo_id_is_unreadable() {
    assert!(parse_line(r#"{"cmd":"assign_id","id":300,"model":777}"#).is_err());
    assert!(parse_line(r#"{"cmd":"assign_id","id":-1,"model":777}"#).is_err());
    assert!(parse_line(r#"{"cmd":"assign_id","id":2}"#).is_err());
}

#[test]
fn a_null_joint_becomes_nan_so_the_guard_refuses_it() {
    let Ok(Routed::Intent(values)) = parse_line(r#"{"cmd":"intent","joints":[0.1,null]}"#) else {
        panic!("expected an intent");
    };

    assert_eq!(values[0], 0.1);
    assert!(values[1].is_nan());
}

#[test]
fn unknown_commands_are_refused() {
    assert!(parse_line(r#"{"cmd":"write_register","address":40}"#).is_err());
    assert!(parse_line("not json").is_err());
}

#[test]
fn events_are_single_json_lines() {
    let line = event_line(&DaemonEvent::Fault {
        at_us: 5,
        code: "overheat".into(),
        message: "Servo 2 is hot.".into(),
        id: Some(2),
    });

    assert!(!line.contains('\n'));
    assert!(line.contains(r#""event":"fault""#));
    assert!(line.contains(r#""id":2"#));

    let unnamed = event_line(&DaemonEvent::Fault {
        at_us: 5,
        code: "client_lost".into(),
        message: "The app stopped talking to the robot.".into(),
        id: None,
    });

    assert!(!unnamed.contains(r#""id""#));
}

#[test]
fn the_g1_says_hello_with_its_own_family_and_words() {
    let hello: serde_json::Value = serde_json::from_str(&g1_hello_line(true)).unwrap();

    assert_eq!(hello["family"], "unitree-g1");
    assert_eq!(hello["real_transport"], false);
    assert_eq!(hello["lost_message"], g1_lost_message(true));
    assert!(!g1_lost_message(true).contains("remote"));
}

#[test]
fn a_ros2_robot_says_hello_with_its_own_family_and_words() {
    let hello: serde_json::Value = serde_json::from_str(&ros2_hello_line(true)).unwrap();

    assert_eq!(hello["family"], "ros2");
    assert_eq!(hello["emulated"], true);
    assert_eq!(hello["lost_message"], ros2_lost_message(true));
    assert_eq!(status_counts(0.0), 2048);
    assert_eq!(status_counts(std::f64::consts::PI), 4096);
}

#[test]
fn hello_names_the_build_and_the_words_for_a_lost_daemon() {
    let hello: serde_json::Value = serde_json::from_str(&hello_line(Family::Feetech, true)).unwrap();

    assert_eq!(hello["event"], "hello");
    assert_eq!(hello["family"], "feetech");
    assert_eq!(hello["emulated"], true);
    assert_eq!(hello["real_transport"], false);
    assert_eq!(hello["lost_message"], daemon_lost_message(Family::Feetech));
}

fn ros2_joint_json(state: servo_wire::ros2::JointState) -> Vec<serde_json::Value> {
    let joints = vec!["shoulder".to_string(), "elbow".to_string()];
    let reading = crate::safety::Ros2Reading::from_state(state, 0);
    let statuses = ros2_joints(reading.joints_of(&joints), true);

    serde_json::from_str(&serde_json::to_string(&statuses).unwrap()).unwrap()
}

fn arm_state() -> servo_wire::ros2::JointState {
    servo_wire::ros2::JointState {
        name: vec!["elbow".into(), "shoulder".into()],
        position: vec![0.0, std::f64::consts::PI],
        velocity: vec![-0.5, 1.25],
        effort: vec![2.5, -0.75],
        ..Default::default()
    }
}

#[test]
fn a_ros2_status_joint_carries_the_published_velocity_and_effort() {
    let joints = ros2_joint_json(arm_state());

    assert_eq!(
        joints[0],
        serde_json::json!({
            "id": 1, "position": 4096, "temp_c": null, "volts": null, "torque_on": true,
            "reply": "ok", "velocity": 1.25, "effort": -0.75,
        })
    );
    assert_eq!(joints[1]["velocity"], -0.5);
    assert_eq!(joints[1]["effort"], 2.5);
}

#[test]
fn a_ros2_state_without_velocity_or_effort_leaves_both_keys_out() {
    let joints = ros2_joint_json(servo_wire::ros2::JointState {
        velocity: Vec::new(),
        effort: Vec::new(),
        ..arm_state()
    });

    assert!(joints
        .iter()
        .all(|joint| joint["reply"] == "ok" && joint.get("velocity").is_none() && joint.get("effort").is_none()));
}

#[test]
fn a_servo_status_joint_has_no_velocity_or_effort() {
    let telemetry = crate::telemetry::Telemetry {
        id: 3,
        torque_on: true,
        goal: 2048,
        position: 2050,
        velocity_rad_s: 0.5,
        load_fraction: 0.1,
        volts: 7.4,
        temp_c: 30.0,
        overload: false,
        overcurrent: false,
        hardware_error: 0,
        watchdog_tripped: false,
    };
    let line = serde_json::to_string(&joint_status(&Sample::Good(telemetry))).unwrap();

    assert_eq!(
        line,
        r#"{"id":3,"position":2050,"temp_c":30.0,"volts":7.4,"torque_on":true,"reply":"ok"}"#
    );
}

#[test]
fn a_g1_status_joint_carries_its_velocity_and_estimated_torque() {
    let reading = Reading {
        at_us: 0,
        mode_machine: 0,
        version: [0, 0],
        motors: vec![crate::safety::MotorReading {
            dq: 0.5,
            tau: f32::NAN,
            enabled: true,
            ..Default::default()
        }],
    };
    let joints: serde_json::Value = serde_json::to_value(g1_joints(Some(&reading))).unwrap();

    assert_eq!(joints[0]["velocity"], 0.5);
    assert!(joints[0].get("effort").is_none());
}
