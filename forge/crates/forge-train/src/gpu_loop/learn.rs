use super::buffers::SQUARE_CHUNK;
use super::nets::{Input, Output};
use super::rollout::Encoder;
use super::source::K;
use crate::update::{Hyper, LEARN_RATE_MAX, LEARN_RATE_MIN, LOG_STD_MAX};
use forge_sim::metal::gpu::{Arg, Dispatch};

const REDUCE: usize = 256;

#[derive(Clone, Copy, Debug)]
pub struct Settings {
    pub hyper: Hyper,
    pub log_std_min: f32,
    pub masked: bool,
}

impl<'a> Encoder<'a> {
    fn advantages(&self, hyper: &Hyper, out: &mut Vec<Dispatch<'a>>) {
        let b = self.buffers;
        let (n, total) = (self.dims.envs, self.dims.total());
        let gae = vec![
            b.rew.arg(),
            b.val.arg(),
            b.done.arg(),
            b.timeout.arg(),
            b.final_val.arg(),
            b.rows.at(total),
            b.rows.at(2 * total),
            Arg::Owned(vec![n as u32, self.dims.horizon as u32]),
            Arg::floats(&[hyper.gamma, hyper.lam]),
        ];
        let count = Arg::Owned(vec![total as u32]);

        out.push(self.kernel(K::Gae, gae, (n, 64)));
        out.push(self.kernel(
            K::Moments,
            vec![b.rows.at(total), b.ctrl.arg(), Arg::Owned(vec![total as u32])],
            (REDUCE, REDUCE),
        ));
        out.push(self.kernel(
            K::Standardize,
            vec![b.rows.at(total), b.ctrl.arg(), count],
            (total, 256),
        ));
    }

    fn gather(&self, from: usize) -> Dispatch<'a> {
        let b = self.buffers;
        let mb = self.dims.minibatch;
        let args = vec![
            b.perm.arg(),
            b.obs.arg(),
            b.act.arg(),
            b.rows.arg(),
            b.mb_obs.arg(),
            b.mb_act.arg(),
            b.mb_rows.arg(),
            Arg::Owned(vec![mb as u32, from as u32, self.dims.total() as u32]),
        ];

        self.kernel(K::Gather, args, (mb, 64))
    }

    fn heads(&self, hyper: &Hyper, out: &mut Vec<Dispatch<'a>>) {
        let b = self.buffers;
        let mb = self.dims.minibatch;
        let count = || Arg::Owned(vec![mb as u32]);
        let policy = vec![
            b.actor.out.arg(),
            b.mb_act.arg(),
            b.mb_rows.arg(),
            b.params.arg(),
            b.actor.seed.arg(),
            b.parts.arg(),
            count(),
            Arg::floats(&[hyper.clip]),
        ];
        let value = vec![b.critic.out.arg(), b.mb_rows.arg(), b.critic.seed.arg(), count()];
        let sums = vec![
            b.parts.arg(),
            b.grads.arg(),
            b.ctrl.arg(),
            count(),
            Arg::floats(&[hyper.ent_coef]),
        ];

        out.push(self.kernel(K::PolicyHead, policy, (mb, 64)));
        out.push(self.kernel(K::ValueHead, value, (mb, 64)));
        out.push(self.kernel(K::HeadSums, sums, ((self.dims.nact + 1) * REDUCE, REDUCE)));
    }

    fn step_params(&self, settings: &Settings, out: &mut Vec<Dispatch<'a>>) {
        let b = self.buffers;
        let p = self.dims.nparams;
        let chunks = p.div_ceil(SQUARE_CHUNK);
        let adam = vec![
            b.params.arg(),
            b.grads.arg(),
            b.first.arg(),
            b.second.arg(),
            b.ctrl.arg(),
            Arg::floats(&[settings.log_std_min, LOG_STD_MAX]),
        ];
        let rate = vec![
            b.ctrl.arg(),
            Arg::floats(&[settings.hyper.desired_kl, LEARN_RATE_MIN, LEARN_RATE_MAX]),
        ];

        out.push(self.kernel(
            K::GradSquares,
            vec![b.grads.arg(), b.squares.arg()],
            (chunks * REDUCE, REDUCE),
        ));
        out.push(self.kernel(K::AdamBegin, vec![b.squares.arg(), b.ctrl.arg()], (REDUCE, REDUCE)));
        out.push(self.kernel(K::Adam, adam, (p, 256)));
        out.push(self.kernel(K::AdaptRate, rate, (1, 1)));
    }

    pub fn minibatch(&self, settings: &Settings, from: usize, out: &mut Vec<Dispatch<'a>>) {
        let b = self.buffers;
        let pass = self.pass(self.dims.minibatch);
        let input = Input {
            buffer: b.mb_obs,
            at: 0,
        };

        out.push(self.gather(from));
        out.extend(pass.forward(
            self.nets[0],
            &b.actor,
            &input,
            &Output {
                buffer: b.actor.out,
                at: 0,
            },
        ));
        out.extend(pass.forward(
            self.nets[1],
            &b.critic,
            &input,
            &Output {
                buffer: b.critic.out,
                at: 0,
            },
        ));
        self.heads(&settings.hyper, out);
        out.extend(pass.backward(self.nets[0], &b.actor, settings.masked));
        out.extend(pass.backward(self.nets[1], &b.critic, false));
        self.step_params(settings, out);
    }

    pub fn learn(&self, settings: &Settings) -> Vec<Dispatch<'a>> {
        let mut out = Vec::new();
        let (total, mb) = (self.dims.total(), self.dims.minibatch);

        self.advantages(&settings.hyper, &mut out);

        for epoch in 0..self.dims.epochs {
            for k in 0..settings.hyper.minibatches {
                self.minibatch(settings, epoch * total + k * mb, &mut out);
            }
        }

        out
    }
}
