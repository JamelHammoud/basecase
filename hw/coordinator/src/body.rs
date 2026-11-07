use crate::machine::{Active, BaseState, Completion, Coordinator};
use crate::plan::{Interrupt, ABANDON};
use crate::trace::EventKind;

pub(crate) const STOP_BASE_TIMEOUT: i32 = 0;
pub(crate) const STOP_BASE_FAILED: i32 = 1;
pub(crate) const STOP_DEADLINE: i32 = 2;
pub(crate) const STOP_FAILED: i32 = 3;
pub(crate) const STOP_REQUESTED: i32 = 4;

impl Coordinator {
    pub(crate) fn step_base(&mut self) {
        if self.halted || self.base.ended {
            return;
        }

        if self.now >= u64::from(self.plan.base.timeout_ms) {
            self.end_base(STOP_BASE_TIMEOUT);

            return;
        }

        let completion = self.base.completion;

        self.base.completion = Completion::Pending;

        if matches!(completion, Completion::Failed(_)) {
            self.end_base(STOP_BASE_FAILED);

            return;
        }

        if completion == Completion::Done {
            self.on_base_done();
        }

        self.step_interrupting();
    }

    fn on_base_done(&mut self) {
        match self.base.state {
            BaseState::Running => self.start_base(),
            BaseState::Interrupting => self.base.phase_seen = true,
            BaseState::Idle => {}
        }
    }

    fn step_interrupting(&mut self) {
        if self.base.state != BaseState::Interrupting {
            return;
        }

        if self.base.phase_seen {
            self.begin_stop();

            return;
        }

        let waited = self.now.saturating_sub(self.base.since_ms);

        if waited >= u64::from(self.plan.stop_timeout_ms) {
            self.safe_stop(STOP_DEADLINE);
        }
    }

    pub(crate) fn step_base_start(&mut self) {
        let blocked = self.halted
            || self.goal_free
            || self.base.ended
            || self.base.state != BaseState::Idle
            || self.stop_overlaps(self.base.mask)
            || !self.mask_free(self.base.mask);

        if !blocked {
            self.start_base();
        }
    }

    pub(crate) fn start_base(&mut self) {
        let skill = self.plan.base.skill;
        let token = self.new_token();

        self.base.state = BaseState::Running;
        self.base.token = token;
        self.base.completion = Completion::Pending;
        self.base.phase_seen = false;
        self.occupy(self.base.mask, skill);
        self.emit_three(
            EventKind::Run,
            (i32::from(skill), token, i32::from(self.base.mask)),
        );
    }

    pub(crate) fn request_free(&mut self) {
        if self.base.state != BaseState::Running {
            return;
        }

        let interrupt = self.plan.skill(self.plan.base.skill).map(|s| s.interrupt);

        if interrupt == Some(Interrupt::Any) {
            self.begin_stop();

            return;
        }

        self.base.state = BaseState::Interrupting;
        self.base.phase_seen = false;
        self.base.since_ms = self.now;
    }

    pub(crate) fn cancel_interrupt(&mut self) {
        if self.base.state == BaseState::Interrupting {
            self.base.state = BaseState::Running;
        }
    }

    pub(crate) fn begin_stop(&mut self) {
        let skill = self.plan.base.skill;

        self.base.state = BaseState::Idle;
        self.release(self.base.mask);
        self.emit(EventKind::Release, i32::from(skill), self.base.token);
        self.stop_skill(skill);
    }

    pub(crate) fn stop_skill(&mut self, skill: u16) {
        let Some(via) = self.plan.skill(skill).map(|s| s.stop_via) else {
            return;
        };

        if via == skill {
            return;
        }

        let mask = self.plan.skill(via).map_or(0, |s| s.holds);
        let token = self.new_token();
        let now = self.now;

        self.drop_stops(mask);

        let Some(slot) = self.stops.iter_mut().find(|s| !s.active) else {
            self.safe_stop(STOP_FAILED);

            return;
        };

        slot.active = true;
        slot.token = token;
        slot.skill = via;
        slot.mask = mask;
        slot.since_ms = now;
        slot.completion = Completion::Pending;
        self.occupy(mask, via);
        self.emit_three(EventKind::Run, (i32::from(via), token, i32::from(mask)));
    }

    pub(crate) fn drop_stops(&mut self, mask: u8) {
        for i in 0..self.stops.len() {
            let Some(stop) = self.stops.get(i).copied() else {
                continue;
            };

            if stop.active && stop.mask & mask != 0 {
                self.finish_stop(i);
            }
        }
    }

    fn finish_stop(&mut self, index: usize) {
        let Some(stop) = self.stops.get_mut(index) else {
            return;
        };
        let (mask, skill, token) = (stop.mask, stop.skill, stop.token);

        stop.active = false;
        self.release(mask);
        self.emit(EventKind::Release, i32::from(skill), token);
    }

    pub(crate) fn stop_overlaps(&self, mask: u8) -> bool {
        self.stops.iter().any(|s| s.active && s.mask & mask != 0)
    }

    pub(crate) fn step_stops(&mut self) {
        for i in 0..self.stops.len() {
            if self.halted {
                return;
            }

            self.step_stop(i);
        }
    }

    fn step_stop(&mut self, index: usize) {
        let Some(stop) = self.stops.get(index).copied() else {
            return;
        };

        if !stop.active {
            return;
        }

        match stop.completion {
            Completion::Done => self.finish_stop(index),
            Completion::Failed(_) => self.safe_stop(STOP_FAILED),
            Completion::Pending => {
                let waited = self.now.saturating_sub(stop.since_ms);

                if waited >= u64::from(self.plan.stop_timeout_ms) {
                    self.safe_stop(STOP_DEADLINE);
                }
            }
        }
    }

    pub(crate) fn body_ready(&self) -> bool {
        self.base.state == BaseState::Idle && !self.stop_overlaps(self.base.mask)
    }

    fn end_base(&mut self, reason: i32) {
        self.cancel_active();
        self.reactions.iter_mut().for_each(|r| r.pending = false);
        self.base.ended = true;
        self.base.end_reason = reason;
        self.goal_free = true;
        self.waiting_body = false;
        self.emit(EventKind::BaseEnd, reason, 0);

        if self.base.state != BaseState::Idle {
            self.begin_stop();
        }

        let entry = if reason == STOP_BASE_TIMEOUT {
            self.plan.base.on_timeout
        } else {
            self.plan.base.on_fail
        };

        if entry == ABANDON {
            self.safe_stop(reason);

            return;
        }

        self.active = Active::BasePath;
        self.spawn_root(entry);
    }

    pub fn stop(&mut self) {
        if !self.halted {
            self.safe_stop(STOP_REQUESTED);
        }
    }

    pub(crate) fn safe_stop(&mut self, reason: i32) {
        self.cancel_active();
        self.halted = true;
        self.base.state = BaseState::Idle;
        self.base.ended = true;

        for i in 0..self.stops.len() {
            if let Some(stop) = self.stops.get_mut(i) {
                stop.active = false;
            }
        }

        self.holders = [crate::slots::NO_SKILL; crate::machine::RESOURCE_COUNT];
        self.emit(EventKind::SafeStop, reason, 0);

        let skill = self.plan.safe_stop;
        let mask = self.plan.skill(skill).map_or(0, |s| s.holds);
        let token = self.new_token();

        self.occupy(mask, skill);
        self.emit_three(EventKind::Run, (i32::from(skill), token, i32::from(mask)));
    }
}
