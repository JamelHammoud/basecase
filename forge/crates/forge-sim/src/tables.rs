use crate::lanes::V;
use forge_ir::Kernel;

#[derive(Clone, Debug)]
pub struct Tables {
    pub mass: Vec<V>,
    pub friction: Vec<V>,
    pub gain: Vec<V>,
    pub bias: Vec<[V; 3]>,
    pub gear: Vec<V>,
    pub damping: Vec<V>,
    pub armature: Vec<V>,
    pub floss: Vec<V>,
}

impl Tables {
    pub fn new(k: &Kernel) -> Self {
        Self {
            mass: k.bodies.iter().map(|b| V::splat(b.mass)).collect(),
            friction: k.geoms.iter().map(|g| V::splat(g.friction[0])).collect(),
            gain: k.actuators.iter().map(|a| V::splat(a.gain)).collect(),
            bias: k.actuators.iter().map(|a| a.bias.map(V::splat)).collect(),
            gear: k.actuators.iter().map(|a| V::splat(a.gear)).collect(),
            damping: k.dofs.iter().map(|d| V::splat(d.damping)).collect(),
            armature: k.dofs.iter().map(|d| V::splat(d.armature)).collect(),
            floss: k
                .dofs
                .iter()
                .map(|d| V::splat(d.friction.as_ref().map_or(0.0, |f| f.loss)))
                .collect(),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct WorldTables<'a> {
    pub mass: &'a [f64],
    pub friction: &'a [f64],
    pub gain: &'a [f64],
    pub bias: &'a [[f64; 3]],
    pub gear: &'a [f64],
}

#[derive(Clone, Copy, Debug)]
pub struct DofTables<'a> {
    pub damping: &'a [f64],
    pub armature: &'a [f64],
    pub floss: &'a [f64],
}

fn set(table: &mut [V], lane: usize, values: &[f64]) {
    for (t, v) in table.iter_mut().zip(values) {
        t.0[lane] = *v;
    }
}

impl Tables {
    pub fn set_lane(&mut self, lane: usize, w: &WorldTables) {
        set(&mut self.mass, lane, w.mass);
        set(&mut self.friction, lane, w.friction);
        set(&mut self.gain, lane, w.gain);
        set(&mut self.gear, lane, w.gear);

        for (t, v) in self.bias.iter_mut().zip(w.bias) {
            for c in 0..3 {
                t[c].0[lane] = v[c];
            }
        }
    }

    pub fn set_dofs(&mut self, lane: usize, d: &DofTables) {
        set(&mut self.damping, lane, d.damping);
        set(&mut self.armature, lane, d.armature);
        set(&mut self.floss, lane, d.floss);
    }
}
