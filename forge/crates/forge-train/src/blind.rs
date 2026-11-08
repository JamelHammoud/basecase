use crate::mlp::Mlp;

pub const LINEAR_VELOCITY: [usize; 3] = [6, 7, 8];

pub fn blind_inputs(net: &Mlp, params: &mut [f32], inputs: &[usize]) {
    let first = net.layers[0];

    for &input in inputs.iter().filter(|&&i| i < first.ins) {
        let at = first.weights_at + input * first.outs;

        params[at..at + first.outs].fill(0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::{blind_inputs, LINEAR_VELOCITY};
    use crate::rng::Rng;
    use crate::update::Learner;

    #[test]
    fn a_blinded_input_never_moves_the_actor() {
        let mut learner = Learner::new(18, 2, 4, &mut Rng::new(3, 0));

        blind_inputs(&learner.actor, &mut learner.params, &LINEAR_VELOCITY);

        let mut obs = vec![0.1f32; 18];
        let before = learner.actor.forward_exact(&learner.params, &obs);

        obs[6] = 4.0;
        obs[8] = -3.0;

        assert_eq!(learner.actor.forward_exact(&learner.params, &obs), before);
    }
}
