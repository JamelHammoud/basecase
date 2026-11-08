use crate::args::{Args, Backend};
use crate::drive::{controls, start_pose, DECIMATION, EPISODE_ROUNDS};
use crate::meter::{Meter, Windows};
use forge_sim::lanes::LANES;
use forge_sim::{step, Plan, State, Workspace};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Barrier, Mutex};

struct Shared<'a> {
    plan: &'a Plan,
    blocks: &'a [Mutex<State>],
    envs: usize,
    next: AtomicUsize,
    go: AtomicBool,
    stop: AtomicBool,
    barrier: Barrier,
    meter: &'a Meter,
    contacts: AtomicU64,
}

fn advance(shared: &Shared, block: &mut State, index: usize, round: usize, w: &mut Workspace) -> usize {
    let plan = shared.plan;
    let first = index * LANES;
    let real = shared.envs.saturating_sub(first).min(LANES);
    let mut contacts = 0.0;

    for lane in 0..LANES {
        let world = first + lane;

        if round.is_multiple_of(EPISODE_ROUNDS) {
            block.reset(plan, lane, &start_pose(plan, world));
        }

        block.set_ctrl(lane, &controls(plan, world, round));
    }

    for _ in 0..DECIMATION {
        step(plan, block, w);
        contacts += w.block.ncon.0[..real].iter().sum::<f64>();
    }

    shared.contacts.fetch_add(contacts as u64, Ordering::Relaxed);
    real * DECIMATION
}

fn worker(shared: &Shared) {
    let mut w = Workspace::new(shared.plan);
    let mut round = 0;

    loop {
        if shared.barrier.wait().is_leader() {
            shared.next.store(0, Ordering::SeqCst);
            shared.go.store(!shared.stop.load(Ordering::SeqCst), Ordering::SeqCst);
        }

        shared.barrier.wait();

        if !shared.go.load(Ordering::SeqCst) {
            return;
        }

        loop {
            let i = shared.next.fetch_add(1, Ordering::SeqCst);

            if i >= shared.blocks.len() {
                break;
            }

            let mut block = shared.blocks[i].lock().expect("block lock");
            let done = advance(shared, &mut block, i, round, &mut w);

            shared.meter.add(done);
        }

        round += 1;
    }
}

fn simd(args: &Args, threads: usize) -> Result<(Windows, Option<f64>), String> {
    let (_, kernel) = forge_ir::load(&args.xml).map_err(|r| r.to_string())?;
    let plan = Plan::new(kernel);
    let blocks: Vec<Mutex<State>> = (0..args.envs.div_ceil(LANES))
        .map(|_| Mutex::new(State::new(&plan)))
        .collect();
    let meter = Meter::default();
    let shared = Shared {
        plan: &plan,
        blocks: &blocks,
        envs: args.envs,
        next: AtomicUsize::new(0),
        go: AtomicBool::new(true),
        stop: AtomicBool::new(false),
        barrier: Barrier::new(threads),
        meter: &meter,
        contacts: AtomicU64::new(0),
    };
    let windows = std::thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| worker(&shared));
        }

        let windows = meter.watch(args.seconds);

        shared.stop.store(true, Ordering::SeqCst);
        windows
    });
    let contacts = shared.contacts.load(Ordering::SeqCst) as f64 / meter.total().max(1) as f64;

    Ok((windows, Some(contacts)))
}

pub fn run(args: &Args) -> Result<Value, String> {
    let threads = args
        .threads
        .unwrap_or_else(|| std::thread::available_parallelism().map_or(1, |n| n.get()));
    let (windows, contacts) = match args.backend {
        Backend::Simd => simd(args, threads)?,
        Backend::Mujoco => (crate::reference_bench::run(args, threads)?, None),
    };

    Ok(json!({
        "contactsPerWorld": contacts,
        "backend": match args.backend { Backend::Simd => "simd", Backend::Mujoco => "mujoco" },
        "envs": args.envs,
        "seconds": args.seconds,
        "threads": threads,
        "lanes": LANES,
        "substepsPerS": windows.mean,
        "sustainedMin": windows.min,
        "windows": windows.rates,
    }))
}
