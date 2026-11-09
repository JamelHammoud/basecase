#![cfg(target_os = "macos")]

use forge_mujoco::Model;
use forge_train::algorithm::Algorithm;
use forge_train::deployed::{Deployed, Squash};
use forge_train::envs::{Envs, StepResult};
use forge_train::evaluate::{evaluate_seeds, GateResult, Trained};
use forge_train::events::Phases;
use forge_train::gpu_loop::stats::{Statistic, Step, Tally};
use forge_train::gpu_loop::{self, GpuPpo, Start};
use forge_train::job::{self, Backend, Job};
use forge_train::kernels::Math;
use forge_train::mlp::{Mlp, Scratch};
use forge_train::normalizer::Normalizer;
use forge_train::physics::Engine;
use forge_train::rng::Rng;
use forge_train::robot::Robot;
use forge_train::warm;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

static GPU: Mutex<()> = Mutex::new(());

fn explicitly_named(test: &str) -> bool {
    std::env::args().any(|arg| arg == test)
}

fn asked_for_acceptance() -> bool {
    std::env::args().skip(1).any(|arg| arg.contains("acceptance_replay"))
}

const ROBOT: &str = "quad-servo";
const ENVS: usize = 4096;
const SEEDS: usize = 32;
const L4_ROUNDS: usize = 40;
const L4_SIGMAS: f64 = 4.0;
const L4_FLOOR: f64 = 0.01;
const ENV_SEED: u64 = 21;
const NOISE_SEED: u64 = 22;
const CANARY_ITERATIONS: usize = 100;
const L4_CANARY_ITERATIONS: usize = 20;

fn fixture() -> PathBuf {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../verify/out/fixtures")
        .join(ROBOT);

    assert!(
        dir.join("model.xml").exists(),
        "{} is missing: the s0 gate emits the fixture robots",
        dir.display()
    );
    dir
}

fn job_folder(name: &str, extra: &Value) -> PathBuf {
    let folder = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    let source = fixture();
    let mut job: Value =
        serde_json::from_str(&std::fs::read_to_string(source.join("job.json")).expect("job")).expect("json");

    job.as_object_mut().expect("object").extend(
        json!({
            "task": "walk", "command": [0.25, 0, 0], "minutes": 10, "gateEvery": 25, "evalSeeds": SEEDS,
            "gateSpeed": 0.2, "seed": 3, "envs": ENVS, "backend": "metal", "maxIterations": 400
        })
        .as_object()
        .expect("object")
        .clone(),
    );
    job.as_object_mut()
        .expect("object")
        .extend(extra.as_object().expect("object").clone());

    let _ = std::fs::remove_dir_all(&folder);

    std::fs::create_dir_all(&folder).expect("folder");
    std::fs::copy(source.join("model.xml"), folder.join("model.xml")).expect("model");
    std::fs::write(folder.join("job.json"), job.to_string()).expect("job");
    folder
}

pub fn robot_on(folder: &Path, backend: Backend) -> Robot {
    let job = Job {
        backend,
        ..job::load(folder).expect("job loads")
    };

    Robot::load(Model::load(&folder.join("model.xml")).expect("model"), job).expect("robot")
}

pub struct Policy {
    pub deployed: Deployed,
    pub norm: Normalizer,
}

pub fn exported(folder: &Path, robot: &Robot) -> Policy {
    let source = warm::load(&folder.join("policy.json")).expect("policy.json loads");
    let actor = Mlp::plan(&source.state.actor.sizes, 0);
    let mut params = vec![0.0f32; actor.param_end()];

    source
        .state
        .actor
        .load_into(&actor, &mut params, robot.nact)
        .expect("same network");

    Policy {
        deployed: Deployed::new(actor, params, Squash::Clip),
        norm: source.norm,
    }
}

pub fn replay_on(robot: &Robot, policy: &mut Policy) -> GateResult {
    let math = Math::native(1);
    let mut run = Trained {
        robot,
        policy: &mut policy.deployed,
        norm: &policy.norm,
        math: &math,
        threads: None,
    };

    evaluate_seeds(&mut run, SEEDS).expect("C MuJoCo evaluates")
}

fn replay_in_wasm(folder: &Path) -> Value {
    let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../tools/forge/wasm-replay.mjs");
    let output = Command::new("node")
        .arg(script)
        .arg(folder)
        .arg(SEEDS.to_string())
        .output()
        .expect("node runs");

    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));

    let text = String::from_utf8_lossy(&output.stdout);

    serde_json::from_str(text.lines().last().expect("a result line")).expect("JSON")
}

fn train(folder: &Path) -> Vec<Value> {
    let output = Command::new(env!("CARGO_BIN_EXE_forge-train"))
        .arg("--job")
        .arg(folder)
        .output()
        .expect("forge-train runs");

    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|l| serde_json::from_str(l).expect("JSON line"))
        .collect()
}

fn reached(passed: usize) -> bool {
    passed >= (0.9 * SEEDS as f64).ceil() as usize
}

static TRAINED: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

fn trained_policy() -> PathBuf {
    TRAINED.get_or_init(train_once).clone()
}

fn train_once() -> PathBuf {
    let folder = job_folder("acceptance-trained", &json!({}));
    let events = train(&folder);
    let status: Vec<&str> = events.iter().filter_map(|e| e["message"].as_str()).collect();

    assert!(
        status.iter().any(|s| s.starts_with("Training on the GPU")),
        "the job trained on the GPU loop: {status:?}"
    );

    folder
}

#[test]
fn acceptance_replay_l5_a_gpu_policy_passes_in_c_and_wasm() {
    if !asked_for_acceptance() {
        return;
    }

    let _gpu = GPU.lock().unwrap_or_else(|e| e.into_inner());
    let folder = trained_policy();
    let robot = robot_on(&folder, Backend::Mujoco);
    let mut policy = exported(&folder, &robot);
    let c = replay_on(&robot, &mut policy);
    let wasm = replay_in_wasm(&folder);

    println!("C MuJoCo replay: {}", c.to_json());
    println!("WASM replay: {wasm}");
    assert!(c.reached(), "C MuJoCo replay {}", c.to_json());
    assert!(
        reached(wasm["passed"].as_u64().unwrap_or(0) as usize),
        "WASM replay {wasm}"
    );
}

struct Actor {
    net: Mlp,
    params: Vec<f32>,
    std: Vec<f32>,
    norm: Normalizer,
}

fn actor_from(folder: &Path, nact: usize) -> Actor {
    let source = warm::load(folder).expect("resume.json loads");
    let net = Mlp::plan(&source.state.actor.sizes, 0);
    let mut params = vec![0.0f32; net.param_end()];

    source
        .state
        .actor
        .load_into(&net, &mut params, nact)
        .expect("same network");

    Actor {
        net,
        params,
        std: source.state.log_std.iter().map(|s| s.exp()).collect(),
        norm: source.norm,
    }
}

fn c_statistics(robot: &Robot, actor: &mut Actor, steps: usize) -> Vec<Statistic> {
    let (n, nobs, nact) = (ENVS, robot.nobs(), robot.nact);
    let math = Math::native(1);
    let mut envs = Envs::new(robot, n, ENV_SEED, true).expect("C MuJoCo environments");
    let mut scratch: Scratch = actor.net.scratch(n);
    let mut rng = Rng::new(NOISE_SEED, 0);
    let mut tally = Tally::new(n, nact);
    let (mut raw, mut normalized) = (vec![0.0f32; n * nobs], vec![0.0f32; n * nobs]);
    let (mut reward, mut fell, mut timeout) = (vec![0.0f32; n], vec![false; n], vec![false; n]);
    let mut phases = Phases::default();

    envs.observe(&mut raw);
    actor.norm.update(&raw);

    for _ in 0..steps {
        actor.norm.apply(&raw, &mut normalized);

        let mean = actor.net.forward(&math, &actor.params, &normalized, n, &mut scratch);
        let act: Vec<f32> = mean
            .iter()
            .enumerate()
            .map(|(i, m)| m + actor.std[i % nact] * rng.normal() as f32)
            .collect();
        let result = StepResult {
            reward: &mut reward,
            fell: &mut fell,
            timeout: &mut timeout,
        };

        envs.step(&act, result, &mut phases).expect("C MuJoCo steps");

        for w in 0..n {
            let step = Step {
                obs: &raw[w * nobs..(w + 1) * nobs],
                action: &act[w * nact..(w + 1) * nact],
                reward: reward[w],
                fell: fell[w],
            };

            tally.add(w, &step);
        }

        envs.observe(&mut raw);
        actor.norm.update(&raw);
    }

    tally.summary()
}

fn gpu_statistics(folder: &Path, rounds: usize, plant: fn(&mut Robot)) -> (Vec<Statistic>, usize) {
    let mut robot = robot_on(folder, Backend::Metal);

    plant(&mut robot);

    assert!(
        matches!(robot.engine, Engine::Metal { .. }),
        "the Metal engine admits the robot"
    );

    let start = Start {
        robot: &robot,
        envs: ENVS,
        env_seed: ENV_SEED,
        seed: NOISE_SEED,
        math: Math::native(1),
    };
    let mut gpu: GpuPpo = gpu_loop::start(start).expect("the GPU loop starts");

    gpu.warm_start(&warm::load(folder).expect("resume.json loads"))
        .expect("warm start");

    let stats = gpu.rollout_stats(rounds).expect("GPU rollouts");

    (stats, rounds * gpu.horizon())
}

fn l4_misses(ours: &[Statistic], theirs: &[Statistic]) -> Vec<String> {
    let mut misses = Vec::new();

    assert!(!ours.is_empty(), "the GPU reported no rollout statistics");
    assert_eq!(
        ours.len(),
        theirs.len(),
        "the GPU and C MuJoCo report different statistics"
    );

    for (a, b) in ours.iter().zip(theirs) {
        assert_eq!(a.name, b.name, "the GPU and C MuJoCo statistics are out of order");

        let allowed = L4_SIGMAS * a.error.hypot(b.error) + L4_FLOOR * b.mean.abs();
        let line = format!(
            "{}: GPU {:.5} ± {:.5}, C MuJoCo {:.5} ± {:.5}, allowed {allowed:.5}",
            a.name, a.mean, a.error, b.mean, b.error
        );

        println!("{line}");

        if (a.mean - b.mean).abs() > allowed || !a.mean.is_finite() || !b.mean.is_finite() {
            misses.push(line);
        }
    }

    misses
}

fn no_plant(_: &mut Robot) {}

#[test]
fn acceptance_replay_l4_gpu_rollout_statistics_match_c_mujoco() {
    if !asked_for_acceptance() {
        return;
    }

    let _gpu = GPU.lock().unwrap_or_else(|e| e.into_inner());
    let folder = trained_policy();
    let (ours, steps) = gpu_statistics(&folder, L4_ROUNDS, no_plant);
    let robot = robot_on(&folder, Backend::Mujoco);
    let theirs = c_statistics(&robot, &mut actor_from(&folder, robot.nact), steps);
    let misses = l4_misses(&ours, &theirs);

    assert!(misses.is_empty(), "L4 statistics differ: {misses:#?}");
}

fn plant_bent_knees(robot: &mut Robot) {
    let Engine::Metal { kernel, .. } = &mut robot.engine else {
        panic!("the canary needs the Metal engine");
    };
    let knees: Vec<usize> = robot
        .job
        .joints
        .iter()
        .enumerate()
        .filter(|(_, j)| j.name.contains("bend"))
        .map(|(i, _)| robot.joint_qpos[i])
        .collect();

    for joint in kernel.joints.iter_mut().filter(|j| knees.contains(&j.qposadr)) {
        joint.axis = joint.axis.map(|a| -a);
    }
}

#[test]
fn canary_bad_physics_replay_fails() {
    if !explicitly_named("canary_bad_physics_replay_fails") {
        return;
    }

    let _gpu = GPU.lock().unwrap_or_else(|e| e.into_inner());
    let folder = job_folder("canary-bad-physics", &json!({}));
    let mut planted = robot_on(&folder, Backend::Metal);

    plant_bent_knees(&mut planted);

    let start = Start {
        robot: &planted,
        envs: ENVS,
        env_seed: ENV_SEED,
        seed: NOISE_SEED,
        math: Math::native(1),
    };
    let mut gpu = gpu_loop::start(start).expect("the GPU loop starts on the planted physics");

    for _ in 0..CANARY_ITERATIONS {
        gpu.iterate().expect("an iteration");
    }

    gpu.report();

    let mut policy = Policy {
        deployed: gpu.deployed(),
        norm: gpu.norm().clone(),
    };
    let own = replay_on(&planted, &mut policy);

    println!("On the planted physics: {}", own.to_json());

    if !own.reached() {
        println!(
            "The planted physics didn't train a passing policy ({}), so this canary can't fire",
            own.to_json()
        );

        return;
    }

    let c = replay_on(&robot_on(&folder, Backend::Mujoco), &mut policy);

    println!("canary reached the C MuJoCo replay");
    assert!(
        c.reached(),
        "C MuJoCo rejects the policy trained on planted physics: {}",
        c.to_json()
    );
}

#[test]
fn canary_bad_physics_l4_statistics_match() {
    if !explicitly_named("canary_bad_physics_l4_statistics_match") {
        return;
    }

    let _gpu = GPU.lock().unwrap_or_else(|e| e.into_inner());
    let folder = job_folder("canary-l4-bad-physics", &json!({}));
    let robot = robot_on(&folder, Backend::Metal);
    let start = Start {
        robot: &robot,
        envs: ENVS,
        env_seed: ENV_SEED,
        seed: NOISE_SEED,
        math: Math::native(1),
    };
    let mut gpu = gpu_loop::start(start).expect("the GPU loop starts");

    for _ in 0..L4_CANARY_ITERATIONS {
        gpu.iterate().expect("an iteration");
    }

    warm::write_resume(&folder.join("resume.json"), &gpu.snapshot(), gpu.norm(), 0).expect("resume.json");
    drop(gpu);

    let (ours, steps) = gpu_statistics(&folder, L4_ROUNDS, plant_bent_knees);
    let c_robot = robot_on(&folder, Backend::Mujoco);
    let theirs = c_statistics(&c_robot, &mut actor_from(&folder, c_robot.nact), steps);
    let misses = l4_misses(&ours, &theirs);

    println!("canary reached the L4 comparison");
    assert!(misses.is_empty(), "L4 statistics differ: {misses:#?}");
}

#[test]
fn replay_folder_in_c() {
    let Some(folder) = std::env::var_os("FORGE_REPLAY_FOLDER") else {
        return;
    };

    if !explicitly_named("replay_folder_in_c") {
        return;
    }

    let folder = PathBuf::from(folder);
    let robot = robot_on(&folder, Backend::Mujoco);
    let mut policy = exported(&folder, &robot);
    let c = replay_on(&robot, &mut policy);

    println!("C MuJoCo replay of the folder: {}", c.to_json());
}
