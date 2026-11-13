use super::*;

const FORWARD: ControllerKind = ControllerKind::ForwardPosition;
const TRAJECTORY: ControllerKind = ControllerKind::JointTrajectory;
const DRIVE: ControllerKind = ControllerKind::DiffDrive;

fn owned(names: &[&str]) -> Vec<String> {
    names.iter().map(|name| name.to_string()).collect()
}

#[test]
fn controller_kinds_parse_from_their_spec_words() {
    for kind in ControllerKind::ALL {
        assert_eq!(ControllerKind::parse(kind.as_str()), Some(kind));
        assert!(checked_topic(kind, kind.default_topic()).is_ok(), "{kind:?}");
        assert_eq!(
            kind.command_topic().name(),
            dds_topic_name(kind.default_topic()).unwrap()
        );
    }

    assert_eq!(ControllerKind::parse("Forward_Position"), None);
    assert_eq!(ControllerKind::parse(""), None);
    assert_eq!(ControllerKind::parse("forward_position "), None);
}

#[test]
fn joint_names_are_ros_identifiers_of_up_to_64_characters() {
    let longest = format!("j{}", "0".repeat(63));
    let too_long = format!("j{}", "0".repeat(64));

    for good in ["shoulder_pan_joint", "_hidden", "J1", "a", longest.as_str()] {
        assert_eq!(checked_joint_name(good), Ok(good));
    }

    for bad in [
        "",
        "1joint",
        "joint-1",
        "joint 1",
        "../x",
        "a/b",
        "jöint",
        "joint\0",
        "x;rm",
        too_long.as_str(),
    ] {
        assert!(checked_joint_name(bad).is_err(), "{bad:?}");
    }
}

#[test]
fn a_refused_name_is_shown_escaped_and_cut_short() {
    let message = checked_joint_name(&format!("x\n{}", "y".repeat(500))).unwrap_err();

    assert!(message.starts_with("\"x\\ny"));
    assert!(message.contains('…'));
    assert!(message.len() < 250);
}

#[test]
fn topics_accept_one_to_four_parts_with_the_right_ending() {
    for (kind, topic) in [
        (FORWARD, "/commands"),
        (FORWARD, "/arm/forward_position_controller/commands"),
        (FORWARD, "/a/b/c/commands"),
        (TRAJECTORY, "/arm_controller/joint_trajectory"),
        (DRIVE, "/cmd_vel"),
        (DRIVE, "/diff_drive_controller/cmd_vel_unstamped"),
    ] {
        assert_eq!(checked_topic(kind, topic), Ok(topic));
    }
}

#[test]
fn crafted_topics_are_refused() {
    let long_part = format!("/{}/commands", "a".repeat(119));
    let at_limit = format!("/{}/commands", "a".repeat(118));

    assert_eq!(long_part.len(), 129);
    assert_eq!(checked_topic(FORWARD, &at_limit), Ok(at_limit.as_str()));

    for topic in [
        "../x",
        "/a//commands",
        "/a/commands/",
        "rt/x/commands",
        "/a__b/commands",
        "/x/commands\0",
        "/x;rm/commands",
        "/x/commands ",
        "/1x/commands",
        "/ä/commands",
        "/a/b/c/d/commands",
        "//commands",
        "/",
        "",
        "commands",
        "/x/../commands",
        long_part.as_str(),
    ] {
        assert!(checked_topic(FORWARD, topic).is_err(), "{topic:?}");
    }
}

#[test]
fn a_topic_for_another_controller_is_refused() {
    let refused = checked_topic(FORWARD, "/joint_trajectory_controller/joint_trajectory").unwrap_err();

    assert!(refused.contains("ending in /commands"), "{refused}");
    assert!(checked_topic(TRAJECTORY, "/forward_position_controller/commands").is_err());
    assert!(checked_topic(DRIVE, "/forward_position_controller/commands").is_err());
    assert!(checked_topic(DRIVE, "/cmd_vel_stamped").is_err());
    assert!(checked_topic(FORWARD, "/x/commandsx").is_err());
}

#[test]
fn a_ros_topic_is_its_dds_topic_under_rt() {
    assert_eq!(dds_topic_name("/joint_states"), Ok("rt/joint_states".to_string()));
    assert_eq!(dds_topic_name("/a/b"), Ok("rt/a/b".to_string()));
    assert!(dds_topic_name("joint_states").is_err());
    assert!(dds_topic_name("/a__b").is_err());
}

#[test]
fn the_joint_list_fits_its_controller() {
    let thirty_two: Vec<String> = (0..32).map(|at| format!("j{at}")).collect();
    let thirty_three: Vec<String> = (0..33).map(|at| format!("j{at}")).collect();

    assert_eq!(checked_joints(FORWARD, &owned(&["a", "b", "c"])), Ok(()));
    assert_eq!(checked_joints(TRAJECTORY, &thirty_two), Ok(()));
    assert_eq!(checked_joints(DRIVE, &owned(&["left_wheel", "right_wheel"])), Ok(()));
    assert!(checked_joints(FORWARD, &[]).is_err());
    assert!(checked_joints(TRAJECTORY, &thirty_three).is_err());
    assert!(checked_joints(DRIVE, &owned(&["left_wheel"])).is_err());
    assert!(checked_joints(DRIVE, &owned(&["a", "b", "c"])).is_err());
    assert!(checked_joints(FORWARD, &owned(&["a", "../b"])).is_err());
    assert!(checked_joints(FORWARD, &owned(&["a", "b", "a"]))
        .unwrap_err()
        .contains("listed twice"));
}

#[test]
fn ros2_endpoints_read_joint_states_and_write_the_controller_topic() {
    let endpoints = Endpoints::ros2(TRAJECTORY, "/arm_controller/joint_trajectory").unwrap();

    assert_eq!(endpoints.name_of(Topic::JointStates), Some("rt/joint_states"));
    assert_eq!(
        endpoints.name_of(Topic::TrajectoryCommands),
        Some("rt/arm_controller/joint_trajectory")
    );
    assert!(endpoints.reads(Topic::JointStates) && !endpoints.writes(Topic::JointStates));
    assert!(!endpoints.writes(Topic::PositionCommands) && !endpoints.writes(Topic::CmdVel));
    assert!(Endpoints::ros2(FORWARD, "/arm_controller/joint_trajectory").is_err());
    assert!(Endpoints::ros2(DRIVE, "/a//cmd_vel").is_err());
}
