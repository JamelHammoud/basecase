use super::demos::{self, held_out, last_action_columns, obs_width, Demos};
use super::fit::{self, Fitted, Settings, MAX_EPOCHS, PATIENCE};
use super::{check_samples, input_mask};
use crate::elu;
use crate::evaluate::exact_action;
use crate::export::{policy_json, Trained};
use crate::job::{self, Job};
use crate::rng::Rng;
use serde_json::{json, Value};

const NACT: usize = 3;
const FIT_BAR: f64 = 1e-3;
const GAINS: [[f64; 2 * NACT]; NACT] = [
    [0.9, -0.4, 0.3, 0.5, 0.0, -0.2],
    [-0.3, 0.8, 0.0, -0.4, 0.6, 0.1],
    [0.2, 0.3, -0.9, 0.0, -0.3, 0.7],
];
const OFFSETS: [f64; NACT] = [0.1, -0.2, 0.05];

fn teacher(joint_part: &[f64]) -> Vec<f64> {
    GAINS
        .iter()
        .zip(OFFSETS)
        .map(|(row, b)| {
            let z: f64 = row.iter().zip(joint_part).map(|(a, x)| a * x).sum::<f64>() + b;

            z.tanh().clamp(-1.0, 1.0)
        })
        .collect()
}

fn synthetic_episode(rng: &mut Rng, rows: usize) -> Value {
    let mut last = vec![0.0f64; NACT];
    let mut obs = Vec::with_capacity(rows);
    let mut actions = Vec::with_capacity(rows);

    for _ in 0..rows {
        let mut row = vec![0.0, 0.0, -1.0];

        row.extend((0..3).map(|_| 0.3 * rng.normal()));
        row.extend((0..3).map(|_| 0.1 * rng.normal()));
        row.extend([0.0, 0.0, 0.0]);
        row.extend((0..NACT).map(|_| 0.5 * rng.normal()));
        row.extend((0..NACT).map(|_| rng.normal()));
        row.extend(&last);
        last = teacher(&row[12..12 + 2 * NACT]);
        actions.push(json!(last));
        obs.push(json!(row));
    }

    json!({ "obs": obs, "actions": actions })
}

fn synthetic(episodes: usize, rows: usize) -> Value {
    let mut rng = Rng::new(5, 0);
    let list: Vec<Value> = (0..episodes).map(|_| synthetic_episode(&mut rng, rows)).collect();

    json!({ "episodes": list })
}

fn shuffled(mut root: Value) -> Value {
    let mut actions: Vec<Value> = Vec::new();
    let episodes = root["episodes"].as_array_mut().expect("episodes");

    episodes
        .iter()
        .for_each(|e| actions.extend(e["actions"].as_array().expect("actions").iter().cloned()));

    let mut order: Vec<u32> = (0..actions.len() as u32).collect();

    Rng::new(17, 0).shuffle(&mut order);

    let mut next = order.into_iter().map(|i| actions[i as usize].clone());

    for episode in episodes {
        let count = episode["actions"].as_array().expect("actions").len();

        episode["actions"] = Value::Array(next.by_ref().take(count).collect());
    }

    root
}

fn bc_job(extra: Value) -> Value {
    let mut root = json!({
        "task": "reach", "minutes": 5, "command": [0, 0, 0], "root": "", "robotName": "Arm", "algo": "bc",
        "demos": "demos.json", "seed": 3,
        "joints": [{"id": "a", "name": "j0"}, {"id": "b", "name": "j1"}, {"id": "c", "name": "j2"}],
        "defaultPose": [0.0, 0.1, 0.2], "ctrlDefault": [0.0, 0.1, 0.2], "initialJoints": {},
        "rootOffset": [0, 0, 0], "actionScale": 0.5, "controlDt": 0.02
    });

    if let (Value::Object(fields), Value::Object(more)) = (&mut root, extra) {
        fields.extend(more);
    }

    root
}

fn parsed_job() -> Job {
    job::parse(&bc_job(json!({}))).expect("job parses")
}

fn trained(demos: &Demos, max_epochs: usize) -> Fitted {
    let job = parsed_job();
    let mask = input_mask(&job);
    let settings = Settings {
        max_epochs,
        ..super::settings(&job, &mask)
    };

    fit::fit(demos, &settings, &mut |_| true)
}

fn numbers(value: &Value) -> Vec<f64> {
    value
        .as_array()
        .expect("list")
        .iter()
        .map(|v| v.as_f64().expect("number"))
        .collect()
}

fn play(spec: &Value, obs: &[f32]) -> Vec<f64> {
    let (mean, std) = (numbers(&spec["obsMean"]), numbers(&spec["obsStd"]));
    let layers = spec["layers"].as_array().expect("layers");
    let mut values: Vec<f64> = obs
        .iter()
        .enumerate()
        .map(|(i, x)| ((*x as f64 - mean[i]) / std[i]).clamp(-5.0, 5.0))
        .collect();

    for (index, layer) in layers.iter().enumerate() {
        let (w, ins) = (numbers(&layer["w"]), values.len());
        let mut next = numbers(&layer["b"]);

        for (o, out) in next.iter_mut().enumerate() {
            *out += (0..ins).map(|i| w[o * ins + i] * values[i]).sum::<f64>();
        }

        if index + 1 < layers.len() {
            next.iter_mut().for_each(|v| *v = elu::exact(*v as f32) as f64);
        }

        values = next;
    }

    values.iter().map(|v| v.clamp(-1.0, 1.0)).collect()
}

fn exported_spec(fitted: &Fitted) -> Value {
    let job = parsed_job();
    let exported = fitted.policy.as_exported();
    let run = Trained {
        job: &job,
        mujoco: "4.0.0",
        policy: &exported,
        norm: &fitted.norm,
    };

    policy_json(&run, fitted.rows_seen, String::new())
}

#[test]
fn bc_holds_out_every_fifth_episode_or_the_last_of_a_few() {
    let held: Vec<usize> = (0..10).filter(|&i| held_out(i, 10)).collect();

    assert_eq!(held, vec![4, 9]);
    assert_eq!((0..5).filter(|&i| held_out(i, 5)).count(), 1);
    assert!(held_out(1, 2) && !held_out(0, 2));
}

#[test]
fn bc_fits_a_synthetic_teacher_and_exports_what_it_learned() {
    let demos = demos::parse(&synthetic(10, 120), NACT).expect("demos parse");
    let started = std::time::Instant::now();
    let fitted = trained(&demos, MAX_EPOCHS);

    eprintln!(
        "bc teacher: {} epochs (best {}), train {:.5}, held out {:.5}, {:.2} s",
        fitted.epochs,
        fitted.best_epoch,
        fitted.train_loss,
        fitted.held_loss,
        started.elapsed().as_secs_f64()
    );
    assert_eq!((demos.train.count, demos.held.count), (960, 240));
    assert!(fitted.held_loss < FIT_BAR, "held-out loss {}", fitted.held_loss);

    let spec = exported_spec(&fitted);
    let exported = fitted.policy.as_exported();
    let mut squared = 0.0f64;

    for (obs, target) in demos
        .held
        .obs
        .chunks_exact(demos.nobs)
        .zip(demos.held.actions.as_chunks::<NACT>().0)
    {
        let played = play(&spec, obs);
        let exact = exact_action(&exported, &fitted.norm, obs);

        for ((p, e), t) in played.iter().zip(&exact).zip(target) {
            assert!((p - *e as f64).abs() < 1e-4, "{p} against {e}");
            squared += (p - *t as f64).powi(2);
        }
    }

    let replayed = squared / demos.held.actions.len() as f64;

    assert!(
        (replayed - fitted.held_loss).abs() < 1e-4,
        "{replayed} against {}",
        fitted.held_loss
    );
    assert_eq!(spec["obsMean"].as_array().expect("mean").len(), obs_width(NACT));
    assert_eq!(check_samples(&demos, &exported, &fitted.norm).len(), 16);
}

#[test]
fn bc_cannot_fit_actions_shuffled_across_rows() {
    let demos = demos::parse(&shuffled(synthetic(10, 120)), NACT).expect("demos parse");
    let fitted = trained(&demos, MAX_EPOCHS);

    eprintln!(
        "bc shuffled: {} epochs (best {}), train {:.5}, held out {:.5}",
        fitted.epochs, fitted.best_epoch, fitted.train_loss, fitted.held_loss
    );
    assert!(fitted.held_loss > 100.0 * FIT_BAR, "held-out loss {}", fitted.held_loss);
    assert_eq!(fitted.epochs, fitted.best_epoch + PATIENCE);
}

#[test]
fn bc_gives_masked_and_constant_columns_no_weight() {
    let demos = demos::parse(&synthetic(5, 60), NACT).expect("demos parse");
    let spec = exported_spec(&trained(&demos, 20));
    let first = &spec["layers"][0];
    let (ins, weights) = (first["in"].as_u64().expect("in") as usize, numbers(&first["w"]));
    let silent = |i: usize| weights.iter().skip(i).step_by(ins).all(|w| *w == 0.0);
    let constant = [0, 1, 2, 9, 10, 11];

    assert_eq!(ins, obs_width(NACT));
    assert!(last_action_columns(NACT).chain(constant).all(silent));
    assert!(!(3..9).chain(12..12 + 2 * NACT).any(silent));
    assert!(constant
        .iter()
        .all(|&i| spec["obsStd"][i].as_f64().expect("std") >= 0.01));
}

#[test]
fn bc_replays_exactly_for_a_seed() {
    let demos = demos::parse(&synthetic(5, 60), NACT).expect("demos parse");
    let (one, two) = (trained(&demos, 5), trained(&demos, 5));

    assert_eq!(one.policy.params, two.policy.params);
    assert_eq!(one.held_loss, two.held_loss);
}

#[test]
fn bc_job_refusals_name_the_problem() {
    let refusals = [
        (json!({ "demos": null }), "demos"),
        (json!({ "demos": "../demos.json" }), "demos"),
        (json!({ "demos": "runs/demos.json" }), "demos"),
        (json!({ "demos": "C:demos.json" }), "demos"),
        (
            json!({ "reference": { "loop": false, "frames": [[0, 0, 0, 0.1, 0], [0, 0, 0, 0.1, 0]] } }),
            "reference",
        ),
        (json!({ "stateNoise": -0.1 }), "stateNoise"),
        (json!({ "stateNoise": 9 }), "stateNoise"),
    ];

    for (extra, word) in refusals {
        let error = job::parse(&bc_job(extra.clone())).expect_err("must fail");

        assert!(error.contains(word), "{extra}: {error}");
    }
}

#[test]
fn bc_demo_refusals_name_the_problem() {
    let mut narrow = synthetic(3, 4);
    let mut uneven = synthetic(3, 4);
    let mut empty = synthetic(3, 4);
    let mut huge = synthetic(3, 4);

    narrow["episodes"][1]["obs"][2] = json!([0.0, 1.0]);
    uneven["episodes"][0]["actions"].as_array_mut().expect("actions").pop();
    empty["episodes"][2] = json!({ "obs": [], "actions": [] });
    huge["episodes"][0]["actions"][0][1] = json!(1e300);

    let refusals = [
        (synthetic(1, 4), "at least 2 episodes"),
        (narrow, "episode 2, obs row 3 has 2 numbers, not 21"),
        (uneven, "episode 1 has 4 observations and 3 actions"),
        (empty, "episode 3 has no rows"),
        (huge, "non-finite"),
        (json!({ "runs": [] }), "no episodes list"),
    ];

    for (root, words) in refusals {
        let error = demos::parse(&root, NACT).expect_err("must fail");

        assert!(error.contains(words), "{error}");
    }
}

#[cfg(feature = "native")]
#[test]
fn bc_trains_from_a_job_folder_without_a_model() {
    let folder = std::env::temp_dir().join(format!("forge-bc-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&folder);

    std::fs::create_dir_all(&folder).expect("folder");
    std::fs::write(
        folder.join("job.json"),
        bc_job(json!({ "maxIterations": 15 })).to_string(),
    )
    .expect("job");
    std::fs::write(folder.join("demos.json"), synthetic(5, 40).to_string()).expect("demos");
    crate::trainer::train(&folder).expect("bc trains");

    let text = std::fs::read_to_string(folder.join("policy.json")).expect("policy");
    let spec: Value = serde_json::from_str(&text).expect("policy parses");
    let check: Value =
        serde_json::from_str(&std::fs::read_to_string(folder.join("policy-check.json")).expect("check")).expect("json");

    assert_eq!(spec["format"], "basecase-policy");
    assert_eq!(spec["mujoco"], forge_mujoco::version());
    assert_eq!(spec["obsMean"].as_array().expect("mean").len(), obs_width(NACT));
    assert_eq!(spec["trainedSteps"], 15 * 160);
    assert!(spec.get("squash").is_none());
    assert_eq!(check["samples"].as_array().expect("samples").len(), 16);
    assert!(folder.join("policy.onnx").exists());

    let _ = std::fs::remove_dir_all(&folder);
}

#[test]
fn bc_state_noise_perturbs_only_training_and_replays_for_a_seed() {
    let demos = demos::parse(&synthetic(5, 60), NACT).expect("demos parse");
    let job = job::parse(&bc_job(json!({ "stateNoise": 1.0 }))).expect("job parses");
    let mask = input_mask(&job);
    let noisy = |seed| {
        let settings = Settings {
            max_epochs: 20,
            seed,
            ..super::settings(&job, &mask)
        };

        fit::fit(&demos, &settings, &mut |_| true)
    };
    let (a, again) = (noisy(3), noisy(3));
    let clean = trained(&demos, 20);

    assert_eq!(job.state_noise, 1.0);
    assert_eq!(a.policy.params, again.policy.params);
    assert_ne!(a.policy.params, clean.policy.params);
    assert!(a.held_loss.is_finite());
}
