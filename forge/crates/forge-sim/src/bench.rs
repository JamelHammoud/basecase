use crate::args::{Args, Backend};
use crate::drive::{controls, start_pose, DECIMATION, EPISODE_ROUNDS};
use crate::meter::{Meter, Windows};
use forge_sim::lanes::LANES;
use forge_sim::{step, Block, Plan, Workspace};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Barrier, Mutex};

struct Shared<'a> {
    plan: &'a Plan,
    blocks: &'a [Mutex<Block>],
    envs: usize,
    next: AtomicUsize,
    go: AtomicBool,
    stop: AtomicBool,
    barrier: Barrier,
    meter: &'a Meter,
}

fn advance(shared: &Shared, block: &mut Block, index: usize, round: usize, w: &mut Workspace) -> usize {
    let plan = shared.plan;
    let first = index * LANES;
    let real = shared.envs.saturating_sub(first).min(LANES);

    for lane in 0..LANES {
        let world = first + lane;

        if round.is_multiple_of(EPISODE_ROUNDS) {
            block.reset(plan, lane, &start_pose(plan, world));
        }

        block.set_ctrl(lane, &controls(plan, world, round));
    }

    for _ in 0..DECIMATION {
        step(plan, block, w);
    }

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

fn simd(args: &Args, threads: usize) -> Result<Windows, String> {
    let (_, kernel) = forge_ir::load(&args.xml).map_err(|r| r.to_string())?;
    let plan = Plan::new(kernel);
    let blocks: Vec<Mutex<Block>> = (0..args.envs.div_ceil(LANES))
        .map(|_| Mutex::new(Block::new(&plan)))
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
    };

    Ok(std::thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| worker(&shared));
        }

        let windows = meter.watch(args.seconds);

        shared.stop.store(true, Ordering::SeqCst);
        windows
    }))
}

pub fn run(args: &Args) -> Result<Value, String> {
    let threads = args
        .threads
        .unwrap_or_else(|| std::thread::available_parallelism().map_or(1, |n| n.get()));
    let windows = match args.backend {
        Backend::Simd => simd(args, threads)?,
        Backend::Mujoco => crate::reference_bench::run(args, threads)?,
    };

    Ok(json!({
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
