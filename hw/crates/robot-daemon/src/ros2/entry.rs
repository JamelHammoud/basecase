use super::{map_joints, Holder, Ros2Daemon, Ros2Run, SET_UP_WAIT_US, TOP_RUNG};
use crate::calibration::{Calibration, JointCalibration};
use crate::caps::caps_for;
use crate::control::{Command, DaemonEvent};
use crate::fault::Fault;
use crate::ladder::{digest, refusal_message, Artefacts, Event, Fact, Hash, Mode, Outcome};
use crate::safety::{ArmGrant, Ros2Bus, Ros2Layer, Ros2Plan};

pub const POLICY_RUNGS_OUT: &str = "A ROS 2 robot climbs to Test only. Policy runs stay off for it.";
const LOOK_FIRST: &str = "Go back to Look first.";
const SPEC_RANGE_RAD: f32 = 2.8;

pub fn spec_joint(id: u8, name: String) -> JointCalibration {
    JointCalibration {
        id,
        name,
        zero_counts: 2048,
        direction: 1,
        min_rad: -SPEC_RANGE_RAD,
        max_rad: SPEC_RANGE_RAD,
    }
}

fn calibration_joints(count: usize) -> String {
    match count {
        1 => "The calibration must list the robot's one joint, id 1.".into(),
        _ => format!("The calibration must list the robot's {count} joints, ids 1 to {count}, in the scene's order."),
    }
}

fn spec_joints(calibration: &Calibration, count: usize) -> Result<Vec<JointCalibration>, String> {
    let expected: Vec<u8> = (1..=count).filter_map(|id| u8::try_from(id).ok()).collect();

    if calibration.ids() != expected {
        return Err(calibration_joints(count));
    }

    Ok(calibration.joints.clone())
}

fn set_up_fault(bus: &Ros2Bus, joints: &[String]) -> Result<Hash, Fault> {
    let reading = bus.fresh(SET_UP_WAIT_US).ok_or(Fault::JointStatesLost)?;
    let map = map_joints(joints, &reading.names);

    if !map.matches() {
        return Err(Fault::JointsUnmatched {
            missing: map.missing,
            extra: map.extra,
        });
    }

    Ok(digest(&reading.names_digest_bytes()))
}

impl Ros2Daemon {
    pub fn command(&mut self, command: Command) -> Result<(), String> {
        let outcome = match command {
            Command::Enter(Mode::Look) | Command::Release => {
                self.release();

                Ok(())
            }
            Command::Enter(mode) => self.enter(mode),
            Command::Stop | Command::Fall => self.user_stop(),
            Command::ClearFault => match self.ladder.apply(Event::ClearFault) {
                Outcome::Done => Ok(()),
                Outcome::Refused(refusal) => Err(refusal_message(&refusal)),
            },
            Command::Recheck => {
                self.recheck();

                Ok(())
            }
            Command::AssignId { .. } => Err("A ROS 2 robot names its own joints.".into()),
        };

        if let Err(message) = &outcome {
            self.push(DaemonEvent::Refused {
                message: message.clone(),
            });
        }

        outcome
    }

    fn release(&mut self) {
        if self.run.is_commanding() {
            self.hold();
        }

        self.back_to_look();
    }

    fn user_stop(&mut self) -> Result<(), String> {
        if !self.run.is_commanding() {
            return Err("Nothing is moving.".into());
        }

        self.hold();

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

        if changes.is_empty() || !self.run.is_commanding() {
            return;
        }

        self.hold();
        self.announce_mode();
    }

    fn enter(&mut self, target: Mode) -> Result<(), String> {
        if target > TOP_RUNG {
            return Err(POLICY_RUNGS_OUT.into());
        }

        if self.run.is_commanding() {
            return Err(LOOK_FIRST.into());
        }

        if target == Mode::SetUp && self.ladder.mode() == Mode::Look {
            self.set_up()?;
        }

        let current = self.current_artefacts();
        let joints = self.joints_for(target)?;
        let grant = self
            .ladder
            .enter(target, current)
            .map_err(|refusal| refusal_message(&refusal))?
            .ok_or("Look needs no motors.")?;

        self.arm(target, joints, grant)?;
        self.announce_mode();

        Ok(())
    }

    fn set_up(&mut self) -> Result<(), String> {
        let Holder::Look(bus) = &mut self.holder else {
            return Err(LOOK_FIRST.into());
        };
        let checked = bus
            .wait_for_state(SET_UP_WAIT_US)
            .map_err(|_| Fault::BusGone)
            .and_then(|()| set_up_fault(bus, &self.spec.joints));

        self.ladder.apply(Event::Learned(Fact::BusChecked, checked.is_ok()));

        match checked {
            Ok(firmware) => {
                self.firmware = Some(firmware);

                Ok(())
            }
            Err(fault) => {
                self.report_fault(&fault);

                Err(fault.ros2_message())
            }
        }
    }

    fn joints_for(&self, target: Mode) -> Result<Vec<JointCalibration>, String> {
        if target == Mode::SetUp {
            return Ok(self
                .spec
                .joints
                .iter()
                .zip(1..=u8::MAX)
                .map(|(name, id)| spec_joint(id, name.clone()))
                .collect());
        }

        self.calibration.as_ref().map_or(Ok(Vec::new()), |calibration| {
            spec_joints(calibration, self.spec.joints.len())
        })
    }

    fn arm(&mut self, target: Mode, joints: Vec<JointCalibration>, grant: ArmGrant) -> Result<(), String> {
        let bus = self.take_bus().ok_or("The robot's network link is gone.")?;
        let plan = Ros2Plan {
            kind: self.spec.kind,
            names: self.spec.joints.clone(),
            joints,
            caps: caps_for(target),
        };

        self.holder = Holder::Armed(Ros2Layer::new(bus, plan, grant));
        self.target = None;
        self.progress = crate::session::TestProgress::default();
        self.run = if target == Mode::SetUp {
            Ros2Run::Idle
        } else {
            Ros2Run::SoftStart
        };

        Ok(())
    }
}
