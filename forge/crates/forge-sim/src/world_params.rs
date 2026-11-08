use crate::tables::WorldTables;
use forge_mujoco::Model;

pub const EXPANDABLE: [&str; 4] = ["geom_friction", "body_mass", "actuator_gainprm", "actuator_biasprm"];
const PARAM_WIDTH: usize = 10;

#[derive(Clone, Debug, Default)]
struct World {
    mass: Vec<f64>,
    friction: Vec<f64>,
    gain: Vec<f64>,
    bias: Vec<[f64; 3]>,
}

pub struct WorldParams {
    nsim: usize,
    nu: usize,
    defaults: [Vec<f64>; 4],
    expanded: [Option<Vec<f64>>; 4],
    worlds: Vec<World>,
    nominal: World,
    dirty: bool,
}

fn read(model: &Model, name: &str) -> Result<Vec<f64>, String> {
    model
        .array(name)
        .and_then(|a| a.f64s())
        .map(<[f64]>::to_vec)
        .ok_or_else(|| format!("This MuJoCo build has no model field {name}"))
}

fn compact(tables: [&[f64]; 4], nu: usize) -> World {
    World {
        friction: tables[0].iter().step_by(3).copied().collect(),
        mass: tables[1].to_vec(),
        gain: (0..nu).map(|a| tables[2][PARAM_WIDTH * a]).collect(),
        bias: (0..nu)
            .map(|a| {
                let p = &tables[3][PARAM_WIDTH * a..];

                [p[0], p[1], p[2]]
            })
            .collect(),
    }
}

impl WorldParams {
    pub fn new(model: &Model, nsim: usize) -> Result<Self, String> {
        let defaults = [
            read(model, EXPANDABLE[0])?,
            read(model, EXPANDABLE[1])?,
            read(model, EXPANDABLE[2])?,
            read(model, EXPANDABLE[3])?,
        ];
        let nu = model.nu();
        let nominal = compact([&defaults[0], &defaults[1], &defaults[2], &defaults[3]], nu);

        Ok(Self {
            nsim,
            nu,
            defaults,
            expanded: [None, None, None, None],
            worlds: Vec::new(),
            nominal,
            dirty: false,
        })
    }

    pub fn expand(&mut self, field: &str) -> Result<(&mut [f64], usize), String> {
        let k = EXPANDABLE
            .iter()
            .position(|f| *f == field)
            .ok_or_else(|| format!("Forge's engine can't vary {field} per robot"))?;
        let width = self.defaults[k].len();
        let (nsim, defaults) = (self.nsim, &self.defaults[k]);
        let values = self.expanded[k].get_or_insert_with(|| defaults.repeat(nsim));

        self.dirty = true;

        Ok((values.as_mut_slice(), width))
    }

    fn table(&self, k: usize, sim: usize) -> &[f64] {
        let width = self.defaults[k].len();

        match &self.expanded[k] {
            Some(values) => &values[sim * width..(sim + 1) * width],
            None => &self.defaults[k],
        }
    }

    pub fn refresh(&mut self) {
        if !self.dirty {
            return;
        }

        self.worlds = (0..self.nsim)
            .map(|s| {
                compact(
                    [self.table(0, s), self.table(1, s), self.table(2, s), self.table(3, s)],
                    self.nu,
                )
            })
            .collect();
        self.dirty = false;
    }

    pub fn view(&self, sim: usize) -> WorldTables<'_> {
        let w = self.worlds.get(sim).unwrap_or(&self.nominal);

        WorldTables {
            mass: &w.mass,
            friction: &w.friction,
            gain: &w.gain,
            bias: &w.bias,
        }
    }
}
