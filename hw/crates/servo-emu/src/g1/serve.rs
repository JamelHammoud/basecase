use super::{G1Emulator, G1Options};
use crate::loopback::{serve_robot, LoopbackRobot};

pub type LoopbackG1 = LoopbackRobot;

pub fn serve_loopback(options: G1Options, latency_us: u64) -> Result<LoopbackG1, String> {
    serve_robot(G1Emulator::new(options), latency_us)
}

#[cfg(test)]
mod tests {
    use super::*;
    use servo_wire::{Topic, TopicTransport};

    #[test]
    fn the_served_g1_publishes_lowstate_over_loopback() {
        let mut g1 = serve_loopback(G1Options::default(), 0).unwrap();
        let mut seen = None;

        for _ in 0..50 {
            seen = g1.receive(20_000).unwrap();

            if seen.is_some() {
                break;
            }
        }

        let sample = seen.expect("no lowstate within a second");

        assert_eq!(sample.topic, Topic::LowState);
        assert!(servo_wire::unitree::LowState::decode(&sample.payload).unwrap().crc_ok());
        assert!(g1.link().local_addr().unwrap().ip().is_loopback());
    }
}
