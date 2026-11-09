use super::backward::{backward, Learners, Sweep};
use super::rollout::{collect, Policy, Rollout};
use super::{Hyper, Shac};
use crate::kernels::Math;
use crate::rng::Rng;
use crate::robot::Robot;

pub struct Check {
    pub analytic: f64,
    pub finite: f64,
}

fn rollout(shac: &mut Shac) -> Result<Rollout, String> {
    let mut policy = Policy {
        actor: &mut shac.actor,
        log_std: &shac.log_std,
        norm: &shac.norm,
        math: &shac.math,
        rng: &mut shac.rng,
    };

    collect(&mut shac.env, &mut policy, (shac.hyper.horizon, shac.hyper.smoothing))
}

fn objective(shac: &mut Shac, r: &Rollout) -> f64 {
    let gamma = shac.hyper.gamma;
    let count = shac.env.count;
    let mut weight = vec![1.0; count];
    let mut total = 0.0;

    for step in &r.steps {
        let mut terminal = vec![0.0f32; step.next_obs.len()];

        shac.norm.apply(&step.next_obs, &mut terminal);

        let at_end = shac.target.forward(&shac.math, &terminal, count);

        for e in 0..count {
            total += weight[e] * step.reward[e];

            if step.timeout[e] && !step.fell[e] {
                total += gamma * weight[e] * f64::from(at_end[e]);
            }

            weight[e] = if step.done(e) { 1.0 } else { weight[e] * gamma };
        }
    }

    let last = r.steps.last().expect("a rollout has steps");
    let values = shac.target.forward(&shac.math, &r.last_norm, count);

    for e in (0..count).filter(|e| !last.done(*e)) {
        total += weight[e] * f64::from(values[e]);
    }

    total
}

fn analytic(shac: &mut Shac, direction: &[f32]) -> Result<f64, String> {
    let r = rollout(shac)?;
    let (nq, nv) = (shac.env.plan.kernel.nq, shac.env.plan.kernel.nv);
    let sweep = Sweep {
        task: &shac.env.task,
        nq,
        nx: nq + nv,
        std: shac.norm.std(),
        gamma: shac.hyper.gamma,
    };
    let mut learners = Learners {
        actor: &mut shac.actor,
        target: &mut shac.target,
        math: &shac.math,
        norm: &shac.norm,
    };

    backward(&sweep, &r, &mut learners, &shac.log_std);

    Ok(shac
        .actor
        .grads
        .iter()
        .zip(direction)
        .map(|(g, d)| f64::from(*g) * f64::from(*d))
        .sum())
}

pub fn actor_gradient(robot: &Robot, (hyper, values): (Hyper, bool), step: f32) -> Result<Check, String> {
    let fresh = || {
        Shac::new(robot, hyper, Math::native(4)).map(|mut s| {
            if !values {
                s.target.params.fill(0.0);
            }

            s
        })
    };
    let mut base = fresh()?;
    let mut rng = Rng::new(7, 7);
    let direction: Vec<f32> = base.actor.params.iter().map(|_| rng.normal() as f32).collect();
    let analytic = analytic(&mut base, &direction)?;
    let value = |sign: f32| -> Result<f64, String> {
        let mut moved = fresh()?;

        moved
            .actor
            .params
            .iter_mut()
            .zip(&direction)
            .for_each(|(p, d)| *p += sign * step * d);

        let r = rollout(&mut moved)?;

        Ok(objective(&mut moved, &r))
    };
    let finite = (value(1.0)? - value(-1.0)?) / (2.0 * f64::from(step));

    Ok(Check { analytic, finite })
}
