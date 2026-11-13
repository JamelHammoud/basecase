use super::{InProcessRos2, Ros2Emulator, Ros2Options, SharedRos2};
use crate::loopback::{serve_robot, LoopbackRobot};
use servo_wire::Clock;
use std::sync::Arc;

pub type LoopbackRos2 = LoopbackRobot;

pub fn serve_ros2_loopback(options: Ros2Options, latency_us: u64) -> Result<LoopbackRos2, String> {
    serve_robot(Ros2Emulator::new(options)?, latency_us)
}

pub fn in_process_ros2(
    options: Ros2Options,
    clock: Arc<dyn Clock>,
    latency_us: u64,
) -> Result<(InProcessRos2, SharedRos2), String> {
    let robot = Ros2Emulator::new(options)?.shared();

    Ok((InProcessRos2::new(robot.clone(), clock, latency_us), robot))
}

#[cfg(test)]
mod tests {
    use super::*;
    use servo_wire::ros2::{ControllerKind, JointState};
    use servo_wire::{Topic, TopicTransport, VirtualClock};

    #[test]
    fn the_served_robot_publishes_joint_states_over_loopback() {
        let options = Ros2Options::new(ControllerKind::ForwardPosition, &["shoulder", "elbow"]);
        let mut robot = serve_ros2_loopback(options, 0).unwrap();
        let mut seen = None;

        for _ in 0..50 {
            seen = robot.receive(20_000).unwrap();

            if seen.is_some() {
                break;
            }
        }

        let sample = seen.expect("no joint_states within a second");
        let state = JointState::decode(&sample.payload).unwrap();

        assert_eq!(sample.topic, Topic::JointStates);
        assert_eq!(state.name.len(), 2);
        assert!(robot.link().local_addr().unwrap().ip().is_loopback());
        assert!(robot.link().peer_addr().unwrap().ip().is_loopback());
    }

    #[test]
    fn a_bad_joint_list_starts_nothing() {
        let options = Ros2Options::new(ControllerKind::DiffDrive, &["left_wheel"]);

        assert!(serve_ros2_loopback(options, 0).is_err());
    }

    #[test]
    fn joint_states_arrive_in_process_after_the_injected_latency() {
        let clock = VirtualClock::new();
        let options = Ros2Options::new(ControllerKind::JointTrajectory, &["a", "b", "c"]);
        let (mut link, robot) = in_process_ros2(options, Arc::new(clock.clone()), 4_000).unwrap();
        let sample = link.receive(20_000).unwrap().unwrap();

        assert_eq!(sample.topic, Topic::JointStates);
        assert!(clock.now_micros() >= super::super::JOINT_STATES_EVERY_US + 4_000);
        assert!(robot.lock().unwrap().counters().states >= 1);
    }
}
