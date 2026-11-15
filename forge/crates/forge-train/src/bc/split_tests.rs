use super::demos::{self, obs_width};
use super::fit;
use serde_json::{json, Value};

fn episode(marker: f32, split: Value) -> Value {
    json!({ "obs": [vec![marker; obs_width(1)]], "actions": [[marker]], "split": split })
}

#[test]
fn bc_explicit_splits_keep_membership_when_episodes_move() {
    let episodes = vec![
        episode(0.1, json!("validation")),
        episode(0.2, json!("test")),
        episode(0.3, json!("train")),
        episode(0.4, json!("train")),
        episode(0.5, json!("test")),
    ];
    let demos = demos::parse(&json!({ "episodes": episodes }), 1).expect("explicit splits parse");

    assert_eq!(demos.train.count, 2);
    assert_eq!(demos.held.count, 1);
    assert_eq!(demos.train.actions, vec![0.3, 0.4]);
    assert_eq!(demos.held.actions, vec![0.1]);

    let reordered: Vec<Value> = episodes.into_iter().rev().collect();
    let reordered = demos::parse(&json!({ "episodes": reordered }), 1).expect("reordered splits parse");

    assert_eq!(reordered.train.actions, vec![0.4, 0.3]);
    assert_eq!(reordered.held.actions, demos.held.actions);
}

#[test]
fn bc_test_rows_do_not_change_training_or_selection_inputs() {
    let root = json!({ "episodes": [
        episode(0.1, json!("train")),
        episode(0.2, json!("validation")),
        episode(0.3, json!("test")),
    ] });
    let original = demos::parse(&root, 1).expect("original parses");
    let mut changed = root;

    changed["episodes"][2] = episode(1000.0, json!("test"));

    let changed = demos::parse(&changed, 1).expect("changed test rows parse");
    let (norm, _) = fit::normalizer(&original.train, original.nobs);
    let (changed_norm, _) = fit::normalizer(&changed.train, changed.nobs);

    assert_eq!(changed.train.obs, original.train.obs);
    assert_eq!(changed.train.actions, original.train.actions);
    assert_eq!(changed.held.obs, original.held.obs);
    assert_eq!(changed.held.actions, original.held.actions);
    assert_eq!(changed_norm.mean, norm.mean);
}

#[test]
fn bc_split_refusals_name_the_problem() {
    let mut missing = episode(0.2, json!("validation"));

    missing.as_object_mut().expect("object").remove("split");

    let refusals = [
        (vec![episode(0.1, json!("train")), missing], "every episode"),
        (
            vec![episode(0.1, json!("train")), episode(0.2, json!("other"))],
            "split",
        ),
        (
            vec![episode(0.1, json!("train")), episode(0.2, Value::Null)],
            "split",
        ),
        (
            vec![episode(0.1, json!("train")), episode(0.2, json!("test"))],
            "validation",
        ),
        (
            vec![episode(0.1, json!("validation")), episode(0.2, json!("test"))],
            "train",
        ),
    ];

    for (episodes, words) in refusals {
        let error = demos::parse(&json!({ "episodes": episodes }), 1).expect_err("must refuse");

        assert!(error.contains(words), "{error}");
    }
}

#[test]
fn bc_test_episodes_still_require_valid_rows() {
    let mut test = episode(0.3, json!("test"));

    test["actions"] = json!([]);

    let root = json!({ "episodes": [
        episode(0.1, json!("train")), episode(0.2, json!("validation")), test,
    ] });
    let error = demos::parse(&root, 1).expect_err("test episode must be checked");

    assert!(error.contains("episode 3 has 1 observations and 0 actions"), "{error}");
}
