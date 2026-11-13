use crate::caps::TICK_US;
use crate::control::{Command, Daemon, DaemonEvent, Run};
use crate::g1::{G1Daemon, G1Run};
use crate::protocol::{event_line, g1_status_line, ros2_status_line, status_line};
use crate::ros2::Ros2Daemon;
use servo_wire::Clock;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, SyncSender};
use std::sync::Arc;

const STATUS_EVERY_TICKS: u64 = 5;

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Jitter {
    pub ticks: u64,
    pub worst_late_us: u64,
}

pub trait Controller {
    fn command(&mut self, command: Command);

    fn tick(&mut self);

    fn take_events(&mut self) -> Vec<DaemonEvent>;

    fn status_line(&self) -> String;

    fn is_quiet(&self) -> bool;
}

impl Controller for Daemon {
    fn command(&mut self, command: Command) {
        let _ = Daemon::command(self, command);
    }

    fn tick(&mut self) {
        Daemon::tick(self);
    }

    fn take_events(&mut self) -> Vec<DaemonEvent> {
        Daemon::take_events(self)
    }

    fn status_line(&self) -> String {
        status_line(self)
    }

    fn is_quiet(&self) -> bool {
        matches!(self.run(), Run::Idle | Run::Stopped)
    }
}

impl Controller for G1Daemon {
    fn command(&mut self, command: Command) {
        let _ = G1Daemon::command(self, command);
    }

    fn tick(&mut self) {
        G1Daemon::tick(self);
    }

    fn take_events(&mut self) -> Vec<DaemonEvent> {
        G1Daemon::take_events(self)
    }

    fn status_line(&self) -> String {
        g1_status_line(self)
    }

    fn is_quiet(&self) -> bool {
        matches!(self.run(), G1Run::Idle | G1Run::Stopped)
    }
}

impl Controller for Ros2Daemon {
    fn command(&mut self, command: Command) {
        let _ = Ros2Daemon::command(self, command);
    }

    fn tick(&mut self) {
        Ros2Daemon::tick(self);
    }

    fn take_events(&mut self) -> Vec<DaemonEvent> {
        Ros2Daemon::take_events(self)
    }

    fn status_line(&self) -> String {
        ros2_status_line(self)
    }

    fn is_quiet(&self) -> bool {
        !self.run().is_commanding()
    }
}

pub struct Runner<C: Controller> {
    pub daemon: C,
    pub commands: Receiver<Command>,
    pub lines: SyncSender<String>,
    pub clock: Arc<dyn Clock>,
    pub client_gone: Arc<AtomicBool>,
}

impl<C: Controller> Runner<C> {
    pub fn run(mut self) -> Jitter {
        let mut jitter = Jitter::default();
        let mut next = self.clock.now_micros();

        loop {
            while let Ok(command) = self.commands.try_recv() {
                self.daemon.command(command);
            }

            self.daemon.tick();
            self.emit(jitter.ticks);
            jitter.ticks += 1;

            if self.should_exit() {
                return jitter;
            }

            next += TICK_US;
            jitter.worst_late_us = jitter.worst_late_us.max(self.clock.now_micros().saturating_sub(next));
            self.clock.wait_until(next);
        }
    }

    fn emit(&mut self, tick: u64) {
        for event in self.daemon.take_events() {
            let _ = self.lines.try_send(event_line(&event));
        }

        if tick.is_multiple_of(STATUS_EVERY_TICKS) {
            let _ = self.lines.try_send(self.daemon.status_line());
        }
    }

    fn should_exit(&self) -> bool {
        self.client_gone.load(Ordering::SeqCst) && self.daemon.is_quiet()
    }
}
