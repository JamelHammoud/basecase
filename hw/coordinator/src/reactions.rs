use crate::fibers::ROOT;
use crate::machine::{Active, Coordinator};
use crate::plan::{Reaction, Retrigger};
use crate::trace::EventKind;

pub(crate) const DROPPED_COOLDOWN: i32 = 0;
pub(crate) const DROPPED_RETRIGGER: i32 = 1;
pub(crate) const DROPPED_BUSY: i32 = 2;
pub(crate) const ENDED_DONE: i32 = 0;
pub(crate) const ENDED_ABANDONED: i32 = 1;

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct ReactionState {
    pub was_true: bool,
    pub fired_at: Option<u64>,
    pub pending: bool,
}

impl Coordinator {
    pub(crate) fn step_reactions(&mut self) {
        if self.halted || self.active == Active::BasePath || self.base.ended {
            return;
        }

        for r in 0..self.reactions.len() {
            self.check_edge(r);
        }

        self.start_pending();
    }

    fn check_edge(&mut self, index: usize) {
        let (Some(reaction), Some(state)) = (
            self.plan.reactions.get(index).copied(),
            self.reactions.get(index).copied(),
        ) else {
            return;
        };
        let now_true = self.cond_true(reaction.when);

        if let Some(state) = self.reactions.get_mut(index) {
            state.was_true = now_true;
        }

        if now_true && !state.was_true {
            self.on_edge(index, reaction);
        }
    }

    fn in_cooldown(&self, index: usize, reaction: Reaction) -> bool {
        let Some(fired_at) = self.reactions.get(index).and_then(|r| r.fired_at) else {
            return false;
        };

        self.now.saturating_sub(fired_at) < u64::from(reaction.cooldown_ms)
    }

    fn on_edge(&mut self, index: usize, reaction: Reaction) {
        let label = index as i32;

        if self.in_cooldown(index, reaction) {
            self.emit(EventKind::Dropped, label, DROPPED_COOLDOWN);

            return;
        }

        match self.active {
            Active::Idle => self.start_reaction(index, reaction),
            Active::BasePath => self.emit(EventKind::Dropped, label, DROPPED_BUSY),
            Active::Reaction(active) => {
                self.on_edge_while_active(index, reaction, usize::from(active));
            }
        }
    }

    fn on_edge_while_active(&mut self, index: usize, reaction: Reaction, active: usize) {
        let label = index as i32;

        if index == active {
            self.on_retrigger(index, reaction);
        } else if index < active {
            self.preempt(index, reaction, active);
        } else if reaction.retrigger == Retrigger::Queue {
            self.set_pending(index);
            self.emit(EventKind::Queued, label, 0);
        } else {
            self.emit(EventKind::Dropped, label, DROPPED_BUSY);
        }
    }

    fn on_retrigger(&mut self, index: usize, reaction: Reaction) {
        let label = index as i32;

        match reaction.retrigger {
            Retrigger::Ignore => self.emit(EventKind::Dropped, label, DROPPED_RETRIGGER),
            Retrigger::Queue => {
                self.set_pending(index);
                self.emit(EventKind::Queued, label, 0);
            }
            Retrigger::Restart => {
                self.emit(EventKind::Restarted, label, 0);
                self.cancel_active();
                self.start_reaction(index, reaction);
            }
        }
    }

    fn preempt(&mut self, index: usize, reaction: Reaction, active: usize) {
        self.emit(EventKind::Preempted, active as i32, index as i32);

        if self
            .plan
            .reactions
            .get(active)
            .is_some_and(|r| r.retrigger == Retrigger::Queue)
        {
            self.set_pending(active);
        }

        self.cancel_active();
        self.start_reaction(index, reaction);
    }

    fn set_pending(&mut self, index: usize) {
        if let Some(state) = self.reactions.get_mut(index) {
            state.pending = true;
        }
    }

    fn start_pending(&mut self) {
        if self.active != Active::Idle {
            return;
        }

        for index in 0..self.reactions.len() {
            let (Some(reaction), Some(state)) = (
                self.plan.reactions.get(index).copied(),
                self.reactions.get(index).copied(),
            ) else {
                continue;
            };

            if state.pending && !self.in_cooldown(index, reaction) {
                self.start_reaction(index, reaction);

                return;
            }
        }
    }

    fn start_reaction(&mut self, index: usize, reaction: Reaction) {
        if let Some(state) = self.reactions.get_mut(index) {
            state.fired_at = Some(self.now);
            state.pending = false;
        }

        self.active = Active::Reaction(index as u16);
        self.emit_leaves(reaction.when);
        self.emit(EventKind::Fired, index as i32, 0);

        if reaction.stop_first {
            self.goal_free = true;
            self.waiting_body = true;
            self.request_free();

            return;
        }

        self.goal_free = false;
        self.waiting_body = false;
        self.cancel_interrupt();
        self.spawn_root(reaction.entry);
    }

    pub(crate) fn step_reaction_end(&mut self) {
        if self.halted || self.active == Active::Idle || self.waiting_body {
            return;
        }

        let Some(ended) = self.fibers.get(ROOT).and_then(|root| root.outcome()) else {
            return;
        };

        match self.active {
            Active::Reaction(index) => self.finish_reaction(index, ended),
            Active::BasePath => {
                self.clear_fibers();
                self.active = Active::Idle;
                self.safe_stop(self.base.end_reason);
            }
            Active::Idle => {}
        }
    }

    fn finish_reaction(&mut self, index: u16, ended: bool) {
        let how = if ended { ENDED_DONE } else { ENDED_ABANDONED };

        self.emit(EventKind::Ended, i32::from(index), how);
        self.clear_fibers();
        self.active = Active::Idle;
        self.goal_free = false;
    }
}
