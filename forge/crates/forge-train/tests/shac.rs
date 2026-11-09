#![cfg(target_os = "macos")]

use forge_mujoco::Model;
use forge_train::job;
use forge_train::robot::Robot;
use forge_train::shac::{probe, Hyper};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const ROBOTS: [&str; 3] = ["quad-servo", "hexapod", "biped-servo"];
const FD_STEP: f32 = 1e-5;
const BOUND: f64 = 0.03;

fn folder(robot: &str, extra: &Value) -> PathBuf {
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../verify/out/fixtures")
        .join(robot);

    assert!(
        source.join("model.xml").exists(),
        "{} is missing: the s0 gate emits the fixture robots",
        source.display()
    );

    let folder = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(format!("shac-{robot}"));
    let mut job: Value =
        serde_json::from_str(&std::fs::read_to_string(source.join("job.json")).expect("job")).expect("json");

    job.as_object_mut()
        .expect("object")
        .extend(extra.as_object().expect("object").clone());

    let _ = std::fs::remove_dir_all(&folder);

    std::fs::create_dir_all(&folder).expect("folder");
    std::fs::copy(source.join("model.xml"), folder.join("model.xml")).expect("model");
    std::fs::write(folder.join("job.json"), job.to_string()).expect("job");
    folder
}

fn robot(name: &str) -> Robot {
    let dir = folder(
        name,
        &json!({ "task": "walk", "command": [0.25, 0, 0], "seed": 4, "envs": 8, "backend": "simd", "algo": "shac" }),
    );

    Robot::load(
        Model::load(&dir.join("model.xml")).expect("model"),
        job::load(&dir).expect("job"),
    )
    .expect("robot")
}

#[test]
fn shac_actor_gradient_matches_fd() {
    for name in ROBOTS {
        let robot = robot(name);

        for (horizon, values) in [(1, false), (1, true), (3, true)] {
            let hyper = Hyper {
                horizon,
                smoothing: forge_sim::grad::Smooth::EXACT,
                ..Hyper::default()
            };
            let check = probe::actor_gradient(&robot, (hyper, values), FD_STEP).expect("probes");
            let error = (check.analytic - check.finite).abs() / check.finite.abs().max(1e-12);

            eprintln!(
                "{name}, {horizon} steps, values {values}: directional derivative {:.6e} against finite differences {:.6e}, {:.2}% apart",
                check.analytic,
                check.finite,
                error * 100.0
            );
            assert!(
                error < BOUND,
                "{name}: the SHAC actor gradient is off by {:.1}%",
                error * 100.0
            );
        }
    }
}
