use super::scan::{scan_bus, scan_present};
use super::{Daemon, DaemonEvent, Holder, Run};
use crate::calibration::{Calibration, JointCalibration};
use crate::caps::caps_for;
use crate::fault::Fault;
use crate::ladder::{digest, refusal_message, Artefacts, Event, Fact, Mode};
use crate::monitor::Monitor;
use crate::safety::{ArmGrant, ReadBus, SafetyLayer};
use crate::stop::{lost_commands, StopPlan};

#[derive(Debug, Clone, PartialEq)]
pub enum Command {
    Enter(Mode),
    Stop,
    Fall,
    Release,
    ClearFault,
    Recheck,
    AssignId { id: u8, model: u16 },
}

impl Daemon {
    pub fn command(&mut self, command: Command) -> Result<(), String> {
        let outcome = match command {
            Command::Enter(Mode::Look) | Command::Release => {
                self.release();

                Ok(())
            }
            Command::Enter(mode) => self.enter(mode),
            Command::Stop => self.user_stop(lost_commands(self.class()), "Stopped."),
            Command::Fall => self.user_stop(StopPlan::LowerGain, "Fall reported: motors softened."),
            Command::ClearFault => self.clear_fault(),
            Command::Recheck => {
                self.recheck();

                Ok(())
            }
            Command::AssignId { id, model } => self.assign_id(id, model),
        };

        if let Err(message) = &outcome {
            self.push(DaemonEvent::Refused {
                message: message.clone(),
            });
        }

        outcome
    }

    fn clear_fault(&mut self) -> Result<(), String> {
        match self.ladder.apply(Event::ClearFault) {
            crate::ladder::Outcome::Done => Ok(()),
            crate::ladder::Outcome::Refused(refusal) => Err(refusal_message(&refusal)),
        }
    }

    fn user_stop(&mut self, plan: StopPlan, message: &str) -> Result<(), String> {
        if !matches!(self.holder, Holder::Armed(_)) {
            return Err("Nothing is moving.".into());
        }

        self.begin_stop(None, plan);

        let at_us = self.now_us();

        self.push(DaemonEvent::Stopped {
            at_us,
            message: message.into(),
        });

        Ok(())
    }

    pub(super) fn current_artefacts(&mut self) -> Artefacts {
        let calibration_bytes = self.artefacts.calibration();
        let parsed = calibration_bytes.as_deref().map(Calibration::parse);

        self.calibration = parsed.and_then(Result::ok);

        Artefacts {
            calibration: self.calibration.as_ref().and(calibration_bytes.as_deref()).map(digest),
            policy: self.artefacts.policy().as_deref().map(digest),
            firmware: self.firmware,
        }
    }

    fn recheck(&mut self) {
        let current = self.current_artefacts();
        let changes = self.ladder.observe(current);
        let active = matches!(self.run, Run::SoftStart { .. } | Run::Running | Run::Rehearsing);

        if changes.is_empty() || !active {
            return;
        }

        self.begin_stop(None, lost_commands(self.class()));

        let at_us = self.now_us();

        self.push(DaemonEvent::Mode {
            at_us,
            mode: self.ladder.mode(),
        });
    }

    fn release(&mut self) {
        let holder = std::mem::replace(&mut self.holder, Holder::Empty);
        let bus = match holder {
            Holder::Armed(layer) => layer.release(),
            Holder::Look(bus) => bus,
            Holder::Empty => return,
        };

        self.holder = Holder::Look(bus);
        self.run = Run::Idle;
        self.ladder.apply(Event::Enter(Mode::Look));
        self.announce_mode();
    }

    fn announce_mode(&mut self) {
        let at_us = self.now_us();

        self.push(DaemonEvent::Mode {
            at_us,
            mode: self.ladder.mode(),
        });
    }

    fn enter(&mut self, target: Mode) -> Result<(), String> {
        if target == Mode::SetUp && self.ladder.mode() == Mode::Look {
            self.check_bus()?;
        }

        if target == Mode::Test && self.ladder.mode() == Mode::SetUp && self.firmware.is_none() {
            self.recount_bus()?;
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

    fn check_bus(&mut self) -> Result<(), String> {
        let ids = self.config.ids.clone();
        let Holder::Look(bus) = &mut self.holder else {
            return Err("Go back to Look first.".into());
        };
        let scanned = scan_present(bus, &ids);

        self.ladder.apply(Event::Learned(Fact::BusChecked, scanned.is_ok()));

        match scanned {
            Ok(scanned) => {
                self.firmware = scanned.missing.is_empty().then_some(scanned.firmware);

                Ok(())
            }
            Err(fault) => {
                self.report_fault(&fault);

                Err(fault.message())
            }
        }
    }

    fn recount_bus(&mut self) -> Result<(), String> {
        let ids = self.config.ids.clone();
        let Holder::Armed(layer) = &mut self.holder else {
            return Err("Go back to Look first.".into());
        };

        match scan_bus(layer.bus_mut(), &ids) {
            Ok(firmware) => {
                self.firmware = Some(firmware);

                Ok(())
            }
            Err(Fault::NoReply { id }) => Err(format!(
                "Servo {id} doesn't answer. Give every servo its ID in Set up first."
            )),
            Err(fault) => Err(fault.message()),
        }
    }

    fn joints_for(&self, target: Mode) -> Result<Vec<JointCalibration>, String> {
        if target == Mode::SetUp {
            return Ok(self.config.ids.iter().map(|id| setup_joint(*id)).collect());
        }

        let calibration = self.calibration.as_ref().ok_or("Calibrate the robot first.")?;

        if calibration.ids() != self.config.ids {
            return Err("The calibration lists different servos from the ones connected.".into());
        }

        Ok(calibration.joints.clone())
    }

    fn take_bus(&mut self) -> Option<ReadBus> {
        match std::mem::replace(&mut self.holder, Holder::Empty) {
            Holder::Look(bus) => Some(bus),
            Holder::Armed(layer) => Some(layer.into_bus()),
            Holder::Empty => None,
        }
    }

    fn arm(&mut self, target: Mode, grant: ArmGrant) -> Result<(), String> {
        let joints = self.joints_for(target)?;
        let caps = caps_for(target);
        let bus = self.take_bus().ok_or("The servo adapter is gone.")?;
        let mut layer = SafetyLayer::new(bus, joints.clone(), caps, grant);

        self.monitor = Some(Monitor::new(joints.clone(), self.limits(caps.stop_temp_c)));
        self.stage_ticks = 0;
        self.stand_ticks = 0;
        self.travel = vec![0; joints.len()];
        self.start_positions = vec![None; joints.len()];
        self.run = match target {
            Mode::SetUp => Run::Idle,
            Mode::Rehearse => Run::Rehearsing,
            _ => Run::SoftStart { tick: 0 },
        };

        if matches!(target, Mode::SetUp | Mode::Rehearse) {
            let ids = layer.ids();

            if layer.torque_off(&ids).is_err() {
                self.report_fault(&Fault::BusGone);
            }

            self.shadow_goals = vec![None; joints.len()];
        }

        self.holder = Holder::Armed(layer);

        Ok(())
    }
}

fn setup_joint(id: u8) -> JointCalibration {
    JointCalibration {
        id,
        name: format!("servo {id}"),
        zero_counts: 2048,
        direction: 1,
        min_rad: -2.9,
        max_rad: 2.9,
    }
}
