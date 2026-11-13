use super::{G1Daemon, G1Run, Holder};
use crate::control::running::{TEST_TICKS, TEST_TRAVEL_COUNTS};
use crate::control::DaemonEvent;
use crate::fault::Fault;
use crate::intent::MAX_JOINTS;
use crate::ladder::{Event, Fact, Mode};
use crate::safety::{ArmSdkLayer, G1Bus, WriteError};
use crate::watchdog::Freshness;

const HANDED_BACK: &str = "The G1's arms are back with its own controller. No more arm commands will be sent.";

impl G1Daemon {
    fn with_layer<T>(
        &mut self,
        action: impl FnOnce(&mut ArmSdkLayer, Option<&crate::safety::Reading>) -> T,
    ) -> Option<T> {
        match &mut self.holder {
            Holder::Armed(layer) => {
                let reading = layer.bus().latest().cloned();

                Some(action(layer, reading.as_ref()))
            }
            _ => None,
        }
    }

    pub(super) fn soft_start(&mut self) {
        let result = self.with_layer(|layer, reading| {
            if layer.goals().iter().any(Option::is_none) {
                let present = layer.present(reading);

                layer.prepare(&present)?;
            }

            layer.ramp_weight(1.0).map(|()| layer.weight())
        });

        match result {
            Some(Ok(weight)) if weight >= 1.0 => self.start_running(),
            Some(Ok(_)) | None => {}
            Some(Err(error)) => self.write_failed(error),
        }
    }

    fn start_running(&mut self) {
        let now = self.now_us();
        let version = self.inputs.intents.version();

        self.intent_watchdog.arm(version, now);
        self.heartbeat_watchdog.arm(self.inputs.heartbeat.count(), now);
        self.applied_version = version;
        self.start = self
            .with_layer(|layer, reading| layer.present(reading))
            .unwrap_or_default();
        self.travel = vec![0; self.start.len()];
        self.stage_ticks = 0;
        self.run = G1Run::Running;
    }

    fn read_intent(&mut self) -> Result<Option<Vec<f32>>, Fault> {
        let now = self.now_us();

        if self.heartbeat_watchdog.observe(self.inputs.heartbeat.count(), now) == Freshness::Stale {
            return Err(Fault::ClientLost);
        }

        let mut values = [0.0f32; MAX_JOINTS];
        let snapshot = self.inputs.intents.read(&mut values);

        if self.intent_watchdog.observe(self.inputs.intents.version(), now) == Freshness::Stale {
            return Err(Fault::IntentStale);
        }

        match snapshot {
            Some(snap) if snap.version != self.applied_version => {
                self.applied_version = snap.version;

                Ok(Some(values[..snap.count].to_vec()))
            }
            _ => Ok(None),
        }
    }

    pub(super) fn running(&mut self) {
        let fresh = match self.read_intent() {
            Ok(fresh) => fresh,
            Err(fault) => return self.fault(fault),
        };
        let result = self.with_layer(|layer, reading| {
            let present = layer.present(reading);

            match fresh {
                Some(values) => layer.command(&values, &present),
                None => layer.ramp_weight(1.0),
            }
        });

        if let Some(Err(error)) = result {
            return self.write_failed(error);
        }

        self.track_travel();
        self.count_stage();
    }

    fn track_travel(&mut self) {
        let present = self
            .with_layer(|layer, reading| layer.present(reading))
            .unwrap_or_default();

        for ((now, start), travel) in present.iter().zip(&self.start).zip(self.travel.iter_mut()) {
            if let (Some(now), Some(start)) = (now, start) {
                *travel = (*travel).max((now - start).abs());
            }
        }
    }

    fn count_stage(&mut self) {
        self.stage_ticks += 1;

        let travelled = self.travel.iter().all(|travel| *travel >= TEST_TRAVEL_COUNTS);
        let earned = self.ladder.state().has(Fact::Tested);

        if self.stage_ticks >= TEST_TICKS && travelled && !earned && self.ladder.mode() == Mode::Test {
            self.ladder.apply(Event::Completed(Mode::Test));

            let at_us = self.now_us();

            self.push(DaemonEvent::Completed {
                at_us,
                mode: Mode::Test,
            });
        }
    }

    pub(super) fn write_failed(&mut self, error: WriteError) {
        let fault = match error {
            WriteError::Sealed => return,
            WriteError::BusGone => Fault::BusGone,
            WriteError::NotFinite { .. } => Fault::IntentNotFinite,
            WriteError::OutOfRange { id } => Fault::OutOfRange {
                id,
                joint: self.joint_name(usize::from(id).saturating_sub(1)),
            },
            other => Fault::WriteRefused {
                detail: format!("{other:?}"),
            },
        };

        self.fault(fault);
    }

    pub(super) fn begin_hand_back(&mut self, then_look: bool) {
        if matches!(self.run, G1Run::HandingBack { .. } | G1Run::Stopped) {
            return;
        }

        if !matches!(self.run, G1Run::SoftStart | G1Run::Running) {
            self.run = G1Run::Stopped;

            return;
        }

        self.run = G1Run::HandingBack { then_look };
        self.hand_back(then_look);
    }

    pub(super) fn hand_back(&mut self, then_look: bool) {
        let result = self.with_layer(|layer, _| {
            let ramped = layer.ramp_weight(0.0);
            let done = ramped.is_err() || layer.weight() <= 0.0;

            if done {
                layer.seal();
            }

            done
        });

        if result != Some(true) {
            return;
        }

        self.run = G1Run::Stopped;

        let at_us = self.now_us();

        self.push(DaemonEvent::Stopped {
            at_us,
            message: HANDED_BACK.into(),
        });

        if then_look {
            self.back_to_look();
        }
    }

    pub(super) fn back_to_look(&mut self) {
        let bus = match std::mem::replace(&mut self.holder, Holder::Empty) {
            Holder::Armed(layer) => layer.release(),
            Holder::Look(bus) => bus,
            Holder::Empty => return,
        };

        self.holder = Holder::Look(bus);
        self.run = G1Run::Idle;
        self.ladder.apply(Event::Enter(Mode::Look));
        self.announce_mode();
    }

    pub(super) fn take_bus(&mut self) -> Option<G1Bus> {
        match std::mem::replace(&mut self.holder, Holder::Empty) {
            Holder::Look(bus) => Some(bus),
            Holder::Armed(layer) => Some(layer.release()),
            Holder::Empty => None,
        }
    }

    pub(super) fn announce_mode(&mut self) {
        let at_us = self.now_us();

        self.push(DaemonEvent::Mode {
            at_us,
            mode: self.ladder.mode(),
        });
    }
}
