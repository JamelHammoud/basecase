use crate::dds_raw::{RawAdapter, RawSample};
use crate::interface::interface_address;
use rustdds::mio1::{Events, Interest, Poll, Token};
use rustdds::no_key::{DataReader, DataWriter};
use rustdds::policy::{Durability, History, Reliability};
use rustdds::{
    DomainParticipant, DomainParticipantBuilder, Publisher, QosPolicies, QosPolicyBuilder, Subscriber, TopicKind,
};
use servo_wire::{Sample, Topic, TopicTransport, TransportError};
use std::error::Error;
use std::io::ErrorKind;
use std::net::Ipv4Addr;
use std::time::{Duration, Instant};

const DOMAIN: u16 = 0;
const LOW_STATE_TOKEN: Token = Token(0);
const LOCO_RESPONSE_TOKEN: Token = Token(1);
const LOW_STATE_DEPTH: i32 = 1;
const LOCO_RESPONSE_DEPTH: i32 = 8;
const EVENT_CAPACITY: usize = 8;

type RawWriter = DataWriter<RawSample, RawAdapter>;
type RawReader = DataReader<RawSample, RawAdapter>;

pub struct DdsTransport {
    arm_sdk: RawWriter,
    loco_request: RawWriter,
    low_state: RawReader,
    loco_response: RawReader,
    poll: Poll,
    events: Events,
    _publisher: Publisher,
    _subscriber: Subscriber,
    _participant: DomainParticipant,
}

impl DdsTransport {
    pub fn open(interface: &str) -> Result<Self, String> {
        let address = interface_address(interface)?;

        Self::start(address).map_err(|error| format!("Could not start DDS on {interface}: {error}"))
    }

    fn start(address: Ipv4Addr) -> Result<Self, Box<dyn Error>> {
        let participant = DomainParticipantBuilder::new(DOMAIN)
            .with_only_networks([address])
            .same_host_loopback(false)
            .build()?;
        let publisher = participant.create_publisher(&writer_qos())?;
        let subscriber = participant.create_subscriber(&reader_qos(LOW_STATE_DEPTH))?;
        let arm_sdk = open_writer(&participant, &publisher, Topic::ArmSdk)?;
        let loco_request = open_writer(&participant, &publisher, Topic::LocoRequest)?;
        let mut low_state = open_reader(&participant, &subscriber, Topic::LowState, LOW_STATE_DEPTH)?;
        let mut loco_response = open_reader(&participant, &subscriber, Topic::LocoResponse, LOCO_RESPONSE_DEPTH)?;
        let poll = Poll::new()?;

        poll.registry()
            .register(&mut low_state, LOW_STATE_TOKEN, Interest::READABLE)?;
        poll.registry()
            .register(&mut loco_response, LOCO_RESPONSE_TOKEN, Interest::READABLE)?;

        Ok(Self {
            arm_sdk,
            loco_request,
            low_state,
            loco_response,
            poll,
            events: Events::with_capacity(EVENT_CAPACITY),
            _publisher: publisher,
            _subscriber: subscriber,
            _participant: participant,
        })
    }

    fn take_next(&mut self) -> Result<Option<Sample>, TransportError> {
        let response = take(&mut self.loco_response, Topic::LocoResponse)?;

        if response.is_some() {
            return Ok(response);
        }

        take(&mut self.low_state, Topic::LowState)
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
        let writer = match topic {
            Topic::ArmSdk => &self.arm_sdk,
            Topic::LocoRequest => &self.loco_request,
            Topic::LowState | Topic::LocoResponse => return Err(TransportError::Disconnected),
        };

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
    topic: Topic,
    qos: &QosPolicies,
) -> Result<rustdds::Topic, rustdds::dds::CreateError> {
    participant.create_topic(
        topic.name().to_string(),
        topic.type_name().to_string(),
        qos,
        TopicKind::NoKey,
    )
}

fn open_writer(
    participant: &DomainParticipant,
    publisher: &Publisher,
    topic: Topic,
) -> Result<RawWriter, rustdds::dds::CreateError> {
    let qos = writer_qos();
    let dds_topic = open_topic(participant, topic, &qos)?;

    publisher.create_datawriter_no_key::<RawSample, RawAdapter>(&dds_topic, Some(qos))
}

fn open_reader(
    participant: &DomainParticipant,
    subscriber: &Subscriber,
    topic: Topic,
    depth: i32,
) -> Result<RawReader, rustdds::dds::CreateError> {
    let qos = reader_qos(depth);
    let dds_topic = open_topic(participant, topic, &qos)?;

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
        let refused = DdsTransport::open("basecase-no-such-interface").err();

        assert!(refused.is_some_and(|message| message.contains("basecase-no-such-interface")));
    }

    #[test]
    fn writers_are_reliable_and_readers_take_any_writer() {
        assert!(writer_qos().is_reliable());
        assert!(!reader_qos(LOW_STATE_DEPTH).is_reliable());
        assert!(writer_qos().is_volatile());
    }
}
