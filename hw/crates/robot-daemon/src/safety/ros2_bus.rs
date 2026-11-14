use super::bus::BusGone;
use crate::ros2::map_joints;
use servo_wire::ros2::JointState;
use servo_wire::{Clock, Sample, Topic, TopicTransport};
use std::sync::Arc;

pub const MAX_SAMPLES_PER_POLL: usize = 64;

#[derive(Debug, Clone, PartialEq)]
pub struct Ros2Reading {
    pub at_us: u64,
    pub names: Vec<String>,
    pub positions: Vec<f64>,
    pub velocities: Vec<f64>,
    pub efforts: Vec<f64>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Ros2Joint {
    pub position: Option<f64>,
    pub velocity: Option<f64>,
    pub effort: Option<f64>,
}

fn finite(value: Option<f64>) -> Option<f64> {
    value.filter(|value| value.is_finite())
}

impl Ros2Reading {
    pub fn positions_of(&self, joints: &[String]) -> Vec<Option<f64>> {
        map_joints(joints, &self.names).pick(&self.positions)
    }

    pub fn joints_of(&self, joints: &[String]) -> Vec<Ros2Joint> {
        let map = map_joints(joints, &self.names);

        map.pick(&self.positions)
            .into_iter()
            .zip(map.pick(&self.velocities))
            .zip(map.pick(&self.efforts))
            .map(|((position, velocity), effort)| Ros2Joint {
                position,
                velocity: finite(velocity),
                effort: finite(effort),
            })
            .collect()
    }

    pub fn names_digest_bytes(&self) -> Vec<u8> {
        let mut names = self.names.clone();

        names.sort();
        names.join("\n").into_bytes()
    }
}

pub struct Ros2Bus {
    transport: Box<dyn TopicTransport>,
    clock: Arc<dyn Clock>,
    latest: Option<Ros2Reading>,
    refused: u64,
}

impl Ros2Bus {
    pub fn new(transport: Box<dyn TopicTransport>, clock: Arc<dyn Clock>) -> Self {
        Self {
            transport,
            clock,
            latest: None,
            refused: 0,
        }
    }

    pub fn latest(&self) -> Option<&Ros2Reading> {
        self.latest.as_ref()
    }

    pub fn fresh(&self, within_us: u64) -> Option<&Ros2Reading> {
        let now = self.now_us();

        self.latest
            .as_ref()
            .filter(|reading| now.saturating_sub(reading.at_us) <= within_us)
    }

    pub fn refused(&self) -> u64 {
        self.refused
    }

    pub fn now_us(&self) -> u64 {
        self.clock.now_micros()
    }

    fn take(&mut self, sample: Sample) {
        if sample.topic != Topic::JointStates {
            return;
        }

        match JointState::decode(&sample.payload) {
            Ok(state) => {
                self.latest = Some(Ros2Reading {
                    at_us: self.clock.now_micros(),
                    names: state.name,
                    positions: state.position,
                    velocities: state.velocity,
                    efforts: state.effort,
                });
            }
            Err(_) => self.refused += 1,
        }
    }

    pub fn poll(&mut self) -> Result<(), BusGone> {
        for _ in 0..MAX_SAMPLES_PER_POLL {
            match self.transport.receive(0).map_err(|_| BusGone)? {
                Some(sample) => self.take(sample),
                None => break,
            }
        }

        Ok(())
    }

    pub fn wait_for_state(&mut self, within_us: u64) -> Result<(), BusGone> {
        let deadline = self.clock.now_micros() + within_us;

        self.poll()?;

        loop {
            let now = self.clock.now_micros();

            if self.fresh(within_us).is_some() || now >= deadline {
                return Ok(());
            }

            if let Some(sample) = self.transport.receive(deadline - now).map_err(|_| BusGone)? {
                self.take(sample);
            }
        }
    }

    pub(super) fn publish(&mut self, topic: Topic, payload: &[u8]) -> Result<(), BusGone> {
        self.transport.publish(topic, payload).map_err(|_| BusGone)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use servo_wire::ros2::Header;
    use servo_wire::{TransportError, VirtualClock};
    use std::collections::VecDeque;

    struct Feed(VecDeque<Sample>);

    impl TopicTransport for Feed {
        fn publish(&mut self, _topic: Topic, _payload: &[u8]) -> Result<(), TransportError> {
            Ok(())
        }

        fn receive(&mut self, _timeout_micros: u64) -> Result<Option<Sample>, TransportError> {
            Ok(self.0.pop_front())
        }
    }

    fn state(names: &[&str], positions: Vec<f64>) -> Sample {
        let state = JointState {
            header: Header::default(),
            name: names.iter().map(|name| (*name).to_string()).collect(),
            position: positions,
            ..JointState::default()
        };

        Sample {
            topic: Topic::JointStates,
            payload: state.encode(),
        }
    }

    fn bus(samples: Vec<Sample>) -> Ros2Bus {
        Ros2Bus::new(Box::new(Feed(samples.into())), Arc::new(VirtualClock::new()))
    }

    #[test]
    fn keeps_the_newest_good_state_and_counts_the_rest() {
        let mut bus = bus(vec![
            state(&["a", "b"], vec![0.1, 0.2]),
            state(&["a", "b"], vec![f64::NAN, 0.2]),
            state(&["a", "a"], vec![0.1, 0.2]),
            state(&["a", "b"], vec![0.1]),
            Sample {
                topic: Topic::JointStates,
                payload: vec![0, 1, 0, 0, 9],
            },
        ]);

        bus.poll().unwrap();

        assert_eq!(bus.refused(), 4);
        assert_eq!(bus.latest().unwrap().positions, vec![0.1, 0.2]);
    }

    #[test]
    fn reads_positions_by_name() {
        let mut bus = bus(vec![state(&["b", "a"], vec![2.0, 1.0])]);
        let joints = vec!["a".to_string(), "b".to_string(), "c".to_string()];

        bus.poll().unwrap();

        assert_eq!(
            bus.latest().unwrap().positions_of(&joints),
            vec![Some(1.0), Some(2.0), None]
        );
    }

    fn moving(velocity: Vec<f64>, effort: Vec<f64>) -> Sample {
        let state = JointState {
            header: Header::default(),
            name: vec!["b".into(), "a".into()],
            position: vec![2.0, 1.0],
            velocity,
            effort,
        };

        Sample {
            topic: Topic::JointStates,
            payload: state.encode(),
        }
    }

    #[test]
    fn reads_velocity_and_effort_by_name_when_the_state_carries_them() {
        let mut carrying = bus(vec![moving(vec![0.5, f64::NAN], vec![-3.0, 4.0])]);
        let mut bare = bus(vec![moving(Vec::new(), Vec::new())]);
        let joints = vec!["a".to_string(), "b".to_string(), "c".to_string()];

        carrying.poll().unwrap();
        bare.poll().unwrap();

        assert_eq!(
            carrying.latest().unwrap().joints_of(&joints),
            vec![
                Ros2Joint {
                    position: Some(1.0),
                    velocity: None,
                    effort: Some(4.0),
                },
                Ros2Joint {
                    position: Some(2.0),
                    velocity: Some(0.5),
                    effort: Some(-3.0),
                },
                Ros2Joint::default(),
            ]
        );
        assert_eq!(
            bare.latest().unwrap().joints_of(&joints),
            vec![
                Ros2Joint {
                    position: Some(1.0),
                    ..Ros2Joint::default()
                },
                Ros2Joint {
                    position: Some(2.0),
                    ..Ros2Joint::default()
                },
                Ros2Joint::default(),
            ]
        );
    }

    #[test]
    fn the_names_digest_ignores_publish_order() {
        let first = Ros2Reading {
            at_us: 0,
            names: vec!["b".into(), "a".into()],
            positions: vec![0.0, 0.0],
            velocities: Vec::new(),
            efforts: Vec::new(),
        };
        let second = Ros2Reading {
            names: vec!["a".into(), "b".into()],
            ..first.clone()
        };

        assert_eq!(first.names_digest_bytes(), second.names_digest_bytes());
    }
}
