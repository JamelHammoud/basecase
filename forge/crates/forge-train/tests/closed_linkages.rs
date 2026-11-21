use forge_mujoco::{Data, Model};
use forge_train::job::{self, Backend};
use forge_train::physics::Engine;
use forge_train::robot::Robot;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

fn fixture(destination: &Path, evaluate: bool) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("crates")
        .parent()
        .expect("forge")
        .parent()
        .expect("repository")
        .to_path_buf();
    let mut command = Command::new("node");

    command
        .arg(root.join("tools/sim/closedLinkageFixture.mjs"))
        .arg(destination)
        .current_dir(root);

    if evaluate {
        command.arg("--evaluate");
    }

    let output = command.output().expect("generate scene models");

    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
}

#[test]
fn generated_sketch_loops_keep_passive_coordinates_and_train_on_native_fallback() {
    let destination = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("closed-linkages");

    fixture(&destination, false);

    let manifest: Vec<Value> =
        serde_json::from_str(&fs::read_to_string(destination.join("manifest.json")).expect("manifest"))
            .expect("fixture matrix");

    assert_eq!(manifest.len(), 10);

    for spec in &manifest {
        let started = Instant::now();
        let dir = destination.join(spec["directory"].as_str().expect("directory"));
        let model = Model::load(&dir.join("model.xml")).expect("same generated MJCF loads in C");
        let count = spec["actions"].as_u64().expect("actions") as usize;
        let floating = spec["floating"].as_bool().expect("floating");

        assert_eq!(model.nu(), count);
        assert_eq!(model.nv(), count * 3 + if floating { 6 } else { 0 });

        let engine = Engine::choose(&model, Backend::Metal, false);

        assert!(matches!(engine, Engine::Mujoco { refusal: Some(ref why) } if why.contains("equality constraints")));

        let startup = started.elapsed();
        let mut data = Data::new(&model);
        let stepping = Instant::now();

        for _ in 0..250 {
            data.step(&model);
        }

        println!(
            "{}: preparation {} ms, native fallback {:?}, 250 steps {:?}",
            spec["name"], spec["preparationMs"], startup, stepping.elapsed()
        );
    }

    let directory = destination.join("8");
    let model = Model::load(&directory.join("model.xml")).expect("floating mechanism");
    let robot = Robot::load(model, job::load(&directory).expect("job")).expect("one powered action loads");

    assert_eq!(robot.nact, 1);

    let output = Command::new(env!("CARGO_BIN_EXE_forge-train"))
        .arg("--job")
        .arg(&directory)
        .output()
        .expect("bounded training run");

    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));

    let policy: Value = serde_json::from_str(&fs::read_to_string(directory.join("policy.json")).expect("policy"))
        .expect("policy JSON");

    assert_eq!(policy["joints"].as_array().expect("actions").len(), 1);
    assert_eq!(policy["obsMean"].as_array().expect("observations").len(), 15);
    assert!(String::from_utf8_lossy(&output.stdout).contains("Stepping physics on C MuJoCo"));
    fixture(&destination, true);

    let arena: Value = serde_json::from_str(&fs::read_to_string(directory.join("arena.json")).expect("Arena evidence"))
        .expect("Arena JSON");

    assert_eq!(arena["bar"], 0.75);
    assert_eq!(arena["variants"].as_array().expect("variants").len(), 3);
    assert_eq!(
        arena["passed"].as_bool().expect("verdict"),
        arena["lowerBound"].as_f64().expect("bound") >= 0.75
    );
}

#[test]
fn passive_fixture_springs_return_on_c_mujoco_for_every_accelerated_backend() {
    let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("fixture-spring.xml");

    fs::write(
        &path,
        r#"<mujoco><option timestep="0.002" gravity="0 0 0"/><worldbody><body>
        <joint name="fixture" type="slide" axis="0 0 1" range="0 0.02" limited="true" stiffness="2" springref="0.005" damping="0.2"/>
        <geom type="box" size="0.01 0.01 0.01" mass="0.01"/>
        </body></worldbody></mujoco>"#,
    )
    .expect("write spring fixture");

    let model = Model::load(&path).expect("C MuJoCo accepts a passive return spring");

    assert_eq!(model.nu(), 0);
    assert_eq!(model.nq(), 1);

    for backend in [Backend::Simd, Backend::Metal, Backend::Wgpu] {
        let engine = Engine::choose(&model, backend, false);

        assert!(matches!(engine, Engine::Mujoco { refusal: Some(ref why) } if why.contains("spring")));

        let mut data = Data::new(&model);

        data.qpos()[0] = 0.01;
        data.forward(&model);

        for _ in 0..2000 {
            data.step(&model);
        }

        assert!((data.qpos()[0] - 0.005).abs() < 0.0001);
    }
}
