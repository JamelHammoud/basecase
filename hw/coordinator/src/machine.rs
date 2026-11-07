use std::sync::Arc;

use crate::cond::{eval, leaf_fact, leaf_outcome, Tri};
use crate::facts::{FactBoard, FactStore};
use crate::fibers::Fiber;
use crate::plan::{LoadError, Plan, MAX_FIBERS};
use crate::plan_read::read_plan;
use crate::reactions::ReactionState;
use crate::slots::{Intent, IntentSlot, BODY, HEAD, NO_SKILL};
use crate::trace::{Event, EventKind, Trace};

pub const SAY_HOLDER: u16 = 0xfffe;
pub const RESOURCE_COUNT: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Running,
    Stopped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Active {
    Idle,
    Reaction(u16),
    BasePath,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Completion {
    Pending,
    Done,
    Failed(i32),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BaseState {
    Idle,
    Running,
    Interrupting,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct BaseRun {
    pub state: BaseState,
    pub token: i32,
    pub completion: Completion,
    pub phase_seen: bool,
    pub since_ms: u64,
    pub mask: u8,
    pub ended: bool,
    pub end_reason: i32,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct StopRun {
    pub active: bool,
    pub token: i32,
    pub skill: u16,
    pub mask: u8,
    pub since_ms: u64,
    pub completion: Completion,
}

#[derive(Debug)]
pub struct Coordinator {
    pub(crate) plan: Plan,
    pub(crate) facts: FactStore,
    pub(crate) fibers: Vec<Fiber>,
    pub(crate) reactions: Vec<ReactionState>,
    pub(crate) active: Active,
    pub(crate) waiting_body: bool,
    pub(crate) goal_free: bool,
    pub(crate) base: BaseRun,
    pub(crate) stops: [StopRun; RESOURCE_COUNT],
    pub(crate) holders: [u16; RESOURCE_COUNT],
    pub(crate) now: u64,
    pub(crate) next_token: i32,
    pub(crate) halted: bool,
    pub(crate) trace: Trace,
    slot: Arc<IntentSlot>,
    seq: u32,
    started: bool,
    watcher_mask: u32,
}

impl Coordinator {
    pub fn from_json(text: &str) -> Result<Self, LoadError> {
        Ok(Self::new(read_plan(text)?))
    }

    pub fn new(plan: Plan) -> Self {
        let facts = FactStore::new(&plan.fact_ages);
        let base_mask = plan.skill(plan.base.skill).map_or(0, |s| s.holds);
        let reactions = vec![ReactionState::default(); plan.reactions.len()];
        let empty_stop = StopRun {
            active: false,
            token: 0,
            skill: NO_SKILL,
            mask: 0,
            since_ms: 0,
            completion: Completion::Pending,
        };

        Self {
            facts,
            fibers: vec![Fiber::free(); MAX_FIBERS],
            reactions,
            active: Active::Idle,
            waiting_body: false,
            goal_free: false,
            base: BaseRun {
                state: BaseState::Idle,
                token: 0,
                completion: Completion::Pending,
                phase_seen: false,
                since_ms: 0,
                mask: base_mask,
                ended: false,
                end_reason: 0,
            },
            stops: [empty_stop; RESOURCE_COUNT],
            holders: [NO_SKILL; RESOURCE_COUNT],
            now: 0,
            next_token: 1,
            halted: false,
            trace: Trace::new(),
            slot: Arc::new(IntentSlot::new()),
            seq: 0,
            started: false,
            watcher_mask: 0,
            plan,
        }
    }

    pub fn slot(&self) -> Arc<IntentSlot> {
        Arc::clone(&self.slot)
    }

    pub fn slot_ref(&self) -> &IntentSlot {
        &self.slot
    }

    pub fn board(&self) -> Arc<FactBoard> {
        self.facts.board()
    }

    pub fn plan(&self) -> &Plan {
        &self.plan
    }

    pub fn status(&self) -> Status {
        if self.halted {
            Status::Stopped
        } else {
            Status::Running
        }
    }

    pub fn watcher_mask(&self) -> u32 {
        self.watcher_mask
    }

    pub fn events(&self) -> &[Event] {
        self.trace.events()
    }

    pub fn clear_events(&mut self) {
        self.trace.clear();
    }

    pub fn drain_json(&mut self) -> usize {
        self.trace.drain_json()
    }

    pub fn json_ptr(&self) -> *const u8 {
        self.trace.json_ptr()
    }

    pub fn json_bytes(&self, length: usize) -> &[u8] {
        self.trace.json_bytes(length)
    }

    pub fn tick(&mut self, now_ms: u64) {
        self.now = self.now.max(now_ms);
        self.seq = self.seq.wrapping_add(1);

        if !self.halted {
            self.advance();
        }

        self.publish();
    }

    fn advance(&mut self) {
        if !self.started {
            self.started = true;
            self.emit(EventKind::Started, 0, 0);
        }

        self.facts.sync();
        self.step_freshness();
        self.step_watchers();
        self.step_base();
        self.step_stops();
        self.step_reactions();
        self.step_fibers();
        self.step_reaction_end();
        self.step_base_start();
    }

    fn publish(&self) {
        self.slot.write(Intent {
            seq: self.seq,
            body: self.holder_of(BODY),
            head: self.holder_of(HEAD),
        });
    }

    fn holder_of(&self, resource: u8) -> u16 {
        let index = resource.trailing_zeros() as usize;

        self.holders.get(index).copied().unwrap_or(NO_SKILL)
    }

    fn step_freshness(&mut self) {
        let mut from = 0;

        while let Some((fact, fresh)) = self.facts.next_change(from, self.now) {
            let kind = if fresh {
                EventKind::Fresh
            } else {
                EventKind::Stale
            };

            self.emit(kind, fact as i32, 0);
            from = fact + 1;
        }
    }

    fn step_watchers(&mut self) {
        for i in 0..self.plan.watcher_whens.len() {
            let when = self.plan.watcher_whens.get(i).copied().unwrap_or(-1);
            let enabled = when < 0 || self.cond_true(when as u16);
            let bit = 1u32 << i;
            let was = self.watcher_mask & bit != 0;

            if enabled != was {
                self.watcher_mask ^= bit;
                self.emit(EventKind::Watcher, i as i32, i32::from(enabled));
            }
        }
    }

    pub(crate) fn cond_true(&self, cond: u16) -> bool {
        eval(self.plan.cond_code(cond), &self.facts, self.now) == Tri::True
    }

    pub(crate) fn emit(&mut self, kind: EventKind, a: i32, b: i32) {
        self.emit_full(Event {
            t: self.now,
            kind,
            a,
            b,
            c: 0,
            v: 0.0,
        });
    }

    pub(crate) fn emit_three(&mut self, kind: EventKind, abc: (i32, i32, i32)) {
        let (a, b, c) = abc;

        self.emit_full(Event {
            t: self.now,
            kind,
            a,
            b,
            c,
            v: 0.0,
        });
    }

    pub(crate) fn emit_full(&mut self, event: Event) {
        self.trace.push(event);
    }

    pub(crate) fn emit_leaves(&mut self, cond: u16) {
        let count = self.plan.cond_code(cond).len();

        for k in 0..count {
            let Some(instr) = self.plan.cond_code(cond).get(k).copied() else {
                continue;
            };
            let Some(fact) = leaf_fact(&instr) else {
                continue;
            };
            let view = self.facts.view(usize::from(fact), self.now);
            let outcome = leaf_outcome(&instr, &self.facts, self.now);

            self.emit_full(Event {
                t: self.now,
                kind: EventKind::Leaf,
                a: i32::from(fact),
                b: outcome.code(),
                c: view.sym,
                v: view.num,
            });
        }
    }

    pub(crate) fn new_token(&mut self) -> i32 {
        let token = self.next_token;

        self.next_token = self.next_token.wrapping_add(1).max(1);

        token
    }

    pub(crate) fn occupy(&mut self, mask: u8, who: u16) {
        for (i, holder) in self.holders.iter_mut().enumerate() {
            if mask & (1 << i) != 0 {
                *holder = who;
            }
        }
    }

    pub(crate) fn release(&mut self, mask: u8) {
        self.occupy(mask, NO_SKILL);
    }

    pub(crate) fn mask_free(&self, mask: u8) -> bool {
        self.holders
            .iter()
            .enumerate()
            .all(|(i, holder)| mask & (1 << i) == 0 || *holder == NO_SKILL)
    }

    pub fn complete(&mut self, token: i32, ok: bool, value: (f64, i32)) -> bool {
        let completion = if ok {
            Completion::Done
        } else {
            Completion::Failed(crate::fibers::FAIL_REPORTED)
        };

        self.deliver(token, completion, value)
    }

    pub(crate) fn deliver(
        &mut self,
        token: i32,
        completion: Completion,
        value: (f64, i32),
    ) -> bool {
        if self.halted || token <= 0 {
            return false;
        }

        if self.base.token == token && self.base.state != BaseState::Idle {
            self.base.completion = completion;

            return true;
        }

        if let Some(stop) = self.stops.iter_mut().find(|s| s.active && s.token == token) {
            stop.completion = completion;

            return true;
        }

        self.deliver_to_fiber(token, completion, value)
    }

    pub fn phase(&mut self, token: i32) -> bool {
        if self.base.token == token && self.base.state == BaseState::Interrupting {
            self.base.phase_seen = true;

            return true;
        }

        false
    }
}
