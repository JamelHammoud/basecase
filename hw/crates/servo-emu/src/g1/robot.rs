use super::joint::{own_gains, Drive, Joint, STAND_POSE};
use plant_bam::SplitMix;
use servo_wire::unitree::api::{Request, Response, GET_FSM_ID, LOCOMOTION_FSM};
use servo_wire::unitree::g1::{is_leg, is_writable, LEGS, MOTORS, WEIGHT_SLOT};
use servo_wire::unitree::{LowCmd, LowState, MotorCmd};
use servo_wire::{Sample, Topic};

pub const STATE_EVERY_US: u64 = 2_000;
pub const MODE_MACHINE: u8 = 5;
const SUBSTEP_US: u64 = 1_000;
const DAMP_FSM: i64 = 1;
const UNKNOWN_API: i32 = 3104;
const MOTOR_ERROR: u32 = 1;
const SUPPLY_VOLTS: f32 = 48.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum G1Fault {
    BadCrc,
    Silent,
    MotorDown { motor: usize },
    NotBalancing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct G1Options {
    pub seed: u64,
    pub fault: Option<G1Fault>,
}

impl Default for G1Options {
    fn default() -> Self {
        Self { seed: 1, fault: None }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct G1Counters {
    pub accepted: u64,
    pub refused_crc: u64,
    pub unreadable: u64,
    pub leg_writes: u64,
    pub arm_writes: u64,
    pub states: u64,
}

pub struct G1Emulator {
    joints: Vec<Joint>,
    command: LowCmd,
    weight: f32,
    time_us: u64,
    next_state_us: u64,
    tick: u32,
    temperatures: Vec<i16>,
    fault: Option<G1Fault>,
    counters: G1Counters,
    outbox: Vec<(u64, Sample)>,
}

impl G1Emulator {
    pub fn new(options: G1Options) -> Self {
        let mut rng = SplitMix::new(options.seed);
        let joints = (0..MOTORS).map(|motor| Joint::new(motor, &mut rng)).collect();
        let temperatures = (0..MOTORS).map(|_| 33 + rng.below(6) as i16).collect();

        Self {
            joints,
            command: LowCmd::default(),
            weight: 0.0,
            time_us: 0,
            next_state_us: STATE_EVERY_US,
            tick: 0,
            temperatures,
            fault: options.fault,
            counters: G1Counters::default(),
            outbox: Vec::new(),
        }
    }

    pub fn shared(self) -> super::SharedG1 {
        std::sync::Arc::new(std::sync::Mutex::new(self))
    }

    pub fn set_fault(&mut self, fault: Option<G1Fault>) {
        self.fault = fault;
    }

    pub fn counters(&self) -> G1Counters {
        self.counters
    }

    pub fn position(&self, motor: usize) -> f32 {
        self.joints[motor].q
    }

    pub fn hidden(&self, motor: usize) -> super::Hidden {
        self.joints[motor].hidden
    }

    pub fn weight(&self) -> f32 {
        self.weight
    }

    pub fn now_us(&self) -> u64 {
        self.time_us
    }

    pub fn deliver(&mut self, sample: &Sample) {
        match sample.topic {
            Topic::ArmSdk => self.accept_arm_sdk(&sample.payload),
            Topic::LocoRequest => self.answer(&sample.payload),
            Topic::LowState | Topic::LocoResponse => {}
        }
    }

    fn accept_arm_sdk(&mut self, payload: &[u8]) {
        let Ok(command) = LowCmd::decode(payload) else {
            self.counters.unreadable += 1;

            return;
        };

        if !command.crc_ok() {
            self.counters.refused_crc += 1;

            return;
        }

        let blank = MotorCmd::default();
        let touches_legs = command.motor_cmd[LEGS].iter().any(|motor| *motor != blank);
        let weight = command.motor_cmd[WEIGHT_SLOT].q;

        self.counters.accepted += 1;
        self.counters.leg_writes += u64::from(touches_legs);
        self.counters.arm_writes += u64::from(weight > 0.0);
        self.weight = if weight.is_finite() {
            weight.clamp(0.0, 1.0)
        } else {
            0.0
        };
        self.command = command;
    }

    fn fsm_id(&self) -> i64 {
        if self.fault == Some(G1Fault::NotBalancing) {
            DAMP_FSM
        } else {
            LOCOMOTION_FSM
        }
    }

    fn answer(&mut self, payload: &[u8]) {
        let Ok(request) = Request::decode(payload) else {
            return;
        };

        if request.noreply {
            return;
        }

        let known = request.api_id == GET_FSM_ID;
        let response = Response {
            id: request.id,
            api_id: request.api_id,
            code: if known { 0 } else { UNKNOWN_API },
            data: if known {
                format!("{{\"data\":{}}}", self.fsm_id())
            } else {
                String::new()
            },
        };

        self.outbox.push((
            self.time_us,
            Sample {
                topic: Topic::LocoResponse,
                payload: response.encode(),
            },
        ));
    }

    pub fn advance_to(&mut self, now_us: u64) -> Vec<(u64, Sample)> {
        while self.time_us + SUBSTEP_US <= now_us {
            self.step();
            self.time_us += SUBSTEP_US;

            if self.time_us >= self.next_state_us {
                self.publish_state();
                self.next_state_us += STATE_EVERY_US;
            }
        }

        std::mem::take(&mut self.outbox)
    }

    fn drive_for(&self, motor: usize) -> Drive {
        let own = Drive {
            target: STAND_POSE[motor],
            velocity: 0.0,
            feedforward: 0.0,
            gains: own_gains(motor),
        };
        let sdk = self.command.motor_cmd[motor];
        let usable = [sdk.q, sdk.dq, sdk.tau, sdk.kp, sdk.kd]
            .iter()
            .all(|value| value.is_finite());

        if !is_writable(motor) || self.weight == 0.0 || !usable {
            return own;
        }

        let w = self.weight;
        let blend = |ours: f32, theirs: f32| w * theirs + (1.0 - w) * ours;

        Drive {
            target: blend(own.target, sdk.q),
            velocity: w * sdk.dq,
            feedforward: w * sdk.tau,
            gains: super::Gains {
                kp: blend(own.gains.kp, sdk.kp.max(0.0)),
                kd: blend(own.gains.kd, sdk.kd.max(0.0)),
            },
        }
    }

    fn is_down(&self, motor: usize) -> bool {
        self.fault == Some(G1Fault::MotorDown { motor })
    }

    fn step(&mut self) {
        for motor in 0..MOTORS {
            if !self.is_down(motor) {
                let drive = self.drive_for(motor);

                self.joints[motor].step(drive);
            }
        }
    }

    fn state(&self) -> LowState {
        let mut state = LowState {
            version: [1, 0],
            mode_machine: MODE_MACHINE,
            tick: self.tick,
            ..LowState::default()
        };

        state.imu_state.quaternion = [1.0, 0.0, 0.0, 0.0];

        for (motor, joint) in self.joints.iter().enumerate() {
            let out = &mut state.motor_state[motor];

            out.mode = 1;
            out.q = joint.q;
            out.dq = joint.dq;
            out.ddq = joint.ddq;
            out.tau_est = joint.tau;
            out.temperature = [self.temperatures[motor]; 2];
            out.vol = SUPPLY_VOLTS;
            out.motorstate = if self.is_down(motor) { MOTOR_ERROR } else { 0 };
        }

        state.with_crc()
    }

    fn publish_state(&mut self) {
        self.tick = self.tick.wrapping_add(1);

        if self.fault == Some(G1Fault::Silent) {
            return;
        }

        let mut state = self.state();

        if self.fault == Some(G1Fault::BadCrc) {
            state.crc ^= 1;
        }

        self.counters.states += 1;
        self.outbox.push((
            self.time_us,
            Sample {
                topic: Topic::LowState,
                payload: state.encode(),
            },
        ));
    }

    pub fn leg_positions(&self) -> Vec<f32> {
        (0..MOTORS)
            .filter(|motor| is_leg(*motor))
            .map(|motor| self.joints[motor].q)
            .collect()
    }
}

#[cfg(test)]
#[path = "robot_tests.rs"]
mod tests;
