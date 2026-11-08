use super::{load, write_resume, Net, Snapshot};
use crate::mlp::Mlp;
use crate::normalizer::Normalizer;
use crate::rng::Rng;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

fn folder(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("forge-warm-{name}-{}", std::process::id()));

    let _ = fs::remove_dir_all(&dir);

    fs::create_dir_all(&dir).expect("folder");

    dir
}

fn random_net(sizes: &[usize], first_param: usize, seed: u64) -> (Mlp, Vec<f32>) {
    let net = Mlp::plan(sizes, first_param);
    let mut rng = Rng::new(seed, 0);
    let params = (0..net.param_end()).map(|_| rng.normal() as f32 * 0.3).collect();

    (net, params)
}

fn policy_json(net: &Mlp, params: &[f32]) -> Value {
    let layers: Vec<Value> = net
        .layers
        .iter()
        .map(|l| {
            json!({ "in": l.ins, "out": l.outs, "w": net.weights_by_output(params, l),
                    "b": params[l.bias_at..l.bias_at + l.outs].to_vec() })
        })
        .collect();

    json!({ "layers": layers, "obsMean": vec![0.5; 6], "obsStd": vec![2.0; 6], "trainedSteps": 1000 })
}

#[test]
fn a_resume_file_round_trips_every_number() {
    let dir = folder("round-trip");
    let (actor, actor_params) = random_net(&[6, 16, 8, 2], 0, 1);
    let (critic, critic_params) = random_net(&[6, 16, 8, 1], 0, 2);
    let mut norm = Normalizer::new(6);

    norm.update(&[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 1.1, -0.2, 0.37, 4.0, 0.0, 1e-3]);

    let state = Snapshot {
        algo: "ppo".to_owned(),
        actor: Net::of(&actor, &actor_params),
        critic: Net::of(&critic, &critic_params),
        log_std: vec![-0.91, -1.3],
        learn_rate: Some(3.3e-4),
        log_alpha: None,
    };

    write_resume(&dir.join("resume.json"), &state, &norm, 4096).expect("written");

    let loaded = load(&dir).expect("loads");

    assert_eq!(loaded.state, state);
    assert_eq!(loaded.norm.mean, norm.mean);
    assert_eq!(loaded.norm.var, norm.var);
    assert_eq!(loaded.norm.count(), norm.count());
}

#[test]
fn a_policy_file_alone_gives_the_same_actor_and_its_normalizer() {
    let dir = folder("policy-only");
    let (net, params) = random_net(&[6, 16, 8, 2], 0, 3);
    let file = dir.join("policy.json");

    fs::write(&file, policy_json(&net, &params).to_string()).expect("policy");

    let loaded = load(&file).expect("loads");
    let (target, _) = random_net(&[6, 16, 8, 2], 40, 4);
    let mut into = vec![0.0f32; target.param_end()];

    loaded.state.actor.load_into(&target, &mut into, 2).expect("fits");

    let x = [0.3, -1.0, 2.0, 0.0, 0.7, -0.4];

    assert_eq!(target.forward_exact(&into, &x), net.forward_exact(&params, &x));
    assert!((loaded.norm.std()[0] - 2.0).abs() < 1e-9);
    assert_eq!(loaded.norm.mean, vec![0.5; 6]);
    assert!(loaded.state.critic.sizes.is_empty());
}

#[test]
fn a_mean_head_fills_a_wider_squashed_head() {
    let (net, params) = random_net(&[6, 16, 8, 2], 0, 5);
    let (wide, mut into) = random_net(&[6, 16, 8, 4], 0, 6);
    let x = [0.3, -1.0, 2.0, 0.0, 0.7, -0.4];

    Net::of(&net, &params).load_into(&wide, &mut into, 2).expect("fits");

    assert_eq!(wide.forward_exact(&into, &x)[..2], net.forward_exact(&params, &x)[..]);
}

#[test]
fn a_network_of_another_shape_fails_with_both_shapes() {
    let (net, params) = random_net(&[6, 16, 8, 2], 0, 7);
    let (other, mut into) = random_net(&[9, 16, 8, 3], 0, 8);
    let reason = Net::of(&net, &params)
        .load_into(&other, &mut into, 3)
        .expect_err("must fail");

    assert!(reason.contains("6-16-8-2") && reason.contains("9-16-8-3"), "{reason}");
}

#[test]
fn a_broken_policy_names_what_is_wrong() {
    let dir = folder("broken");
    let (net, params) = random_net(&[6, 16, 8, 2], 0, 9);
    let mut policy = policy_json(&net, &params);

    policy["layers"][1]["in"] = json!(15);
    fs::write(dir.join("policy.json"), policy.to_string()).expect("policy");

    assert!(load(&dir).err().expect("must fail").contains("layer 2"));
    assert!(load(&dir.join("missing.json"))
        .err()
        .expect("must fail")
        .contains("missing.json"));
}
