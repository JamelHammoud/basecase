use crate::TransportError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Topic {
    LowState,
    ArmSdk,
    LocoRequest,
    LocoResponse,
    JointStates,
    PositionCommands,
    TrajectoryCommands,
    CmdVel,
}

impl Topic {
    pub const ALL: [Topic; 8] = [
        Topic::LowState,
        Topic::ArmSdk,
        Topic::LocoRequest,
        Topic::LocoResponse,
        Topic::JointStates,
        Topic::PositionCommands,
        Topic::TrajectoryCommands,
        Topic::CmdVel,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Topic::LowState => "rt/lowstate",
            Topic::ArmSdk => "rt/arm_sdk",
            Topic::LocoRequest => "rt/api/loco/request",
            Topic::LocoResponse => "rt/api/loco/response",
            Topic::JointStates => "rt/joint_states",
            Topic::PositionCommands => "rt/forward_position_controller/commands",
            Topic::TrajectoryCommands => "rt/joint_trajectory_controller/joint_trajectory",
            Topic::CmdVel => "rt/cmd_vel",
        }
    }

    pub fn type_name(self) -> &'static str {
        match self {
            Topic::LowState => "unitree_hg::msg::dds_::LowState_",
            Topic::ArmSdk => "unitree_hg::msg::dds_::LowCmd_",
            Topic::LocoRequest => "unitree_api::msg::dds_::Request_",
            Topic::LocoResponse => "unitree_api::msg::dds_::Response_",
            Topic::JointStates => "sensor_msgs::msg::dds_::JointState_",
            Topic::PositionCommands => "std_msgs::msg::dds_::Float64MultiArray_",
            Topic::TrajectoryCommands => "trajectory_msgs::msg::dds_::JointTrajectory_",
            Topic::CmdVel => "geometry_msgs::msg::dds_::Twist_",
        }
    }

    pub fn code(self) -> u8 {
        match self {
            Topic::LowState => 1,
            Topic::ArmSdk => 2,
            Topic::LocoRequest => 3,
            Topic::LocoResponse => 4,
            Topic::JointStates => 5,
            Topic::PositionCommands => 6,
            Topic::TrajectoryCommands => 7,
            Topic::CmdVel => 8,
        }
    }

    pub fn from_code(code: u8) -> Option<Topic> {
        Topic::ALL.into_iter().find(|topic| topic.code() == code)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoint {
    pub topic: Topic,
    pub name: String,
}

impl Endpoint {
    pub fn fixed(topic: Topic) -> Self {
        Self {
            topic,
            name: topic.name().to_string(),
        }
    }

    pub fn type_name(&self) -> &'static str {
        self.topic.type_name()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoints {
    pub reads: Vec<Endpoint>,
    pub writes: Vec<Endpoint>,
}

impl Endpoints {
    pub fn fixed(reads: &[Topic], writes: &[Topic]) -> Self {
        Self {
            reads: reads.iter().copied().map(Endpoint::fixed).collect(),
            writes: writes.iter().copied().map(Endpoint::fixed).collect(),
        }
    }

    pub fn g1() -> Self {
        Self::fixed(
            &[Topic::LocoResponse, Topic::LowState],
            &[Topic::ArmSdk, Topic::LocoRequest],
        )
    }

    pub fn name_of(&self, topic: Topic) -> Option<&str> {
        self.reads
            .iter()
            .chain(&self.writes)
            .find(|endpoint| endpoint.topic == topic)
            .map(|endpoint| endpoint.name.as_str())
    }

    pub fn reads(&self, topic: Topic) -> bool {
        self.reads.iter().any(|endpoint| endpoint.topic == topic)
    }

    pub fn writes(&self, topic: Topic) -> bool {
        self.writes.iter().any(|endpoint| endpoint.topic == topic)
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
        assert_eq!(Topic::from_code(9), None);
    }

    #[test]
    fn every_default_name_is_a_dds_topic_under_rt() {
        for topic in Topic::ALL {
            assert!(topic.name().starts_with("rt/"), "{topic:?}");
            assert!(topic.type_name().contains("::msg::dds_::"), "{topic:?}");
        }
    }

    #[test]
    fn the_g1_reads_its_state_and_loco_answers_and_writes_arm_sdk_and_loco_requests() {
        let g1 = Endpoints::g1();

        assert!(g1.reads(Topic::LowState) && g1.reads(Topic::LocoResponse));
        assert!(g1.writes(Topic::ArmSdk) && g1.writes(Topic::LocoRequest));
        assert!(!g1.writes(Topic::LowState) && !g1.reads(Topic::JointStates));
        assert_eq!(g1.name_of(Topic::ArmSdk), Some("rt/arm_sdk"));
        assert_eq!(g1.name_of(Topic::CmdVel), None);
    }
}
