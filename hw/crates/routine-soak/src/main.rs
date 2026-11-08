mod args;
mod control;
mod host;
mod plan;
mod timing;

use basecase_coordinator::{Coordinator, Fact, FactBoard};
use plan::PlanInfo;
use serde_json::json;
use std::hint::black_box;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use thread_priority::{set_current_thread_priority, ThreadPriority};
use timing::{millis, percentile};

const PERSON_AT_MS: u64 = 2000;
const PERCEPTION_MS: u64 = 100;

fn spin_worker(stop: Arc<AtomicBool>) -> std::thread::JoinHandle<u64> {
    std::thread::spawn(move || {
        let _ = set_current_thread_priority(ThreadPriority::Min);
        let mut x: u64 = 0x9e37_79b9_7f4a_7c15;

        while !stop.load(Ordering::Relaxed) {
            for _ in 0..10_000 {
                x = black_box(x.rotate_left(5) ^ x.wrapping_mul(0x2545_f491_4f6c_dd1d));
            }
        }

        x
    })
}

fn perceive(board: Arc<FactBoard>, info: PlanInfo, start: Instant, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::Relaxed) {
        let now = millis(start);

        for (index, id) in &info.watcher_facts {
            let seen = id == "person" && now >= PERSON_AT_MS;

            board.publish(
                *index,
                Fact {
                    num: if seen { 1.0 } else { 0.0 },
                    sym: -1,
                    stamp_ms: now,
                },
            );
        }

        std::thread::sleep(Duration::from_millis(PERCEPTION_MS));
    }
}

fn report_json(
    options: &args::Options,
    info: &PlanInfo,
    host: &host::HostReport,
    control: control::ControlReport,
) -> serde_json::Value {
    let mut sorted = control.lateness_us.clone();

    sorted.sort_unstable();

    json!({
        "plan_hash": info.hash,
        "bus": "emulated",
        "seconds": options.seconds,
        "workers": options.workers,
        "control": {
            "ticks": control.lateness_us.len(),
            "p50_us": percentile(&sorted, 0.5),
            "p99_us": percentile(&sorted, 0.99),
            "p999_us": percentile(&sorted, 0.999),
            "max_us": sorted.last().copied().unwrap_or_default(),
            "tripped": control.tripped,
        },
        "body_skills": control.body_ticks,
        "coordinator": { "ticks": host.ticks },
        "hung": {
            "node": options.hang.clone().unwrap_or_default(),
            "started_ms": host.hung_started_ms,
            "answered": host.answered,
        },
    })
}

fn soak(options: &args::Options) -> Result<serde_json::Value, String> {
    let text = std::fs::read_to_string(&options.plan).map_err(|e| format!("Can't read the plan: {e}"))?;
    let info = plan::read(&text)?;
    let coordinator = Coordinator::from_json(&text).map_err(|e| format!("The coordinator refused the plan: {e:?}"))?;
    let slot = coordinator.slot();
    let board = coordinator.board();
    let stop = Arc::new(AtomicBool::new(false));
    let workers: Vec<_> = (0..options.workers).map(|_| spin_worker(stop.clone())).collect();
    let start = Instant::now() + Duration::from_millis(200);
    let perception = {
        let (info, stop) = (info.clone(), stop.clone());

        std::thread::spawn(move || perceive(board, info, start, stop))
    };
    let host = {
        let (info, seconds) = (info.clone(), options.seconds);
        let hang = (options.hang.clone(), options.hang_seconds);

        std::thread::spawn(move || {
            let _ = set_current_thread_priority(ThreadPriority::Max);

            host::Host::new(coordinator, &info, hang).run(start, seconds)
        })
    };
    let config = control::ControlConfig {
        seconds: options.seconds,
        skills: info.skills.clone(),
        safe_stop: info.safe_stop,
        deadline_ms: info.deadline_ms,
    };
    let control = std::thread::spawn(move || {
        let _ = set_current_thread_priority(ThreadPriority::Max);

        control::run(&slot, start, &config)
    })
    .join()
    .map_err(|_| "The control loop panicked")??;
    let host = host.join().map_err(|_| "The coordinator panicked")?;

    stop.store(true, Ordering::Relaxed);
    workers.into_iter().for_each(|w| drop(w.join()));
    drop(perception.join());

    Ok(report_json(options, &info, &host, control))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = args::parse(&args).and_then(|options| soak(&options));

    match result {
        Ok(report) => println!("{report}"),
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    }
}
