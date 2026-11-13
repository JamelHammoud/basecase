use super::{Holder, Ros2Daemon, Ros2Run};
use crate::control::DaemonEvent;
use crate::fault::Fault;
use crate::ladder::{Event, Fact, Mode};
use crate::safety::{Ros2Bus, Ros2Layer, Ros2Reading, WriteError};
use crate::session::TestProgress;

pub const HELD: &str = "The robot is holding still. No more commands will be sent.";

impl Ros2Daemon {
    fn with_layer<T>(&mut self, action: impl FnOnce(&mut Ros2Layer, Option<&Ros2Reading>) -> T) -> Option<T> {
        match &mut self.holder {
            Holder::Armed(layer) => {
                let reading = layer.bus().latest().cloned();

                Some(action(layer, reading.as_ref()))
            }
            _ => None,
        }
    }

    fn present(&mut self) -> Vec<Option<i32>> {
        self.with_layer(|layer, reading| layer.present(reading))
            .unwrap_or_default()
    }

    pub(super) fn soft_start(&mut self) {
        let result = self.with_layer(|layer, reading| {
            let present = layer.present(reading);

            layer.prepare(&present)
        });

        match result {
            Some(Ok(())) => self.start_running(),
            Some(Err(error)) => self.write_failed(error),
            None => {}
        }
    }

    fn start_running(&mut self) {
        let now = self.now_us();
        let start = self.present();

        self.feed.start(now);
        self.progress = TestProgress::begin(start);
        self.target = None;
        self.run = Ros2Run::Running;
    }

    pub(super) fn running(&mut self) {
        let now = self.now_us();

        match self.feed.read(now) {
            Ok(Some(values)) => self.target = Some(values),
            Ok(None) => {}
            Err(fault) => return self.fault(fault),
        }

        if let Some(target) = self.target.clone() {
            let result = self.with_layer(|layer, reading| {
                let present = layer.present(reading);

                layer.command(&target, &present)
            });

            if let Some(Err(error)) = result {
                return self.write_failed(error);
            }
        }

        self.count_stage();
    }

    fn count_stage(&mut self) {
        let present = self.present();
        let done = self.progress.observe(&present);
        let earned = self.ladder.state().has(Fact::Tested);

        if done && !earned && self.ladder.mode() == Mode::Test {
            self.ladder.apply(Event::Completed(Mode::Test));

            let at_us = self.now_us();

            self.push(DaemonEvent::Completed {
                at_us,
                mode: Mode::Test,
            });
        }
    }

    fn refused_detail(&self, error: &WriteError) -> String {
        match error {
            WriteError::WrongLength { expected, got } => format!("{got} numbers for {expected}"),
            WriteError::NoTelemetry { id } => format!("no position for {}", self.joint_name(*id)),
            other => format!("{other:?}"),
        }
    }

    pub(super) fn write_failed(&mut self, error: WriteError) {
        let fault = match error {
            WriteError::Sealed => return,
            WriteError::BusGone => Fault::BusGone,
            WriteError::NotFinite { .. } => Fault::IntentNotFinite,
            WriteError::OutOfRange { id } => Fault::OutOfRange {
                id,
                joint: self.joint_name(id),
            },
            other => Fault::WriteRefused {
                detail: self.refused_detail(&other),
            },
        };

        self.fault(fault);
    }

    pub(super) fn hold(&mut self) {
        let commanding = self.run.is_commanding();

        self.with_layer(|layer, reading| {
            let present = layer.present(reading);

            if commanding {
                let _ = layer.hold(&present);
            }

            layer.seal();
        });
        self.run = Ros2Run::Stopped;

        if !commanding {
            return;
        }

        let at_us = self.now_us();

        self.push(DaemonEvent::Stopped {
            at_us,
            message: HELD.into(),
        });
    }

    pub(super) fn back_to_look(&mut self) {
        let Some(bus) = self.take_bus() else {
            return;
        };

        self.holder = Holder::Look(bus);
        self.run = Ros2Run::Idle;
        self.ladder.apply(Event::Enter(Mode::Look));
        self.announce_mode();
    }

    pub(super) fn take_bus(&mut self) -> Option<Ros2Bus> {
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
