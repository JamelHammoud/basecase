use crate::caps::TICK_US;
use crate::control::{Command, Daemon, Run};
use crate::protocol::{event_line, status_line};
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

pub struct Runner {
    pub daemon: Daemon,
    pub commands: Receiver<Command>,
    pub lines: SyncSender<String>,
    pub clock: Arc<dyn Clock>,
    pub client_gone: Arc<AtomicBool>,
}

impl Runner {
    pub fn run(mut self) -> Jitter {
        let mut jitter = Jitter::default();
        let mut next = self.clock.now_micros();

        loop {
            while let Ok(command) = self.commands.try_recv() {
                let _ = self.daemon.command(command);
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
            let _ = self.lines.try_send(status_line(&self.daemon));
        }
    }

    fn should_exit(&self) -> bool {
        let quiet = matches!(self.daemon.run(), Run::Idle | Run::Stopped);

        self.client_gone.load(Ordering::SeqCst) && quiet
    }
}
