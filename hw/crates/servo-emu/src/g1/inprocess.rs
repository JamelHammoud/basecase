use super::SharedG1;
use servo_wire::{Clock, Sample, Topic, TopicTransport, TransportError};
use std::collections::VecDeque;
use std::sync::Arc;

pub type SampleFilter = Box<dyn FnMut(Sample) -> Option<Sample> + Send>;

pub struct InProcessG1 {
    robot: SharedG1,
    clock: Arc<dyn Clock>,
    latency_us: u64,
    to_robot: VecDeque<(u64, Sample)>,
    to_daemon: VecDeque<(u64, Sample)>,
    filter: Option<SampleFilter>,
}

impl InProcessG1 {
    pub fn new(robot: SharedG1, clock: Arc<dyn Clock>, latency_us: u64) -> Self {
        Self {
            robot,
            clock,
            latency_us,
            to_robot: VecDeque::new(),
            to_daemon: VecDeque::new(),
            filter: None,
        }
    }

    pub fn robot(&self) -> SharedG1 {
        self.robot.clone()
    }

    pub fn set_filter(&mut self, filter: SampleFilter) {
        self.filter = Some(filter);
    }

    fn pump(&mut self) -> Result<(), TransportError> {
        let now = self.clock.now_micros();
        let mut robot = self.robot.lock().map_err(|_| TransportError::Disconnected)?;
        let mut published = Vec::new();

        while let Some((at, _)) = self.to_robot.front() {
            if *at > now {
                break;
            }

            let at = *at;

            published.extend(robot.advance_to(at));

            if let Some((_, sample)) = self.to_robot.pop_front() {
                robot.deliver(&sample);
            }
        }

        published.extend(robot.advance_to(now));
        drop(robot);

        for (at, sample) in published {
            let kept = match self.filter.as_mut() {
                Some(filter) => filter(sample),
                None => Some(sample),
            };

            if let Some(sample) = kept {
                self.to_daemon.push_back((at + self.latency_us, sample));
            }
        }

        Ok(())
    }

    fn next_due(&self) -> Option<u64> {
        let robot_at = self.to_robot.front().map(|(at, _)| *at);
        let daemon_at = self.to_daemon.front().map(|(at, _)| *at);

        robot_at.into_iter().chain(daemon_at).min()
    }
}

impl TopicTransport for InProcessG1 {
    fn publish(&mut self, topic: Topic, payload: &[u8]) -> Result<(), TransportError> {
        let at = self.clock.now_micros() + self.latency_us;

        self.to_robot.push_back((
            at,
            Sample {
                topic,
                payload: payload.to_vec(),
            },
        ));
        self.pump()
    }

    fn receive(&mut self, timeout_micros: u64) -> Result<Option<Sample>, TransportError> {
        let deadline = self.clock.now_micros() + timeout_micros;

        loop {
            self.pump()?;

            let now = self.clock.now_micros();

            if self.to_daemon.front().is_some_and(|(at, _)| *at <= now) {
                return Ok(self.to_daemon.pop_front().map(|(_, sample)| sample));
            }

            if now >= deadline {
                return Ok(None);
            }

            let wake = self.next_due().map_or(deadline, |at| at.min(deadline));

            self.clock.wait_until(wake.max(now + 1));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::{G1Emulator, G1Options, STATE_EVERY_US};
    use super::*;
    use servo_wire::VirtualClock;

    #[test]
    fn lowstate_arrives_after_the_injected_latency() {
        let clock = VirtualClock::new();
        let robot = G1Emulator::new(G1Options::default()).shared();
        let mut link = InProcessG1::new(robot, Arc::new(clock.clone()), 5_000);

        clock.advance_to(STATE_EVERY_US);
        assert_eq!(link.receive(0).unwrap(), None);

        let sample = link.receive(10_000).unwrap().unwrap();

        assert_eq!(sample.topic, Topic::LowState);
        assert!(clock.now_micros() >= STATE_EVERY_US + 5_000);
    }
}
