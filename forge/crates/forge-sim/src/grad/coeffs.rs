use super::dual::{Dual, Real};
use crate::tables::Tables;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Wrt {
    Qpos(usize),
    Qvel(usize),
    Ctrl(usize),
    Mass(usize),
    Kp(usize),
    Kv(usize),
    Gear(usize),
    Damping(usize),
    Armature(usize),
    FrictionLoss(usize),
}

#[derive(Clone, Debug)]
pub struct Coeffs<S> {
    pub mass: Vec<S>,
    pub gain: Vec<S>,
    pub bias: Vec<[S; 3]>,
    pub gear: Vec<S>,
    pub damping: Vec<S>,
    pub armature: Vec<S>,
    pub floss: Vec<S>,
    pub friction: Vec<f64>,
}

fn lane(values: &[crate::lanes::V], l: usize) -> Vec<f64> {
    values.iter().map(|v| v.0[l]).collect()
}

impl Coeffs<f64> {
    pub fn from_lane(t: &Tables, l: usize) -> Self {
        Self {
            mass: lane(&t.mass, l),
            gain: lane(&t.gain, l),
            bias: t.bias.iter().map(|b| b.map(|v| v.0[l])).collect(),
            gear: lane(&t.gear, l),
            damping: lane(&t.damping, l),
            armature: lane(&t.armature, l),
            floss: lane(&t.floss, l),
            friction: lane(&t.friction, l),
        }
    }

    pub fn lift<S: Real>(&self) -> Coeffs<S> {
        let up = |v: &[f64]| v.iter().map(|x| S::c(*x)).collect();

        Coeffs {
            mass: up(&self.mass),
            gain: up(&self.gain),
            bias: self.bias.iter().map(|b| b.map(S::c)).collect(),
            gear: up(&self.gear),
            damping: up(&self.damping),
            armature: up(&self.armature),
            floss: up(&self.floss),
            friction: self.friction.clone(),
        }
    }
}

impl<const N: usize> Coeffs<Dual<N>> {
    pub fn seed(&mut self, wrt: Wrt, direction: usize) {
        match wrt {
            Wrt::Mass(b) => self.mass[b].du[direction] = 1.0,
            Wrt::Kp(a) => {
                self.gain[a].du[direction] = 1.0;
                self.bias[a][1].du[direction] = -1.0;
            }
            Wrt::Kv(a) => self.bias[a][2].du[direction] = -1.0,
            Wrt::Gear(a) => self.gear[a].du[direction] = 1.0,
            Wrt::Damping(d) => self.damping[d].du[direction] = 1.0,
            Wrt::Armature(d) => self.armature[d].du[direction] = 1.0,
            Wrt::FrictionLoss(d) => self.floss[d].du[direction] = 1.0,
            Wrt::Qpos(_) | Wrt::Qvel(_) | Wrt::Ctrl(_) => {}
        }
    }
}
