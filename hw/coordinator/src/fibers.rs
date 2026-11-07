use crate::facts::{Fact, NO_SYMBOL};
use crate::machine::{Active, Completion, Coordinator};
use crate::plan::{Op, OpKind, Span, ABANDON, END, MAX_FIBERS};
use crate::slots::NO_SKILL;
use crate::trace::EventKind;

pub(crate) const ROOT: usize = 0;
pub(crate) const FAIL_REPORTED: i32 = 0;
pub(crate) const FAIL_BUSY: i32 = 1;
pub(crate) const FAIL_STALE: i32 = 2;
pub(crate) const FAIL_BAD_ANSWER: i32 = 3;
const NO_PARENT: i32 = -1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FiberState {
    Free,
    Enter,
    Blocked,
    Join,
    Done,
    Failed,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct Fiber {
    pub state: FiberState,
    pub pc: i32,
    pub token: i32,
    pub started_ms: u64,
    pub parent: i32,
    pub completion: Completion,
    pub num: f64,
    pub sym: i32,
    pub mask: u8,
    pub skill: u16,
}

impl Fiber {
    pub fn free() -> Self {
        Self {
            state: FiberState::Free,
            pc: END,
            token: 0,
            started_ms: 0,
            parent: NO_PARENT,
            completion: Completion::Pending,
            num: 0.0,
            sym: NO_SYMBOL,
            mask: 0,
            skill: NO_SKILL,
        }
    }

    pub fn outcome(&self) -> Option<bool> {
        match self.state {
            FiberState::Done => Some(true),
            FiberState::Failed => Some(false),
            _ => None,
        }
    }
}

impl Coordinator {
    pub(crate) fn spawn_root(&mut self, entry: i32) {
        self.clear_fibers();

        if let Some(root) = self.fibers.get_mut(ROOT) {
            root.state = FiberState::Enter;
            root.pc = entry;
        }
    }

    pub(crate) fn clear_fibers(&mut self) {
        self.fibers.iter_mut().for_each(|f| *f = Fiber::free());
    }

    pub(crate) fn cancel_active(&mut self) {
        if self.active == Active::Idle {
            return;
        }

        self.waiting_body = false;

        for i in 0..self.fibers.len() {
            self.cancel_blocked(i);
        }

        self.clear_fibers();
        self.active = Active::Idle;
    }

    fn cancel_blocked(&mut self, index: usize) {
        let Some(fiber) = self.fibers.get(index).copied() else {
            return;
        };

        if fiber.state != FiberState::Blocked {
            return;
        }

        self.emit(EventKind::OpCancel, fiber.pc, fiber.token);
        self.release_op(fiber, true);

        if let Some(f) = self.fibers.get_mut(index) {
            *f = Fiber::free();
        }
    }

    fn release_op(&mut self, fiber: Fiber, interrupted: bool) {
        self.release(fiber.mask);

        if fiber.skill == NO_SKILL {
            return;
        }

        self.emit(EventKind::Release, i32::from(fiber.skill), fiber.token);

        if interrupted {
            self.stop_skill(fiber.skill);
        }
    }

    pub(crate) fn deliver_to_fiber(
        &mut self,
        token: i32,
        completion: Completion,
        value: (f64, i32),
    ) -> bool {
        let found = self
            .fibers
            .iter_mut()
            .find(|f| f.state == FiberState::Blocked && f.token == token);

        match found {
            Some(fiber) => {
                fiber.completion = completion;
                fiber.num = value.0;
                fiber.sym = value.1;

                true
            }
            None => false,
        }
    }

    pub fn answer(&mut self, token: i32, index: i32) -> bool {
        let Some(answers) = self.ask_answers(token) else {
            return false;
        };
        let symbol = u16::try_from(index)
            .ok()
            .filter(|i| *i < answers.len)
            .and_then(|i| self.plan.flat_at(answers, i));

        match symbol {
            Some(sym) => self.deliver(token, Completion::Done, (f64::from(index), sym)),
            None => self.deliver(token, Completion::Failed(FAIL_BAD_ANSWER), (0.0, NO_SYMBOL)),
        }
    }

    fn ask_answers(&self, token: i32) -> Option<Span> {
        let fiber = self
            .fibers
            .iter()
            .find(|f| f.state == FiberState::Blocked && f.token == token)?;

        match self.plan.op(fiber.pc)?.kind {
            OpKind::Ask { answers, .. } => Some(answers),
            _ => None,
        }
    }

    pub(crate) fn step_fibers(&mut self) {
        if self.halted {
            return;
        }

        if self.waiting_body && self.body_ready() {
            self.waiting_body = false;

            let Active::Reaction(active) = self.active else {
                return;
            };
            let entry = self
                .plan
                .reactions
                .get(usize::from(active))
                .map_or(END, |r| r.entry);

            self.spawn_root(entry);
        }

        for _ in 0..=MAX_FIBERS {
            if !self.step_fibers_once() {
                return;
            }
        }
    }

    fn step_fibers_once(&mut self) -> bool {
        let mut progressed = false;

        for i in 0..self.fibers.len() {
            progressed |= self.step_fiber(i);

            if self.halted {
                return false;
            }
        }

        progressed
    }

    fn step_fiber(&mut self, index: usize) -> bool {
        let Some(state) = self.fibers.get(index).map(|f| f.state) else {
            return false;
        };

        match state {
            FiberState::Enter => {
                self.enter(index);

                true
            }
            FiberState::Blocked => self.check_blocked(index),
            FiberState::Join => self.check_join(index),
            _ => false,
        }
    }

    pub(crate) fn set_state(&mut self, index: usize, state: FiberState) {
        if let Some(f) = self.fibers.get_mut(index) {
            f.state = state;
        }
    }

    fn jump(&mut self, index: usize, pc: i32) {
        if let Some(f) = self.fibers.get_mut(index) {
            f.pc = pc;
            f.state = FiberState::Enter;
            f.completion = Completion::Pending;
            f.mask = 0;
            f.skill = NO_SKILL;
            f.token = 0;
        }
    }

    fn enter(&mut self, index: usize) {
        for _ in 0..=self.plan.ops.len() {
            let Some(pc) = self.fibers.get(index).map(|f| f.pc) else {
                return;
            };

            match pc {
                END => return self.set_state(index, FiberState::Done),
                ABANDON => return self.set_state(index, FiberState::Failed),
                _ => {}
            }

            let Some(op) = self.plan.op(pc) else {
                return self.set_state(index, FiberState::Failed);
            };

            let Some(target) = self.start_op(index, pc, op) else {
                return;
            };

            self.jump(index, target);
        }

        self.set_state(index, FiberState::Failed);
    }

    fn check_blocked(&mut self, index: usize) -> bool {
        let Some(fiber) = self.fibers.get(index).copied() else {
            return false;
        };
        let Some(op) = self.plan.op(fiber.pc) else {
            self.set_state(index, FiberState::Failed);

            return true;
        };

        match fiber.completion {
            Completion::Done => self.finish_op(index, fiber, op),
            Completion::Failed(why) => self.fail_op(index, fiber, (op, why)),
            Completion::Pending => return self.check_waiting(index, fiber, op),
        }

        true
    }

    fn check_waiting(&mut self, index: usize, fiber: Fiber, op: Op) -> bool {
        if self.wait_is_over(fiber, op) {
            self.finish_op(index, fiber, op);

            return true;
        }

        if self.now.saturating_sub(fiber.started_ms) < u64::from(op.timeout_ms) {
            return false;
        }

        self.emit(EventKind::OpTimeout, fiber.pc, fiber.token);
        self.release_op(fiber, true);
        self.jump(index, op.on_timeout);

        true
    }

    fn wait_is_over(&self, fiber: Fiber, op: Op) -> bool {
        let OpKind::Wait { until, ms } = op.kind else {
            return false;
        };

        if until >= 0 {
            return self.cond_true(until as u16);
        }

        self.now.saturating_sub(fiber.started_ms) >= u64::from(ms)
    }

    fn finish_op(&mut self, index: usize, fiber: Fiber, op: Op) {
        match op.kind {
            OpKind::Infer { fact } | OpKind::Ask { fact, .. } => {
                self.facts.write(
                    usize::from(fact),
                    Fact {
                        num: fiber.num,
                        sym: fiber.sym,
                        stamp_ms: self.now,
                    },
                );
            }
            _ => {}
        }

        self.emit(EventKind::OpDone, fiber.pc, fiber.token);
        self.release_op(fiber, false);
        self.jump(index, op.next);
    }

    fn fail_op(&mut self, index: usize, fiber: Fiber, failure: (Op, i32)) {
        let (op, why) = failure;

        self.emit_three(EventKind::OpFail, (fiber.pc, why, fiber.token));
        self.release_op(fiber, true);
        self.jump(index, op.on_fail);
    }

    fn check_join(&mut self, index: usize) -> bool {
        let Some(fiber) = self.fibers.get(index).copied() else {
            return false;
        };
        let Some(OpKind::Together { any, .. }) = self.plan.op(fiber.pc).map(|o| o.kind) else {
            return false;
        };
        let (mut running, mut done, mut failed) = (0, 0, 0);

        for child in self.fibers.iter().filter(|f| f.parent == index as i32) {
            match child.state {
                FiberState::Done => done += 1,
                FiberState::Failed => failed += 1,
                FiberState::Free => {}
                _ => running += 1,
            }
        }

        let finished = running == 0 || (any && done > 0);

        if !finished {
            return false;
        }

        let succeeded = if any { done > 0 } else { failed == 0 };

        self.free_children(index);

        let next = self.plan.op(fiber.pc).map_or(ABANDON, |o| o.next);

        self.jump(index, if succeeded { next } else { ABANDON });

        true
    }

    fn free_children(&mut self, parent: usize) {
        for i in 0..self.fibers.len() {
            let is_child = self
                .fibers
                .get(i)
                .is_some_and(|f| f.parent == parent as i32 && f.state != FiberState::Free);

            if is_child {
                self.free_children(i);
                self.cancel_blocked(i);

                if let Some(f) = self.fibers.get_mut(i) {
                    *f = Fiber::free();
                }
            }
        }
    }
}
