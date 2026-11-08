use crate::options::TaskOptions;

pub const LINEAR_VELOCITY: [usize; 3] = [6, 7, 8];

pub fn actor_mask(options: &TaskOptions) -> &'static [usize] {
    if options.actor_linvel {
        &[]
    } else {
        &LINEAR_VELOCITY
    }
}

#[cfg(test)]
mod tests {
    use super::LINEAR_VELOCITY;
    use crate::kernels::Math;
    use crate::rng::Rng;
    use crate::update::{Hyper, Learner, Minibatch};

    const NOBS: usize = 18;
    const NACT: usize = 2;
    const ROWS: usize = 16;

    fn random(rng: &mut Rng, count: usize) -> Vec<f32> {
        (0..count).map(|_| rng.normal() as f32).collect()
    }

    fn trained_learner() -> Learner {
        let mut rng = Rng::new(3, 0);
        let mut learner = Learner::new(NOBS, NACT, ROWS, &mut rng);
        let math = Math::native(1);

        learner.mask_actor(&LINEAR_VELOCITY);

        for _ in 0..20 {
            let obs = random(&mut rng, ROWS * NOBS);
            let act = random(&mut rng, ROWS * NACT);
            let adv = random(&mut rng, ROWS);
            let ret = random(&mut rng, ROWS);
            let logp = vec![-2.0f32; ROWS];
            let batch = Minibatch {
                rows: ROWS,
                obs: &obs,
                act: &act,
                logp: &logp,
                adv: &adv,
                ret: &ret,
            };

            learner.minibatch_step(&math, &batch, &Hyper::for_envs(64));
        }

        learner
    }

    #[test]
    fn a_masked_input_never_reaches_the_actor_while_it_learns() {
        let mut learner = trained_learner();
        let math = Math::native(1);
        let first = learner.actor.layers[0];
        let mut obs = vec![0.1f32; NOBS];
        let before = learner.actor.forward_exact(&learner.params, &obs);
        let batched_before = learner.act_mean(&math, &obs, 1).to_vec();

        for input in LINEAR_VELOCITY {
            let at = first.weights_at + input * first.outs;

            assert!(learner.params[at..at + first.outs].iter().all(|w| *w == 0.0));
        }

        obs[6] = 4.0;
        obs[7] = f32::INFINITY;
        obs[8] = f32::NAN;

        assert_eq!(learner.actor.forward_exact(&learner.params, &obs), before);
        assert_eq!(learner.act_mean(&math, &obs, 1), &batched_before[..]);
    }

    #[test]
    fn the_critic_still_reads_a_masked_input() {
        let mut learner = trained_learner();
        let math = Math::native(1);
        let mut obs = vec![0.1f32; NOBS];
        let before = learner.value(&math, &obs, 1)[0];

        obs[6] = 4.0;

        assert_ne!(learner.value(&math, &obs, 1)[0], before);
    }
}
