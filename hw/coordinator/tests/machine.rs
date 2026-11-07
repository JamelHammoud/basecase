mod common;

use basecase_coordinator::{EventKind, Status};
use common::*;

fn greet_until_branch(d: &mut Driver, score: f64) {
    d.run_until(1000);
    d.see(PERSON);
    d.tick();

    let token = d.token_of(0);

    d.coordinator.complete(token, true, (score, 7));
    d.tick();
}

#[test]
fn walks_from_the_first_tick() {
    let mut d = Driver::new();

    d.tick();

    assert_eq!(d.find(EventKind::Run, WALK).map(|e| e.c), Some(1));
    assert_eq!(i32::from(d.body()), WALK);
}

#[test]
fn greets_a_known_face_by_name_while_walking() {
    let mut d = Driver::new();

    greet_until_branch(&mut d, 0.83);

    assert!(d.find(EventKind::Fired, 1).is_some());
    assert_eq!(d.last(EventKind::Branch).map(|e| e.b), Some(1));
    assert_eq!(d.last(EventKind::OpStart).map(|e| (e.a, e.c)), Some((2, 0)));
    assert_eq!(i32::from(d.body()), WALK);
}

#[test]
fn greets_a_stranger_without_a_name() {
    let mut d = Driver::new();

    greet_until_branch(&mut d, 0.31);

    assert_eq!(d.last(EventKind::Branch).map(|e| e.b), Some(0));
    assert_eq!(d.last(EventKind::OpStart).map(|e| (e.a, e.c)), Some((3, 1)));
}

#[test]
fn a_recognizer_that_never_answers_times_out_into_the_stranger_path() {
    let mut d = Driver::new();

    d.run_until(1000);
    d.see(PERSON);
    d.run_until(4200);

    let timeout = d.find(EventKind::OpTimeout, 0).unwrap();

    assert_eq!(timeout.t, 4050);
    assert_eq!(d.last(EventKind::OpStart).map(|e| e.a), Some(3));
}

#[test]
fn a_late_answer_after_a_timeout_is_ignored() {
    let mut d = Driver::new();

    d.run_until(1000);
    d.see(PERSON);
    d.tick();

    let token = d.token_of(0);

    d.run_until(4200);

    assert!(!d.coordinator.complete(token, true, (0.9, 7)));
}

#[test]
fn stop_first_waits_for_a_phase_then_settles_before_turning() {
    let mut d = Driver::new();

    d.run_until(1000);
    d.see(OBSTACLE);
    d.tick();

    assert_eq!(i32::from(d.body()), WALK);

    let walk = d.run_token(WALK);

    assert!(d.coordinator.phase(walk));
    d.tick();

    assert_eq!(i32::from(d.body()), SETTLE);

    d.coordinator.complete(d.run_token(SETTLE), true, (0.0, -1));
    d.tick();

    assert_eq!(i32::from(d.body()), TURN);

    d.coordinator.complete(d.run_token(TURN), true, (0.0, -1));
    d.tick();

    assert_eq!(d.find(EventKind::Ended, 0).map(|e| e.b), Some(0));
    assert_eq!(i32::from(d.body()), WALK);
}

#[test]
fn a_skill_that_never_reaches_a_phase_ends_in_a_safe_stop() {
    let mut d = Driver::new();

    d.run_until(1000);
    d.see(OBSTACLE);
    d.run_until(7000);

    assert_eq!(d.find(EventKind::SafeStop, 2).map(|e| e.t), Some(6050));
    assert_eq!(i32::from(d.body()), SETTLE);
    assert_eq!(d.coordinator.status(), Status::Stopped);

    let seq = d.coordinator.slot().read().seq;

    d.tick();

    assert_eq!(d.coordinator.slot().read().seq, seq + 1);
}

#[test]
fn an_obstacle_preempts_a_greeting() {
    let mut d = Driver::new();

    d.run_until(1000);
    d.see(PERSON);
    d.tick();
    d.see(OBSTACLE);
    d.tick();

    assert_eq!(d.find(EventKind::Preempted, 1).map(|e| e.b), Some(0));
    assert_eq!(d.find(EventKind::OpCancel, 0).map(|e| e.a), Some(0));
}

#[test]
fn a_second_sighting_inside_the_cooldown_is_dropped() {
    let mut d = Driver::new();

    d.run_until(1000);
    d.see(PERSON);
    d.run_until(2500);
    d.run_until(5000);
    d.see(PERSON);
    d.tick();

    assert_eq!(d.find(EventKind::Dropped, 1).map(|e| e.b), Some(0));
}

#[test]
fn a_watched_fact_goes_stale_when_its_watcher_stops() {
    let mut d = Driver::new();

    d.run_until(1000);
    d.see(PERSON);
    d.run_until(2000);

    assert_eq!(d.find(EventKind::Fresh, 0).map(|e| e.t), Some(1050));
    assert_eq!(d.find(EventKind::Stale, 0).map(|e| e.t), Some(1600));
}

#[test]
fn an_answer_outside_the_list_fails_the_ask() {
    let mut d = Driver::new();

    greet_until_branch(&mut d, 0.83);
    d.coordinator.complete(d.token_of(2), true, (0.0, -1));
    d.tick();

    let ask = d.token_of(4);

    assert!(d.coordinator.answer(ask, 5));
    d.tick();

    assert_eq!(d.find(EventKind::OpFail, 4).map(|e| e.b), Some(3));
}

#[test]
fn a_yes_runs_both_branches_and_joins() {
    let mut d = Driver::new();

    greet_until_branch(&mut d, 0.83);
    d.coordinator.complete(d.token_of(2), true, (0.0, -1));
    d.tick();
    d.coordinator.answer(d.token_of(4), 0);
    d.tick();

    assert_eq!(i32::from(d.head()), 3);

    d.coordinator.complete(d.token_of(7), true, (0.0, -1));
    d.coordinator.complete(d.token_of(8), true, (0.0, -1));
    d.tick();

    assert_eq!(d.find(EventKind::Ended, 1).map(|e| e.b), Some(0));
    assert_eq!(d.head(), basecase_coordinator::NO_SKILL);
}

#[test]
fn the_base_timeout_runs_its_path_then_stops_safely() {
    let mut d = Driver::new();

    d.run_until(300_000);

    assert!(d.find(EventKind::BaseEnd, 0).is_some());

    d.coordinator.complete(d.token_of(11), true, (0.0, -1));
    d.tick();

    assert_eq!(d.find(EventKind::SafeStop, 0).map(|e| e.a), Some(0));
}

#[test]
fn an_outside_stop_halts_everything() {
    let mut d = Driver::new();

    d.tick();
    d.coordinator.stop();
    d.see(PERSON);
    d.run_until(2000);

    assert!(d.find(EventKind::Fired, 1).is_none());
    assert_eq!(i32::from(d.body()), SETTLE);
}
