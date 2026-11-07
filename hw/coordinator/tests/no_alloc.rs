mod common;

use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};

use basecase_coordinator::{ControlReader, Coordinator, EventKind, Fact, Status};
use common::*;

struct Counting;

static ALLOCATIONS: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        ALLOCATIONS.fetch_add(1, Ordering::Relaxed);

        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static GLOBAL: Counting = Counting;

#[derive(Default)]
struct Host {
    pending: [i32; 16],
    count: usize,
    walk: i32,
    fired: usize,
}

impl Host {
    fn collect(&mut self, coordinator: &Coordinator) {
        for e in coordinator.events() {
            let token = match e.kind {
                EventKind::Run if e.a == WALK => {
                    self.walk = e.b;

                    0
                }
                EventKind::Run | EventKind::OpStart => e.b,
                EventKind::Fired => {
                    self.fired += 1;

                    0
                }
                _ => 0,
            };

            if token > 0 && self.count < self.pending.len() {
                self.pending[self.count] = token;
                self.count += 1;
            }
        }
    }

    fn answer(&mut self, coordinator: &mut Coordinator) {
        for i in 0..self.count {
            let token = self.pending[i];

            if !coordinator.answer(token, 0) {
                coordinator.complete(token, true, (0.83, 7));
            }
        }

        self.count = 0;
        coordinator.phase(self.walk);
    }
}

#[test]
fn the_tick_path_never_allocates() {
    let mut d = Driver::new();
    let board = d.coordinator.board();
    let slot = d.coordinator.slot();
    let mut reader = ControlReader::new(500, 1);
    let mut host = Host::default();
    let before = ALLOCATIONS.load(Ordering::Relaxed);

    for step in 0..4000u64 {
        let now = step * 50;
        let seen = Fact {
            num: 1.0,
            sym: -1,
            stamp_ms: now,
        };

        if step % 400 == 20 {
            board.publish(PERSON, seen);
        }

        if step % 400 == 200 {
            board.publish(OBSTACLE, seen);
        }

        host.answer(&mut d.coordinator);
        d.coordinator.tick(now);
        host.collect(&d.coordinator);
        d.coordinator.drain_json();
        reader.read(&slot, now);
    }

    assert_eq!(ALLOCATIONS.load(Ordering::Relaxed) - before, 0);
    assert!(host.fired >= 15, "only {} reactions fired", host.fired);
    assert_eq!(d.coordinator.status(), Status::Running);
}
