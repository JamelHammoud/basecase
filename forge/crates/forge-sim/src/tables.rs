use crate::lanes::V;
use forge_ir::Kernel;

#[derive(Clone, Debug)]
pub struct Tables {
    pub mass: Vec<V>,
    pub friction: Vec<V>,
    pub gain: Vec<V>,
    pub bias: Vec<[V; 3]>,
}

impl Tables {
    pub fn new(k: &Kernel) -> Self {
        Self {
            mass: k.bodies.iter().map(|b| V::splat(b.mass)).collect(),
            friction: k.geoms.iter().map(|g| V::splat(g.friction[0])).collect(),
            gain: k.actuators.iter().map(|a| V::splat(a.gain)).collect(),
            bias: k.actuators.iter().map(|a| a.bias.map(V::splat)).collect(),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct WorldTables<'a> {
    pub mass: &'a [f64],
    pub friction: &'a [f64],
    pub gain: &'a [f64],
    pub bias: &'a [[f64; 3]],
}

impl Tables {
    pub fn set_lane(&mut self, lane: usize, w: &WorldTables) {
        for (t, v) in self.mass.iter_mut().zip(w.mass) {
            t.0[lane] = *v;
        }

        for (t, v) in self.friction.iter_mut().zip(w.friction) {
            t.0[lane] = *v;
        }

        for (t, v) in self.gain.iter_mut().zip(w.gain) {
            t.0[lane] = *v;
        }

        for (t, v) in self.bias.iter_mut().zip(w.bias) {
            for c in 0..3 {
                t[c].0[lane] = v[c];
            }
        }
    }
}
