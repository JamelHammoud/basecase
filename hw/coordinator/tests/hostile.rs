mod common;

use basecase_coordinator::{Coordinator, Fact};
use common::PLAN;

struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);

        self.0 >> 33
    }

    fn below(&mut self, n: u64) -> u64 {
        self.next() % n.max(1)
    }
}

fn mutate_text(rng: &mut Lcg) -> String {
    let mut bytes = PLAN.as_bytes().to_vec();
    let digits = b"-0123456789";

    for _ in 0..(1 + rng.below(4)) {
        let at = rng.below(bytes.len() as u64) as usize;

        if bytes[at].is_ascii_digit() {
            bytes[at] = digits[rng.below(digits.len() as u64) as usize];
        }
    }

    String::from_utf8(bytes).unwrap()
}

fn drive(coordinator: &mut Coordinator, rng: &mut Lcg) {
    let board = coordinator.board();

    for step in 0..400u64 {
        let fact = Fact {
            num: rng.below(3) as f64 / 2.0,
            sym: rng.below(3) as i32 - 1,
            stamp_ms: step * 50,
        };

        board.publish(rng.below(5) as usize, fact);
        coordinator.tick(step * 50);

        let token = rng.below(40) as i32;

        coordinator.complete(token, rng.below(2) == 0, (0.7, 1));
        coordinator.answer(token, rng.below(4) as i32 - 1);
        coordinator.phase(token);
        coordinator.drain_json();
    }
}

#[test]
fn garbage_never_loads() {
    for bad in [
        "",
        "null",
        "[]",
        "{\"schema\":1}",
        "{\"schema\":2}",
        "<script>",
    ] {
        assert!(Coordinator::from_json(bad).is_err(), "{bad}");
    }
}

#[test]
fn backward_jumps_are_refused_so_plans_cannot_loop() {
    let looping = PLAN.replace(
        "\"next\": 1, \"onTimeout\": 3",
        "\"next\": 0, \"onTimeout\": 3",
    );

    assert!(Coordinator::from_json(&looping).is_err());
}

#[test]
fn mutated_plans_and_random_inputs_never_panic() {
    let mut rng = Lcg(7);
    let mut loaded = 0;

    for _ in 0..400 {
        let text = mutate_text(&mut rng);

        if let Ok(mut coordinator) = Coordinator::from_json(&text) {
            loaded += 1;
            drive(&mut coordinator, &mut rng);
        }
    }

    assert!(loaded > 50, "only {loaded} mutants loaded");
}
