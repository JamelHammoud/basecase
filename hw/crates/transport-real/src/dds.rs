use crate::dds_raw::{RawAdapter, RawSample};
use crate::interface::interface_address;
use rustdds::mio1::{Events, Interest, Poll, Token};
use rustdds::no_key::{DataReader, DataWriter};
use rustdds::policy::{Durability, History, Reliability};
use rustdds::{
    DomainParticipant, DomainParticipantBuilder, Publisher, QosPolicies, QosPolicyBuilder, Subscriber, TopicKind,
};
use servo_wire::{Endpoint, Endpoints, Sample, Topic, TopicTransport, TransportError};
use std::error::Error;
use std::io::ErrorKind;
use std::net::Ipv4Addr;
use std::time::{Duration, Instant};

const DOMAIN: u16 = 0;
const STATE_DEPTH: i32 = 1;
const ANSWER_DEPTH: i32 = 8;
const EVENT_CAPACITY: usize = 8;

type RawWriter = DataWriter<RawSample, RawAdapter>;
type RawReader = DataReader<RawSample, RawAdapter>;

pub struct DdsTransport {
    writers: Vec<(Topic, RawWriter)>,
    readers: Vec<(Topic, RawReader)>,
    poll: Poll,
    events: Events,
    _publisher: Publisher,
    _subscriber: Subscriber,
    _participant: DomainParticipant,
}

impl DdsTransport {
    pub fn open(interface: &str, endpoints: &Endpoints) -> Result<Self, String> {
        let address = interface_address(interface)?;

        Self::start(address, endpoints).map_err(|error| format!("Could not start DDS on {interface}: {error}"))
    }

    fn start(address: Ipv4Addr, endpoints: &Endpoints) -> Result<Self, Box<dyn Error>> {
        let participant = DomainParticipantBuilder::new(DOMAIN)
            .with_only_networks([address])
            .same_host_loopback(false)
            .build()?;
        let publisher = participant.create_publisher(&writer_qos())?;
        let subscriber = participant.create_subscriber(&reader_qos(STATE_DEPTH))?;
        let writers = endpoints
            .writes
            .iter()
            .map(|endpoint| Ok((endpoint.topic, open_writer(&participant, &publisher, endpoint)?)))
            .collect::<Result<Vec<_>, rustdds::dds::CreateError>>()?;
        let mut readers = endpoints
            .reads
            .iter()
            .map(|endpoint| Ok((endpoint.topic, open_reader(&participant, &subscriber, endpoint)?)))
            .collect::<Result<Vec<_>, rustdds::dds::CreateError>>()?;
        let poll = Poll::new()?;

        for (token, (_, reader)) in readers.iter_mut().enumerate() {
            poll.registry().register(reader, Token(token), Interest::READABLE)?;
        }

        Ok(Self {
            writers,
            readers,
            poll,
            events: Events::with_capacity(EVENT_CAPACITY),
            _publisher: publisher,
            _subscriber: subscriber,
            _participant: participant,
        })
    }

    fn take_next(&mut self) -> Result<Option<Sample>, TransportError> {
        for (topic, reader) in &mut self.readers {
            let sample = take(reader, *topic)?;

            if sample.is_some() {
                return Ok(sample);
            }
        }

        Ok(None)
    }

    fn wait(&mut self, timeout: Duration) -> Result<(), TransportError> {
        match self.poll.poll(&mut self.events, Some(timeout)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::Interrupted => Ok(()),
            Err(_) => Err(TransportError::Disconnected),
        }
    }
}

impl TopicTransport for DdsTransport {
    fn publish(&mut self, topic: Topic, payload: &[u8]) -> Result<(), TransportError> {
        let sample = RawSample::from_payload(payload).ok_or(TransportError::Disconnected)?;
        let (_, writer) = self
            .writers
            .iter()
            .find(|(written, _)| *written == topic)
            .ok_or(TransportError::Disconnected)?;

        writer.write(sample, None).map_err(|_| TransportError::Disconnected)
    }

    fn receive(&mut self, timeout_micros: u64) -> Result<Option<Sample>, TransportError> {
        let deadline = Instant::now() + Duration::from_micros(timeout_micros);

        loop {
            let sample = self.take_next()?;

            if sample.is_some() {
                return Ok(sample);
            }

            let now = Instant::now();

            if now >= deadline {
                return Ok(None);
            }

            self.wait(deadline - now)?;
        }
    }
}

fn depth(topic: Topic) -> i32 {
    if topic == Topic::LocoResponse {
        ANSWER_DEPTH
    } else {
        STATE_DEPTH
    }
}

fn writer_qos() -> QosPolicies {
    QosPolicyBuilder::new()
        .reliability(Reliability::Reliable {
            max_blocking_time: rustdds::Duration::ZERO,
        })
        .history(History::KeepLast { depth: 1 })
        .durability(Durability::Volatile)
        .build()
}

fn reader_qos(depth: i32) -> QosPolicies {
    QosPolicyBuilder::new()
        .reliability(Reliability::BestEffort)
        .history(History::KeepLast { depth })
        .durability(Durability::Volatile)
        .build()
}

fn open_topic(
    participant: &DomainParticipant,
    endpoint: &Endpoint,
    qos: &QosPolicies,
) -> Result<rustdds::Topic, rustdds::dds::CreateError> {
    participant.create_topic(
        endpoint.name.clone(),
        endpoint.type_name().to_string(),
        qos,
        TopicKind::NoKey,
    )
}

fn open_writer(
    participant: &DomainParticipant,
    publisher: &Publisher,
    endpoint: &Endpoint,
) -> Result<RawWriter, rustdds::dds::CreateError> {
    let qos = writer_qos();
    let dds_topic = open_topic(participant, endpoint, &qos)?;

    publisher.create_datawriter_no_key::<RawSample, RawAdapter>(&dds_topic, Some(qos))
}

fn open_reader(
    participant: &DomainParticipant,
    subscriber: &Subscriber,
    endpoint: &Endpoint,
) -> Result<RawReader, rustdds::dds::CreateError> {
    let qos = reader_qos(depth(endpoint.topic));
    let dds_topic = open_topic(participant, endpoint, &qos)?;

    subscriber.create_datareader_no_key::<RawSample, RawAdapter>(&dds_topic, Some(qos))
}

fn take(reader: &mut RawReader, topic: Topic) -> Result<Option<Sample>, TransportError> {
    let taken = reader.take_next_sample().map_err(|_| TransportError::Disconnected)?;

    Ok(taken.map(|sample| Sample {
        topic,
        payload: sample.into_value().into_payload(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unknown_interface_is_refused_before_any_socket_opens() {
        let refused = DdsTransport::open("basecase-no-such-interface", &Endpoints::g1()).err();

        assert!(refused.is_some_and(|message| message.contains("basecase-no-such-interface")));
    }

    #[test]
    fn writers_are_reliable_and_readers_take_any_writer() {
        assert!(writer_qos().is_reliable());
        assert!(!reader_qos(STATE_DEPTH).is_reliable());
        assert!(writer_qos().is_volatile());
    }

    #[test]
    fn loco_answers_queue_and_state_topics_keep_the_newest() {
        assert_eq!(depth(Topic::LocoResponse), ANSWER_DEPTH);
        assert_eq!(depth(Topic::LowState), 1);
        assert_eq!(depth(Topic::JointStates), 1);
    }

    #[test]
    fn a_ros2_robot_opens_on_the_same_refusals() {
        let endpoints = Endpoints::ros2(
            servo_wire::ros2::ControllerKind::ForwardPosition,
            "/forward_position_controller/commands",
        )
        .unwrap();
        let refused = DdsTransport::open("basecase-no-such-interface", &endpoints).err();

        assert!(refused.is_some_and(|message| message.contains("basecase-no-such-interface")));
    }
}
