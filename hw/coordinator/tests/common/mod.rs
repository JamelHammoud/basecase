#![allow(dead_code)]

use basecase_coordinator::{Coordinator, Event, EventKind, Fact};

pub const PERSON: usize = 0;
pub const RECOGNIZE: usize = 1;
pub const OBSTACLE: usize = 2;
pub const WALK: i32 = 0;
pub const SETTLE: i32 = 1;
pub const TURN: i32 = 2;

pub const PLAN: &str = include_str!("../fixtures/plan.json");

pub struct Driver {
    pub coordinator: Coordinator,
    pub now: u64,
    pub log: Vec<Event>,
}

impl Driver {
    pub fn new() -> Self {
        Self::from(PLAN)
    }

    pub fn from(plan: &str) -> Self {
        Self {
            coordinator: Coordinator::from_json(plan).unwrap(),
            now: 0,
            log: Vec::new(),
        }
    }

    pub fn tick(&mut self) -> Vec<Event> {
        self.coordinator.tick(self.now);

        let events = self.coordinator.events().to_vec();

        self.coordinator.clear_events();
        self.log.extend(events.iter().copied());
        self.now += 50;

        events
    }

    pub fn run_until(&mut self, until_ms: u64) -> Vec<Event> {
        let mut all = Vec::new();

        while self.now <= until_ms {
            all.extend(self.tick());
        }

        all
    }

    pub fn publish(&self, fact: usize, num: f64) {
        self.coordinator.board().publish(
            fact,
            Fact {
                num,
                sym: -1,
                stamp_ms: self.now,
            },
        );
    }

    pub fn see(&self, fact: usize) {
        self.publish(fact, 1.0);
    }

    pub fn find(&self, kind: EventKind, a: i32) -> Option<Event> {
        self.log
            .iter()
            .copied()
            .find(|e| e.kind == kind && e.a == a)
    }

    pub fn last(&self, kind: EventKind) -> Option<Event> {
        self.log.iter().rev().copied().find(|e| e.kind == kind)
    }

    pub fn token_of(&self, pc: i32) -> i32 {
        self.log
            .iter()
            .rev()
            .find(|e| e.kind == EventKind::OpStart && e.a == pc)
            .map(|e| e.b)
            .unwrap()
    }

    pub fn run_token(&self, skill: i32) -> i32 {
        self.log
            .iter()
            .rev()
            .find(|e| e.kind == EventKind::Run && e.a == skill)
            .map(|e| e.b)
            .unwrap()
    }

    pub fn body(&self) -> u16 {
        self.coordinator.slot().read().body
    }

    pub fn head(&self) -> u16 {
        self.coordinator.slot().read().head
    }
}
