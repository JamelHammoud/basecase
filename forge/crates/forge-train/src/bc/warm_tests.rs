use super::demos::{Demos, Rows};
use super::fit::{fit_warm, Settings};
use crate::mlp::Mlp;
use crate::normalizer::Normalizer;
use crate::warm::{Net, Snapshot, WarmStart};
use serde_json::json;

fn fixture() -> (Demos, WarmStart) {
    let net = Mlp::plan(&[15, 256, 128, 64, 1], 0);
    let mut params = vec![0.0; net.param_end()];

    params[net.layers[0].weights_at + 14 * 256] = 1.0;

    for layer in net.layers.iter().skip(1) {
        params[layer.weights_at] = 1.0;
    }

    let mut obs = vec![0.0; 15 * 4];

    for row in 0..4 {
        obs[row * 15 + 14] = 0.2;
    }

    let rows = Rows {
        obs,
        actions: vec![0.2; 4],
        count: 4,
    };
    let demos = Demos {
        nobs: 15,
        nact: 1,
        episodes: 2,
        train: rows.clone(),
        held: rows,
    };
    let warm = WarmStart {
        norm: Normalizer::restored(vec![0.0; 15], vec![1.0 - 1e-8; 15], 50.0),
        state: Snapshot {
            algo: "bc".to_owned(),
            actor: Net::of(&net, &params),
            critic: Net::empty(),
            log_std: vec![],
            learn_rate: None,
            log_alpha: None,
        },
    };

    (demos, warm)
}

#[test]
fn warm_cloning_keeps_normalization_and_constant_previous_action_weights() {
    let (demos, warm) = fixture();
    let original = warm.state.clone();
    let settings = Settings {
        seed: 1,
        max_epochs: 2,
        budget_s: 2.0,
        mask: &[],
        state_noise: 0.0,
        noisy: 12..14,
    };
    let result = fit_warm(&demos, &settings, &warm, &mut |_| false).expect("warm fit");

    assert_eq!(result.norm.mean, warm.norm.mean);
    assert_eq!(result.norm.var, warm.norm.var);
    assert_eq!(Net::of(&result.policy.net, &result.policy.params), original.actor);
    assert_eq!(warm.state, original);
    assert_eq!(result.best_epoch, 0);
    assert!(result.stopped);
}

#[test]
fn warm_cloning_refuses_an_incompatible_actor_before_updates() {
    let (demos, mut warm) = fixture();
    let settings = Settings {
        seed: 1,
        max_epochs: 1,
        budget_s: 2.0,
        mask: &[],
        state_noise: 0.0,
        noisy: 12..14,
    };

    warm.state.actor.sizes[0] = 18;

    let result = fit_warm(&demos, &settings, &warm, &mut |_| panic!("no update"));

    assert!(matches!(result, Err(reason) if reason.contains("network")));
}

#[test]
fn warm_cloning_resolves_job_relative_artifacts_without_changing_the_source() {
    let (demos, warm) = fixture();
    let folder = std::env::temp_dir().join(format!("forge-bc-warm-{}", std::process::id()));

    std::fs::create_dir_all(folder.join("source")).expect("folder");
    crate::warm::write_resume(&folder.join("source/resume.json"), &warm.state, &warm.norm, 1).expect("source");

    let original = std::fs::read(folder.join("source/resume.json")).expect("original");
    let episode = json!({
        "obs": demos.train.obs.chunks(15).collect::<Vec<_>>(),
        "actions": demos.train.actions.chunks(1).collect::<Vec<_>>()
    });
    let job = json!({
        "task": "reach", "minutes": 1, "command": [0, 0, 0], "root": "", "robotName": "Arm", "algo": "bc",
        "demos": "demos.json", "seed": 3, "maxIterations": 2, "warmStart": "source",
        "joints": [{"id": "a", "name": "j0"}], "defaultPose": [0], "ctrlDefault": [0], "initialJoints": {},
        "rootOffset": [0, 0, 0], "actionScale": 1, "controlDt": 0.04
    });

    std::fs::write(folder.join("job.json"), job.to_string()).expect("job");
    std::fs::write(
        folder.join("demos.json"),
        json!({ "episodes": [episode.clone(), episode] }).to_string(),
    )
    .expect("demos");
    crate::trainer::train(&folder).expect("warm training");
    assert_eq!(
        std::fs::read(folder.join("source/resume.json")).expect("source"),
        original
    );
    assert!(folder.join("policy.json").exists());
    assert!(folder.join("policy-check.json").exists());
    std::fs::remove_dir_all(folder).expect("clean folder");
}
