use crate::plan::PlanInfo;
use crate::timing::sleep_until;
use basecase_coordinator::{Coordinator, Event, EventKind};
use std::collections::HashSet;
use std::time::{Duration, Instant};

const TICK_MS: u64 = 50;
const PHASE_MS: u64 = 500;
const SKILL_MS: u64 = 1000;
const INFER_MS: u64 = 200;
const SAY_MS: u64 = 900;
const ASK_MS: u64 = 1500;
const KNOWN_SCORE: f64 = 0.83;

#[derive(Debug, Clone, Copy)]
enum Action {
    Complete(f64),
    Answer,
    Phase,
}

#[derive(Debug, Clone, Copy)]
struct Pending {
    due_ms: u64,
    token: i32,
    action: Action,
}

#[derive(Debug, Default, Clone)]
pub struct HostReport {
    pub ticks: u64,
    pub hung_started_ms: Option<u64>,
    pub answered: bool,
}

pub struct Host<'a> {
    coordinator: Coordinator,
    info: &'a PlanInfo,
    hang: Option<String>,
    hang_ms: u64,
    pending: Vec<Pending>,
    do_tokens: HashSet<i32>,
    cancelled: HashSet<i32>,
    hung_token: Option<i32>,
    report: HostReport,
}

impl<'a> Host<'a> {
    pub fn new(coordinator: Coordinator, info: &'a PlanInfo, hang: (Option<String>, u64)) -> Self {
        Self {
            coordinator,
            info,
            hang: hang.0,
            hang_ms: hang.1 * 1000,
            pending: Vec::new(),
            do_tokens: HashSet::new(),
            cancelled: HashSet::new(),
            hung_token: None,
            report: HostReport::default(),
        }
    }

    fn after(&mut self, now: u64, delay: u64, token: i32, action: Action) {
        self.pending.push(Pending {
            due_ms: now + delay,
            token,
            action,
        });
    }

    fn deliver(&mut self, now: u64) {
        let (due, later): (Vec<Pending>, Vec<Pending>) = self.pending.drain(..).partition(|p| p.due_ms <= now);

        self.pending = later;

        for p in due {
            if !self.cancelled.contains(&p.token) {
                self.act(p, now);
            }
        }
    }

    fn act(&mut self, p: Pending, now: u64) {
        match p.action {
            Action::Complete(num) => {
                self.coordinator.complete(p.token, true, (num, -1));
            }
            Action::Answer => {
                let accepted = self.coordinator.answer(p.token, 0);

                self.report.answered |= accepted && Some(p.token) == self.hung_token;
            }
            Action::Phase => {
                self.coordinator.phase(p.token);
                self.after(now, PHASE_MS, p.token, Action::Phase);
            }
        }
    }

    fn on_op_start(&mut self, event: &Event, now: u64) {
        let Some(op) = usize::try_from(event.a).ok().and_then(|pc| self.info.ops.get(pc)) else {
            return;
        };
        let token = event.b;

        match op.kind.as_str() {
            "do" => {
                self.do_tokens.insert(token);
            }
            "say" => self.after(now, SAY_MS, token, Action::Complete(0.0)),
            "infer" => self.after(now, INFER_MS, token, Action::Complete(KNOWN_SCORE)),
            "ask" if self.hang.as_deref() == Some(op.node.as_str()) => {
                self.hung_token = Some(token);
                self.report.hung_started_ms.get_or_insert(now);
                self.after(now, self.hang_ms, token, Action::Answer);
            }
            "ask" => self.after(now, ASK_MS, token, Action::Answer),
            _ => {}
        }
    }

    fn on_event(&mut self, event: &Event, now: u64) {
        match event.kind {
            EventKind::OpStart => self.on_op_start(event, now),
            EventKind::Run if self.do_tokens.contains(&event.b) => {
                self.after(now, SKILL_MS, event.b, Action::Complete(0.0));
            }
            EventKind::Run => self.after(now, PHASE_MS, event.b, Action::Phase),
            EventKind::Release | EventKind::OpCancel => {
                self.cancelled.insert(event.b);
            }
            _ => {}
        }
    }

    pub fn tick(&mut self, now: u64) {
        self.deliver(now);
        self.coordinator.tick(now);

        let events = self.coordinator.events().to_vec();

        self.coordinator.clear_events();

        for event in &events {
            self.on_event(event, now);
        }

        self.report.ticks += 1;
    }

    pub fn run(mut self, start: Instant, seconds: u64) -> HostReport {
        let total = seconds * 1000 / TICK_MS;

        for k in 0..total {
            sleep_until(start + Duration::from_millis(k * TICK_MS));
            self.tick(k * TICK_MS);
        }

        self.report
    }
}
