mod ros2rig;

use robot_daemon::caps::{BASE_FORWARD_STEP_M_S, BASE_TURN_STEP_RAD_S, TICK_US};
use robot_daemon::ladder::Mode;
use robot_daemon::protocol::ros2_status_line;
use robot_daemon::ros2::{Ros2Run, POLICY_RUNGS_OUT};
use robot_daemon::{Command, DaemonEvent};
use ros2rig::{positions_of, Ros2Rig, Sent, Tamper, ARM, COUNT_RAD, WHEELS};
use servo_emu::ros2::{Ros2Fault, Ros2Options};
use servo_wire::ros2::ControllerKind;
use std::f64::consts::TAU;

const ELBOW: usize = 2;

fn status(rig: &Ros2Rig) -> serde_json::Value {
    serde_json::from_str(&ros2_status_line(&rig.daemon)).unwrap()
}

fn counts(rad: f64) -> i64 {
    (2048.0 + rad * 4096.0 / TAU).round() as i64
}

fn follows_an_elbow_intent(kind: ControllerKind) -> Ros2Rig {
    let mut rig = Ros2Rig::with(Ros2Options::new(kind, &ARM), 4_000);
    let goal = rig.target[ELBOW] + 0.4;

    rig.climb_to_test();
    rig.target[ELBOW] = goal;
    rig.ticks(150);

    assert!(
        (rig.position(ELBOW) - f64::from(goal)).abs() < 0.03,
        "elbow at {}",
        rig.position(ELBOW)
    );

    let status = status(&rig);
    let joints = status["joints"].as_array().unwrap();

    assert_eq!(joints.len(), 6);
    assert_eq!(status["mode"], "test");
    assert_eq!(status["run"], "running");
    assert!(joints.iter().zip(1..).all(|(joint, id)| joint["id"] == id
        && joint["reply"] == "ok"
        && joint["torque_on"] == true
        && joint["temp_c"].is_null()));
    rig
}

#[test]
fn an_arm_on_forward_position_follows_intents() {
    let rig = follows_an_elbow_intent(ControllerKind::ForwardPosition);

    assert!(rig
        .sent()
        .iter()
        .all(|(_, sent)| matches!(sent, Sent::Positions(p) if p.len() == 6)));
}

#[test]
fn an_arm_on_joint_trajectory_follows_intents() {
    let rig = follows_an_elbow_intent(ControllerKind::JointTrajectory);
    let names: Vec<String> = ARM.iter().map(|name| (*name).to_string()).collect();

    for (_, sent) in rig.sent() {
        let Sent::Trajectory(trajectory) = sent else {
            panic!("not a trajectory: {sent:?}");
        };

        assert_eq!(trajectory.joint_names, names);
        assert_eq!(trajectory.points.len(), 1);
        assert_eq!(trajectory.points[0].time_from_start.as_micros(), Some(TICK_US));
    }
}

fn twists(rig: &Ros2Rig) -> Vec<(f64, f64)> {
    rig.sent()
        .into_iter()
        .map(|(_, sent)| match sent {
            Sent::Twist(twist) => (twist.linear.x, twist.angular.z),
            other => panic!("not a twist: {other:?}"),
        })
        .collect()
}

#[test]
fn a_diff_drive_base_drives_and_turns_inside_its_caps() {
    let mut rig = Ros2Rig::base();

    rig.climb_to_test();

    let start = [rig.position(0), rig.position(1)];

    rig.target = vec![1.0, 0.0];
    rig.ticks(60);

    let (forward, _) = rig.robot.lock().unwrap().base_velocity().unwrap();
    let rolled = [rig.position(0) - start[0], rig.position(1) - start[1]];

    assert!((forward - 0.2).abs() < 1e-3, "forward at {forward}");
    assert!(rolled.iter().all(|turned| *turned > 1.0), "{rolled:?}");

    let before_turn = [rig.position(0), rig.position(1)];

    rig.target = vec![0.0, 3.0];
    rig.ticks(80);

    let (_, turn) = rig.robot.lock().unwrap().base_velocity().unwrap();
    let left = rig.position(0) - before_turn[0];
    let right = rig.position(1) - before_turn[1];

    assert!((turn - 1.0).abs() < 1e-3, "turning at {turn}");
    assert!(right > left + 1.0, "left {left} right {right}");

    let sent = twists(&rig);

    assert!(sent.iter().all(|(v, w)| v.abs() <= 0.2 + 1e-6 && w.abs() <= 1.0 + 1e-6));
    assert!(sent.windows(2).all(|pair| {
        (pair[1].0 - pair[0].0).abs() <= f64::from(BASE_FORWARD_STEP_M_S) + 1e-6
            && (pair[1].1 - pair[0].1).abs() <= f64::from(BASE_TURN_STEP_RAD_S) + 1e-6
    }));
}

#[test]
fn positions_map_by_name_when_the_robot_publishes_in_another_order() {
    let mut rig = Ros2Rig::with(Ros2Options::new(ControllerKind::ForwardPosition, &ARM), 0);
    let order = rig.robot.lock().unwrap().publish_order().join(",");

    assert_ne!(order, ARM.join(","));

    rig.climb_to_test();
    rig.target = (0..6).map(|at| -0.6 + 0.2 * at as f32).collect();
    rig.ticks(250);

    let status = status(&rig);

    for (at, joint) in status["joints"].as_array().unwrap().iter().enumerate() {
        let wanted = counts(f64::from(rig.target[at]));
        let position = joint["position"].as_i64().unwrap();

        assert!(
            (position - wanted).abs() < 40,
            "joint {at} at {position}, wanted {wanted}"
        );
    }
}

fn set_up_refused(fault: Ros2Fault) -> Ros2Rig {
    let mut options = Ros2Options::new(ControllerKind::ForwardPosition, &ARM);

    options.fault = Some(fault);

    let mut rig = Ros2Rig::with(options, 0);

    rig.ticks(5);

    assert!(rig.command(Command::Enter(Mode::SetUp)).is_err());
    assert_eq!(
        rig.first_fault().map(|(_, code, _)| code).as_deref(),
        Some("joints_unmatched")
    );
    assert_eq!(rig.daemon.mode(), Mode::Look);
    rig.ticks(10);
    assert!(rig.published().is_empty());
    rig
}

#[test]
fn set_up_names_a_joint_the_robot_leaves_out() {
    let rig = set_up_refused(Ros2Fault::MissingJoint("elbow".into()));
    let refusal = rig.refusals().join(" ");

    assert!(refusal.contains("doesn't publish elbow"), "{refusal}");
    assert_eq!(status(&rig)["joints"][ELBOW]["reply"], "missing");
    assert!(status(&rig)["joints"][ELBOW]["position"].is_null());
}

#[test]
fn set_up_names_a_joint_the_scene_lacks() {
    let rig = set_up_refused(Ros2Fault::ExtraJoint("camera_tilt".into()));
    let refusal = rig.refusals().join(" ");

    assert!(
        refusal.contains("publishes camera_tilt, which the scene doesn't have"),
        "{refusal}"
    );
}

#[test]
fn a_stale_app_is_held_within_100_ms_then_nothing_more() {
    let mut rig = Ros2Rig::arm(ControllerKind::ForwardPosition);

    rig.climb_to_test();
    rig.ticks(10);
    rig.intents_flow = false;
    rig.ticks(20);

    let (fault_at, code, _) = rig.first_fault().expect("no fault");
    let after = rig.sent_after(fault_at - 1);

    assert_eq!(code, "intent_stale");
    assert_eq!(after.len(), 1, "{after:?}");
    assert!(after[0].0 - fault_at <= 100_000);
    assert_eq!(rig.daemon.run(), Ros2Run::Stopped);
    assert!(rig.daemon.is_sealed());
}

#[test]
fn stop_holds_at_the_measured_position() {
    let mut rig = Ros2Rig::arm(ControllerKind::JointTrajectory);

    rig.climb_to_test();
    rig.target[ELBOW] += 1.0;
    rig.ticks(30);

    let stopped_at = rig.now();

    rig.command(Command::Stop).unwrap();

    let measured = rig.measured();
    let held = positions_of(&rig.sent_after(stopped_at - 1)[0].1).unwrap();

    assert!(held
        .iter()
        .zip(&measured)
        .all(|(goal, now)| (goal - now.unwrap()).abs() <= f64::from(COUNT_RAD)));
    rig.ticks(10);
    assert_eq!(rig.sent_after(stopped_at - 1).len(), 1);
    assert!(rig
        .events
        .iter()
        .any(|event| matches!(event, DaemonEvent::Stopped { .. })));
}

#[test]
fn hostile_joint_states_are_dropped_counted_and_never_used() {
    let mut rig = Ros2Rig::arm(ControllerKind::ForwardPosition);

    for tamper in [Tamper::NotANumber, Tamper::Huge, Tamper::Garbage, Tamper::Duplicate] {
        rig.set_tamper(tamper);
        rig.ticks(10);
    }

    assert!(rig.published().is_empty());
    assert!(rig.daemon.refused() >= 8, "refused {}", rig.daemon.refused());

    rig.climb_to_test();

    let refused_before = rig.daemon.refused();

    for tamper in [Tamper::NotANumber, Tamper::Huge, Tamper::Garbage, Tamper::Duplicate] {
        rig.set_tamper(tamper);

        for _ in 0..20 {
            rig.tick();

            let reading = rig.daemon.reading().unwrap();

            assert_eq!(reading.names.len(), 6);
            assert!(
                reading.positions.iter().all(|q| q.abs() < 0.5),
                "{:?}",
                reading.positions
            );
        }
    }

    assert!(rig.first_fault().is_none(), "{:?}", rig.first_fault());
    assert!(rig.daemon.refused() >= refused_before + 40);

    let goals: Vec<Vec<f64>> = rig.sent().iter().filter_map(|(_, sent)| positions_of(sent)).collect();

    assert!(goals.windows(2).all(|pair| pair[0]
        .iter()
        .zip(&pair[1])
        .all(|(a, b)| (a - b).abs() <= 7.0 * f64::from(COUNT_RAD))));
}

#[test]
fn malformed_joint_states_stop_the_robot_like_lost_ones() {
    let mut rig = Ros2Rig::arm(ControllerKind::ForwardPosition);

    rig.climb_to_test();
    rig.ticks(10);

    let onset = rig.now();

    rig.robot.lock().unwrap().set_fault(Some(Ros2Fault::Malformed));
    rig.ticks(10);

    let (fault_at, code, _) = rig.first_fault().expect("no fault");

    assert_eq!(code, "joint_states_refused");
    assert!(fault_at - onset <= 100_000);
    assert_eq!(rig.sent_after(fault_at - 1).len(), 1);
    assert!(rig.daemon.refused() > 0);
}

#[test]
fn look_and_set_up_never_publish() {
    let mut rig = Ros2Rig::base();

    rig.ticks(10);
    rig.command(Command::Enter(Mode::SetUp)).unwrap();
    rig.ticks(10);

    assert!(rig.published().is_empty());
    assert_eq!(status(&rig)["joints"][1]["torque_on"], false);
}

#[test]
fn policy_rungs_stay_out_for_ros2_robots() {
    let mut rig = Ros2Rig::arm(ControllerKind::ForwardPosition);

    rig.climb_to_test();

    assert_eq!(
        rig.command(Command::Enter(Mode::Rehearse)),
        Err(POLICY_RUNGS_OUT.to_string())
    );
    assert_eq!(rig.daemon.mode(), Mode::Test);
    assert_eq!(rig.daemon.run(), Ros2Run::Running);
}

#[test]
fn test_needs_a_calibration_listing_ids_1_to_n() {
    let mut rig = Ros2Rig::arm(ControllerKind::ForwardPosition);
    let shifted = ros2rig::calibration(&ARM).replace(r#""id":6"#, r#""id":7"#);

    rig.artefacts.set_calibration(Some(shifted.into_bytes()));
    rig.ticks(5);
    rig.command(Command::Enter(Mode::SetUp)).unwrap();

    let refused = rig.command(Command::Enter(Mode::Test)).unwrap_err();

    assert!(refused.contains("ids 1 to 6"), "{refused}");
    assert_eq!(rig.daemon.mode(), Mode::SetUp);
    rig.ticks(10);
    assert!(rig.published().is_empty());
}

#[test]
fn test_is_earned_after_five_seconds_with_both_wheels_turning() {
    let mut rig = Ros2Rig::base();

    rig.climb_to_test();
    rig.target = vec![0.1, 0.0];
    rig.ticks(260);

    assert!(rig
        .events
        .iter()
        .any(|event| matches!(event, DaemonEvent::Completed { mode: Mode::Test, .. })));
    assert_eq!(WHEELS.len(), 2);
}
