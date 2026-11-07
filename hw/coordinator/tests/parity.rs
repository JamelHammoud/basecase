mod common;

use basecase_coordinator::{Coordinator, EventKind, Fact};
use common::{OBSTACLE, PERSON, PLAN, WALK};

const SAY_OPS: [i32; 5] = [2, 3, 8, 10, 11];
const INFER_OP: i32 = 0;
const ASK_OP: i32 = 4;
const STEPS: u64 = 400;

fn fixture(name: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name)
}

fn seen(fact: usize, now: u64) -> bool {
    match fact {
        PERSON => (1000..15_000).contains(&now) || now >= 17_000,
        OBSTACLE => (6000..7000).contains(&now),
        _ => false,
    }
}

fn reply_for(kind: EventKind, a: i32, b: i32) -> Option<(u64, String)> {
    match kind {
        EventKind::Run if a != WALK => Some((500, format!("complete {b} 1 0 -1"))),
        EventKind::OpStart if a == INFER_OP => Some((200, format!("complete {b} 1 0.83 7"))),
        EventKind::OpStart if a == ASK_OP => Some((300, format!("answer {b} 0"))),
        EventKind::OpStart if SAY_OPS.contains(&a) => Some((600, format!("complete {b} 1 0 -1"))),
        _ => None,
    }
}

fn inputs_at(now: u64, walk: i32, due: Vec<(u64, String)>) -> Vec<String> {
    let mut lines: Vec<String> = [PERSON, OBSTACLE]
        .iter()
        .map(|fact| format!("publish {fact} {} -1 {now}", u8::from(seen(*fact, now))))
        .collect();

    if walk > 0 && now.is_multiple_of(500) {
        lines.push(format!("phase {walk}"));
    }

    lines.extend(due.into_iter().map(|(_, line)| line));
    lines.push(format!("tick {now}"));

    lines
}

fn record() -> String {
    let mut c = Coordinator::from_json(PLAN).unwrap();
    let mut pending: Vec<(u64, String)> = Vec::new();
    let mut walk = 0;
    let mut out = String::new();

    for step in 0..STEPS {
        let now = step * 50;
        let (due, later): (Vec<_>, Vec<_>) = pending.into_iter().partition(|(t, _)| *t <= now);

        pending = later;

        for line in inputs_at(now, walk, due) {
            if let Some(t) = apply_line(&mut c, &line) {
                c.tick(t);
            }

            out.push_str(&line);
            out.push('\n');
        }

        for e in c.events() {
            walk = if e.kind == EventKind::Run && e.a == WALK {
                e.b
            } else {
                walk
            };

            if let Some((delay, line)) = reply_for(e.kind, e.a, e.b) {
                pending.push((now + delay, line));
            }
        }

        c.clear_events();
    }

    out
}

fn apply_line(c: &mut Coordinator, line: &str) -> Option<u64> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    let num = |i: usize| parts[i].parse::<f64>().unwrap();
    let int = |i: usize| parts[i].parse::<i32>().unwrap();

    match parts[0] {
        "tick" => return Some(parts[1].parse().unwrap()),
        "publish" => {
            let fact = Fact {
                num: num(2),
                sym: int(3),
                stamp_ms: parts[4].parse().unwrap(),
            };

            c.board().publish(parts[1].parse().unwrap(), fact);
        }
        "complete" => {
            c.complete(int(1), int(2) == 1, (num(3), int(4)));
        }
        "answer" => {
            c.answer(int(1), int(2));
        }
        "phase" => {
            c.phase(int(1));
        }
        _ => panic!("unknown input {line}"),
    }

    None
}

fn replay_into(inputs: &str) -> (Coordinator, String) {
    let mut c = Coordinator::from_json(PLAN).unwrap();
    let mut trace = String::new();

    for line in inputs.lines() {
        let Some(now) = apply_line(&mut c, line) else {
            continue;
        };

        c.tick(now);

        if !c.events().is_empty() {
            let length = c.drain_json();
            let json = std::str::from_utf8(c.json_bytes(length)).unwrap();

            trace.push_str(&format!("{now} {json}\n"));
        }
    }

    (c, trace)
}

#[test]
fn native_trace_matches_the_shared_fixture() {
    let inputs = record();
    let (_, trace) = replay_into(&inputs);

    if std::env::var("UPDATE_FIXTURES").is_ok() {
        std::fs::write(fixture("parity.inputs.txt"), &inputs).unwrap();
        std::fs::write(fixture("parity.trace.txt"), &trace).unwrap();
    }

    let saved_inputs = std::fs::read_to_string(fixture("parity.inputs.txt")).unwrap();
    let saved_trace = std::fs::read_to_string(fixture("parity.trace.txt")).unwrap();

    assert_eq!(inputs, saved_inputs);
    assert_eq!(trace, saved_trace);
    assert!(trace.contains("\"k\":\"preempted\"") || trace.contains("\"k\":\"fired\",\"a\":0"));
    assert!(
        trace.contains("\"k\":\"dropped\"")
            || trace.matches("\"k\":\"fired\",\"a\":1").count() >= 2
    );
}
