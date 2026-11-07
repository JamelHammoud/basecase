use crate::fibers::{FiberState, FAIL_BUSY, FAIL_STALE};
use crate::machine::{Completion, Coordinator, SAY_HOLDER};
use crate::plan::{Op, OpKind, Span};
use crate::slots::VOICE;
use crate::trace::EventKind;

impl Coordinator {
    pub(crate) fn start_op(&mut self, index: usize, pc: i32, op: Op) -> Option<i32> {
        match op.kind {
            OpKind::If {
                test,
                then,
                otherwise,
            } => Some(self.branch(pc, test, (then, otherwise))),
            OpKind::Together { branches, .. } => {
                self.spawn_branches(index, branches);

                None
            }
            OpKind::Do { skill, holds } => self.start_do(index, (pc, op), (skill, holds)),
            OpKind::Say { text, needs } => self.start_say(index, (pc, op), (text, needs)),
            OpKind::Infer { fact } | OpKind::Ask { fact, .. } => {
                self.facts.clear(usize::from(fact));
                self.block_on(index, pc, 0);

                None
            }
            OpKind::Wait { .. } => {
                self.block_on(index, pc, 0);

                None
            }
        }
    }

    fn branch(&mut self, pc: i32, test: u16, targets: (i32, i32)) -> i32 {
        let taken = self.cond_true(test);

        self.emit_leaves(test);
        self.emit(EventKind::Branch, pc, i32::from(taken));

        if taken {
            targets.0
        } else {
            targets.1
        }
    }

    fn block_on(&mut self, index: usize, pc: i32, c: i32) {
        let token = self.new_token();
        let now = self.now;

        if let Some(f) = self.fibers.get_mut(index) {
            f.state = FiberState::Blocked;
            f.token = token;
            f.started_ms = now;
            f.completion = Completion::Pending;
        }

        self.emit_three(EventKind::OpStart, (pc, token, c));
    }

    fn start_do(&mut self, index: usize, at: (i32, Op), run: (u16, u8)) -> Option<i32> {
        let (pc, op) = at;
        let (skill, holds) = run;

        self.drop_stops(holds);

        if !self.mask_free(holds) {
            self.emit_three(EventKind::OpFail, (pc, FAIL_BUSY, 0));

            return Some(op.on_fail);
        }

        self.block_on(index, pc, 0);
        self.occupy(holds, skill);

        if let Some(f) = self.fibers.get_mut(index) {
            f.mask = holds;
            f.skill = skill;
        }

        let token = self.fibers.get(index).map_or(0, |f| f.token);

        self.emit_three(EventKind::Run, (i32::from(skill), token, i32::from(holds)));

        None
    }

    fn start_say(&mut self, index: usize, at: (i32, Op), say: (i32, Span)) -> Option<i32> {
        let (pc, op) = at;
        let (text, needs) = say;

        if !self.mask_free(VOICE) {
            self.emit_three(EventKind::OpFail, (pc, FAIL_BUSY, 0));

            return Some(op.on_fail);
        }

        if !self.needs_fresh(needs) {
            self.emit_three(EventKind::OpFail, (pc, FAIL_STALE, 0));

            return Some(op.on_fail);
        }

        self.block_on(index, pc, text);
        self.occupy(VOICE, SAY_HOLDER);

        if let Some(f) = self.fibers.get_mut(index) {
            f.mask = VOICE;
        }

        None
    }

    fn needs_fresh(&self, needs: Span) -> bool {
        (0..needs.len).all(|i| {
            self.plan
                .flat_at(needs, i)
                .and_then(|fact| usize::try_from(fact).ok())
                .is_some_and(|fact| self.facts.view(fact, self.now).fresh)
        })
    }

    fn spawn_branches(&mut self, index: usize, branches: Span) {
        self.set_state(index, FiberState::Join);

        for b in 0..branches.len {
            let Some(pc) = self.plan.flat_at(branches, b) else {
                continue;
            };

            self.spawn_child(index, pc);
        }
    }

    fn spawn_child(&mut self, parent: usize, pc: i32) {
        let Some(free) = self.fibers.iter_mut().find(|f| f.state == FiberState::Free) else {
            self.set_state(parent, FiberState::Failed);

            return;
        };

        free.state = FiberState::Enter;
        free.pc = pc;
        free.parent = parent as i32;
    }
}
