use super::dense::Dense;
use super::Sac;
use crate::warm::{Net, Snapshot, WarmStart};

const NETS: usize = 4;

fn algo(sac: &Sac) -> &'static str {
    if sac.recipe.project_weights {
        "flashsac"
    } else {
        "fastsac"
    }
}

fn sizes(net: &Dense) -> Vec<usize> {
    let mut sizes = vec![net.blocks[0].ins];

    sizes.extend(net.blocks.iter().map(|b| b.outs));

    sizes
}

pub fn snapshot(sac: &Sac) -> Snapshot {
    let critic = &sac.critic;
    let params = critic.params.iter().chain(&critic.targets).flatten().copied().collect();

    Snapshot {
        algo: algo(sac).to_owned(),
        actor: Net::of(&sac.actor.net, &sac.actor.params),
        critic: Net {
            sizes: sizes(&critic.net),
            params,
        },
        log_std: Vec::new(),
        learn_rate: None,
        log_alpha: Some(sac.log_alpha[0]),
    }
}

fn same_critic(sac: &Sac, state: &Snapshot) -> bool {
    state.algo == algo(sac)
        && state.critic.sizes == sizes(&sac.critic.net)
        && state.critic.params.len() == NETS * sac.critic.net.size
}

pub fn warm_start(sac: &mut Sac, source: &WarmStart) -> Result<Vec<String>, String> {
    let state = &source.state;
    let nact = sac.actor.nact;
    let actor = &mut sac.actor;

    state.actor.load_into(&actor.net, &mut actor.params, nact)?;
    actor.net.zero_masked(&mut actor.params);
    sac.norm = source.norm.clone();

    if !same_critic(sac, state) {
        return Ok(vec!["Its value estimate starts fresh".to_owned()]);
    }

    let critic = &mut sac.critic;
    let size = critic.net.size;
    let sets = critic.params.iter_mut().chain(critic.targets.iter_mut());

    for (set, chunk) in sets.zip(state.critic.params.chunks_exact(size)) {
        set.copy_from_slice(chunk);
    }

    if let Some(log_alpha) = state.log_alpha {
        sac.log_alpha[0] = log_alpha;
    }

    Ok(Vec::new())
}
