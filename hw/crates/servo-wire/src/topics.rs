use crate::TransportError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Topic {
    LowState,
    ArmSdk,
    LocoRequest,
    LocoResponse,
}

impl Topic {
    pub const ALL: [Topic; 4] = [Topic::LowState, Topic::ArmSdk, Topic::LocoRequest, Topic::LocoResponse];

    pub fn name(self) -> &'static str {
        match self {
            Topic::LowState => "rt/lowstate",
            Topic::ArmSdk => "rt/arm_sdk",
            Topic::LocoRequest => "rt/api/loco/request",
            Topic::LocoResponse => "rt/api/loco/response",
        }
    }

    pub fn type_name(self) -> &'static str {
        match self {
            Topic::LowState => "unitree_hg::msg::dds_::LowState_",
            Topic::ArmSdk => "unitree_hg::msg::dds_::LowCmd_",
            Topic::LocoRequest => "unitree_api::msg::dds_::Request_",
            Topic::LocoResponse => "unitree_api::msg::dds_::Response_",
        }
    }

    pub fn code(self) -> u8 {
        match self {
            Topic::LowState => 1,
            Topic::ArmSdk => 2,
            Topic::LocoRequest => 3,
            Topic::LocoResponse => 4,
        }
    }

    pub fn from_code(code: u8) -> Option<Topic> {
        Topic::ALL.into_iter().find(|topic| topic.code() == code)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sample {
    pub topic: Topic,
    pub payload: Vec<u8>,
}

pub trait TopicTransport: Send {
    fn publish(&mut self, topic: Topic, payload: &[u8]) -> Result<(), TransportError>;

    fn receive(&mut self, timeout_micros: u64) -> Result<Option<Sample>, TransportError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_topic_has_its_own_code() {
        for topic in Topic::ALL {
            assert_eq!(Topic::from_code(topic.code()), Some(topic));
        }

        assert_eq!(Topic::from_code(0), None);
    }
}
