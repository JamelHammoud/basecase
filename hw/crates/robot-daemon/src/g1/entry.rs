use super::{G1Daemon, G1Run, Holder, FSM_TIMEOUT_US, LOST_STATE_US, TOP_RUNG};
use crate::calibration::{Calibration, JointCalibration};
use crate::caps::caps_for;
use crate::control::{Command, DaemonEvent};
use crate::fault::Fault;
use crate::ladder::{digest, refusal_message, Artefacts, Event, Fact, Hash, Mode};
use crate::safety::{ArmGrant, ArmSdkLayer, G1Bus};
use crate::session::TestProgress;
use servo_wire::unitree::api::LOCOMOTION_FSM;
use servo_wire::unitree::g1::{joint_id, motor_of, LIMITS, WRITABLE};

pub const POLICY_RUNGS_OUT: &str = "The G1 climbs to Test only. Policy runs stay off for it.";
const CALIBRATION_JOINTS: &str = "The calibration must list the G1's 17 arm and waist joints, ids 13 to 29.";
const LOOK_FIRST: &str = "Go back to Look first.";

pub fn writable_joint(id: u8, name: String) -> JointCalibration {
    let (min_rad, max_rad) = motor_of(id).map_or((0.0, 0.0), |motor| LIMITS[motor]);

    JointCalibration {
        id,
        name,
        zero_counts: 2048,
        direction: 1,
        min_rad,
        max_rad,
    }
}

fn within_limits(joint: &JointCalibration) -> Option<JointCalibration> {
    let (min, max) = LIMITS[motor_of(joint.id)?];
    let narrowed = JointCalibration {
        min_rad: joint.min_rad.max(min),
        max_rad: joint.max_rad.min(max),
        ..joint.clone()
    };

    (narrowed.min_rad < narrowed.max_rad).then_some(narrowed)
}

fn g1_joints(calibration: &Calibration) -> Result<Vec<JointCalibration>, String> {
    let expected: Vec<u8> = WRITABLE.map(joint_id).collect();

    if calibration.ids() != expected {
        return Err(CALIBRATION_JOINTS.into());
    }

    calibration
        .joints
        .iter()
        .map(within_limits)
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| CALIBRATION_JOINTS.into())
}

fn set_up_fault(bus: &mut G1Bus) -> Result<Hash, Fault> {
    let now = bus.now_us();
    let reading = bus
        .latest()
        .filter(|reading| now.saturating_sub(reading.at_us) <= LOST_STATE_US)
        .ok_or(Fault::StateLost)?;
    let firmware = digest(&reading.firmware_bytes());
    let missing = reading
        .motors
        .iter()
        .filter(|motor| motor.error != 0 || !motor.enabled)
        .count();

    if missing > 0 {
        return Err(Fault::MotorsMissing { count: missing });
    }

    let answer = bus
        .ask_fsm(FSM_TIMEOUT_US)
        .map_err(|_| Fault::BusGone)?
        .ok_or(Fault::LocoSilent)?;
    let fsm = Some(answer)
        .filter(|answer| answer.code == 0)
        .and_then(|answer| answer.data_number());

    if fsm != Some(LOCOMOTION_FSM) {
        return Err(Fault::NotBalancing { fsm });
    }

    Ok(firmware)
}

impl G1Daemon {
    pub fn command(&mut self, command: Command) -> Result<(), String> {
        let outcome = match command {
            Command::Enter(Mode::Look) | Command::Release => {
                self.release();

                Ok(())
            }
            Command::Enter(mode) => self.enter(mode),
            Command::Stop | Command::Fall => self.user_stop(),
            Command::ClearFault => match self.ladder.apply(Event::ClearFault) {
                crate::ladder::Outcome::Done => Ok(()),
                crate::ladder::Outcome::Refused(refusal) => Err(refusal_message(&refusal)),
            },
            Command::Recheck => {
                self.recheck();

                Ok(())
            }
            Command::AssignId { .. } => Err("The G1 numbers its own motors.".into()),
        };

        if let Err(message) = &outcome {
            self.push(DaemonEvent::Refused {
                message: message.clone(),
            });
        }

        outcome
    }

    fn release(&mut self) {
        match self.run {
            G1Run::SoftStart | G1Run::Running => self.begin_hand_back(true),
            G1Run::HandingBack { .. } => self.run = G1Run::HandingBack { then_look: true },
            G1Run::Idle | G1Run::Stopped => self.back_to_look(),
        }
    }

    fn user_stop(&mut self) -> Result<(), String> {
        if !matches!(self.run, G1Run::SoftStart | G1Run::Running) {
            return Err("Nothing is moving.".into());
        }

        let at_us = self.now_us();

        self.push(DaemonEvent::Stopped {
            at_us,
            message: "Stopped.".into(),
        });
        self.begin_hand_back(false);

        Ok(())
    }

    fn current_artefacts(&mut self) -> Artefacts {
        let bytes = self.artefacts.calibration();

        self.calibration = bytes.as_deref().map(Calibration::parse).and_then(Result::ok);

        Artefacts {
            calibration: self.calibration.as_ref().and(bytes.as_deref()).map(digest),
            policy: None,
            firmware: self.firmware,
        }
    }

    fn recheck(&mut self) {
        let current = self.current_artefacts();
        let changes = self.ladder.observe(current);

        if changes.is_empty() || !matches!(self.run, G1Run::SoftStart | G1Run::Running) {
            return;
        }

        self.begin_hand_back(false);
        self.announce_mode();
    }

    fn enter(&mut self, target: Mode) -> Result<(), String> {
        if target > TOP_RUNG {
            return Err(POLICY_RUNGS_OUT.into());
        }

        if self.holds_arms() {
            return Err(LOOK_FIRST.into());
        }

        if target == Mode::SetUp && self.ladder.mode() == Mode::Look {
            self.set_up()?;
        }

        let current = self.current_artefacts();
        let grant = self
            .ladder
            .enter(target, current)
            .map_err(|refusal| refusal_message(&refusal))?
            .ok_or("Look needs no motors.")?;

        self.arm(target, grant)?;
        self.announce_mode();

        Ok(())
    }

    fn holds_arms(&self) -> bool {
        matches!(self.run, G1Run::SoftStart | G1Run::Running | G1Run::HandingBack { .. })
    }

    fn set_up(&mut self) -> Result<(), String> {
        let Holder::Look(bus) = &mut self.holder else {
            return Err(LOOK_FIRST.into());
        };
        let checked = bus
            .wait_for_state(LOST_STATE_US)
            .map_err(|_| Fault::BusGone)
            .and_then(|()| set_up_fault(bus));

        self.ladder.apply(Event::Learned(Fact::BusChecked, checked.is_ok()));

        match checked {
            Ok(firmware) => {
                self.firmware = Some(firmware);

                Ok(())
            }
            Err(fault) => {
                self.report_fault(&fault);

                Err(fault.message())
            }
        }
    }

    fn joints_for(&self, target: Mode) -> Result<Vec<JointCalibration>, String> {
        if target == Mode::SetUp {
            return Ok(WRITABLE
                .map(|motor| writable_joint(joint_id(motor), format!("motor {motor}")))
                .collect());
        }

        g1_joints(self.calibration.as_ref().ok_or("Calibrate the robot first.")?)
    }

    fn arm(&mut self, target: Mode, grant: ArmGrant) -> Result<(), String> {
        let joints = self.joints_for(target)?;
        let bus = self.take_bus().ok_or("The robot's network link is gone.")?;

        self.holder = Holder::Armed(ArmSdkLayer::new(bus, joints, caps_for(target), grant));
        self.progress = TestProgress::default();
        self.run = if target == Mode::SetUp {
            G1Run::Idle
        } else {
            G1Run::SoftStart
        };

        Ok(())
    }
}
