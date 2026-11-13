const MESSAGE_LIMIT: usize = 200;
const SHOWN_NAMES: usize = 3;

fn joint_list(names: &[String], shown: usize) -> String {
    if shown == 0 {
        return match names.len() {
            1 => "1 joint".into(),
            count => format!("{count} joints"),
        };
    }

    let named = &names[..shown.min(names.len())];
    let mut parts = named.to_vec();

    if names.len() > named.len() {
        parts.push(format!("{} more", names.len() - named.len()));
    }

    match parts.split_last() {
        Some((last, [])) => last.clone(),
        Some((last, rest)) => format!("{} and {last}", rest.join(", ")),
        None => String::new(),
    }
}

fn unmatched_sentence(missing: &[String], extra: &[String], shown: usize) -> String {
    let lacks = "which the scene doesn't have, so nothing will move.";

    match (missing.is_empty(), extra.is_empty()) {
        (false, true) => format!(
            "The robot doesn't publish {}, so nothing will move. Match the scene's joint names to the robot's.",
            joint_list(missing, shown)
        ),
        (true, false) => format!("The robot publishes {}, {lacks}", joint_list(extra, shown)),
        _ => format!(
            "The robot doesn't publish {} and publishes {}, {lacks}",
            joint_list(missing, shown),
            joint_list(extra, shown)
        ),
    }
}

pub fn unmatched_message(missing: &[String], extra: &[String]) -> String {
    (0..=SHOWN_NAMES)
        .rev()
        .map(|shown| unmatched_sentence(missing, extra, shown))
        .find(|sentence| sentence.len() < MESSAGE_LIMIT)
        .unwrap_or_else(|| unmatched_sentence(missing, extra, 0))
}

#[cfg(test)]
mod tests {
    use super::*;

    const BANNED: [&str; 7] = ["please", "simply", "successfully", "oops", "invalid", " yet", "·"];

    fn assert_plain(message: &str) {
        let lower = message.to_lowercase();

        assert!(message.ends_with('.'), "{message}");
        assert!(message.len() < 200, "{message}");
        assert!(BANNED.iter().all(|word| !lower.contains(word)), "{message}");
    }

    #[test]
    fn unmatched_joints_are_named_and_long_lists_cut_short() {
        let names = |count: usize, width: usize| -> Vec<String> {
            (0..count).map(|at| format!("j{at}{}", "x".repeat(width))).collect()
        };

        assert_eq!(
            unmatched_message(&["elbow".into()], &[]),
            "The robot doesn't publish elbow, so nothing will move. Match the scene's joint names to the robot's."
        );
        assert!(unmatched_message(&names(5, 2), &[]).contains("j0xx, j1xx, j2xx and 2 more"));
        assert!(unmatched_message(&[], &names(2, 1)).contains("j0x and j1x, which the scene"));

        for (missing, extra) in [
            (names(32, 60), names(64, 60)),
            (names(1, 61), names(1, 61)),
            (names(3, 0), vec![]),
        ] {
            assert_plain(&unmatched_message(&missing, &extra));
        }

        assert!(unmatched_message(&names(32, 60), &names(64, 60)).contains("32 joints"));
    }
}
