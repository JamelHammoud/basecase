use super::bus::BusGone;
use servo_wire::unitree::api::{Request, Response};
use servo_wire::unitree::g1::MOTORS;
use servo_wire::unitree::LowState;
use servo_wire::{Clock, Sample, Topic, TopicTransport};
use std::sync::Arc;

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct MotorReading {
    pub q: f32,
    pub dq: f32,
    pub tau: f32,
    pub temp_c: f32,
    pub volts: f32,
    pub enabled: bool,
    pub error: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Reading {
    pub at_us: u64,
    pub mode_machine: u8,
    pub version: [u32; 2],
    pub motors: Vec<MotorReading>,
}

impl Reading {
    fn from_state(state: &LowState, at_us: u64) -> Self {
        let motors = state.motor_state[..MOTORS]
            .iter()
            .map(|motor| MotorReading {
                q: motor.q,
                dq: motor.dq,
                tau: motor.tau_est,
                temp_c: f32::from(motor.temperature[0].max(motor.temperature[1])),
                volts: motor.vol,
                enabled: motor.mode == 1,
                error: motor.motorstate,
            })
            .collect();

        Self {
            at_us,
            mode_machine: state.mode_machine,
            version: state.version,
            motors,
        }
    }

    pub fn firmware_bytes(&self) -> Vec<u8> {
        let mut bytes = vec![self.mode_machine];

        for word in self.version {
            bytes.extend_from_slice(&word.to_le_bytes());
        }

        bytes
    }
}

pub struct G1Bus {
    transport: Box<dyn TopicTransport>,
    clock: Arc<dyn Clock>,
    latest: Option<Reading>,
    refused: u64,
    next_request: i64,
    answers: Vec<Response>,
}

impl G1Bus {
    pub fn new(transport: Box<dyn TopicTransport>, clock: Arc<dyn Clock>) -> Self {
        Self {
            transport,
            clock,
            latest: None,
            refused: 0,
            next_request: 1,
            answers: Vec::new(),
        }
    }

    pub fn latest(&self) -> Option<&Reading> {
        self.latest.as_ref()
    }

    pub fn refused(&self) -> u64 {
        self.refused
    }

    pub fn now_us(&self) -> u64 {
        self.clock.now_micros()
    }

    fn take(&mut self, sample: Sample) {
        match sample.topic {
            Topic::LowState => self.take_state(&sample.payload),
            Topic::LocoResponse => {
                if let Ok(response) = Response::decode(&sample.payload) {
                    self.answers.push(response);
                }
            }
            Topic::ArmSdk | Topic::LocoRequest => {}
        }
    }

    fn take_state(&mut self, payload: &[u8]) {
        match LowState::decode(payload) {
            Ok(state) if state.crc_ok() => self.latest = Some(Reading::from_state(&state, self.clock.now_micros())),
            _ => self.refused += 1,
        }
    }

    pub fn poll(&mut self) -> Result<(), BusGone> {
        while let Some(sample) = self.transport.receive(0).map_err(|_| BusGone)? {
            self.take(sample);
        }

        Ok(())
    }

    pub fn wait_for_state(&mut self, fresh_within_us: u64) -> Result<(), BusGone> {
        let deadline = self.clock.now_micros() + fresh_within_us;

        self.poll()?;

        loop {
            let now = self.clock.now_micros();
            let fresh = self
                .latest
                .as_ref()
                .is_some_and(|reading| now.saturating_sub(reading.at_us) <= fresh_within_us);

            if fresh || now >= deadline {
                return Ok(());
            }

            if let Some(sample) = self.transport.receive(deadline - now).map_err(|_| BusGone)? {
                self.take(sample);
            }
        }
    }

    pub fn ask_fsm(&mut self, timeout_us: u64) -> Result<Option<Response>, BusGone> {
        let id = self.next_request;
        let deadline = self.clock.now_micros() + timeout_us;

        self.next_request += 1;
        self.answers.clear();
        self.transport
            .publish(Topic::LocoRequest, &Request::get_fsm_id(id).encode())
            .map_err(|_| BusGone)?;

        loop {
            if let Some(answer) = self.answers.iter().find(|answer| answer.id == id) {
                return Ok(Some(answer.clone()));
            }

            let now = self.clock.now_micros();

            if now >= deadline {
                return Ok(None);
            }

            if let Some(sample) = self.transport.receive(deadline - now).map_err(|_| BusGone)? {
                self.take(sample);
            }
        }
    }

    pub(super) fn publish_arm_sdk(&mut self, payload: &[u8]) -> Result<(), BusGone> {
        self.transport.publish(Topic::ArmSdk, payload).map_err(|_| BusGone)
    }
}
