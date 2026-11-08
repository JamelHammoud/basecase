use super::Ppo;
use crate::update::{LEARN_RATE_MAX, LEARN_RATE_MIN};
use crate::warm::{Net, Snapshot, WarmStart};

const ALGO: &str = "ppo";

pub fn snapshot(ppo: &Ppo) -> Snapshot {
    let learner = &ppo.update.learner;

    Snapshot {
        algo: ALGO.to_owned(),
        actor: Net::of(&learner.actor, &learner.params),
        critic: Net::of(&learner.critic, &learner.params),
        log_std: learner.log_std().to_vec(),
        learn_rate: Some(learner.learn_rate),
        log_alpha: None,
    }
}

pub fn warm_start(ppo: &mut Ppo, source: &WarmStart) -> Result<Vec<String>, String> {
    let learner = &mut ppo.update.learner;
    let state = &source.state;
    let nact = learner.nact;
    let mut notes = Vec::new();

    state.actor.load_into(&learner.actor, &mut learner.params, nact)?;
    learner.actor.zero_masked(&mut learner.params);

    if state.algo == ALGO && state.critic.sizes == learner.critic.sizes() {
        state.critic.load_into(&learner.critic, &mut learner.params, 1)?;
    } else {
        notes.push("Its value estimate starts fresh".to_owned());
    }

    if state.log_std.len() == nact {
        learner.set_log_std(&state.log_std);
    }

    if let Some(rate) = state.learn_rate {
        learner.learn_rate = rate.clamp(LEARN_RATE_MIN, LEARN_RATE_MAX);
    }

    ppo.collector.norm = source.norm.clone();

    Ok(notes)
}
