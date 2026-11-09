use crate::tables::WorldTables;
use forge_ir::Source;

pub const EXPANDABLE: [&str; 5] = [
    "geom_friction",
    "body_mass",
    "actuator_gainprm",
    "actuator_biasprm",
    "actuator_gear",
];
const FIELDS: usize = EXPANDABLE.len();
const PARAM_WIDTH: usize = 10;
const GEAR_WIDTH: usize = 6;

#[derive(Clone, Debug, Default)]
struct World {
    mass: Vec<f64>,
    friction: Vec<f64>,
    gain: Vec<f64>,
    bias: Vec<[f64; 3]>,
    gear: Vec<f64>,
}

pub struct WorldParams {
    nsim: usize,
    nu: usize,
    defaults: [Vec<f64>; FIELDS],
    expanded: [Option<Vec<f64>>; FIELDS],
    worlds: Vec<World>,
    nominal: World,
    dirty: bool,
}

fn read(model: &dyn Source, name: &str) -> Result<Vec<f64>, String> {
    model
        .f64s(name)
        .map(<[f64]>::to_vec)
        .ok_or_else(|| format!("This MuJoCo build has no model field {name}"))
}

fn compact(tables: [&[f64]; FIELDS], nu: usize) -> World {
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
        gear: (0..nu).map(|a| tables[4][GEAR_WIDTH * a]).collect(),
    }
}

impl WorldParams {
    pub fn new(model: &dyn Source, nsim: usize) -> Result<Self, String> {
        let mut defaults: [Vec<f64>; FIELDS] = Default::default();

        for (slot, name) in defaults.iter_mut().zip(EXPANDABLE) {
            *slot = read(model, name)?;
        }

        let nu = model.size("nu").ok_or("This MuJoCo build has no nu")? as usize;
        let nominal = compact(std::array::from_fn(|k| defaults[k].as_slice()), nu);

        Ok(Self {
            nsim,
            nu,
            defaults,
            expanded: Default::default(),
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
            .map(|s| compact(std::array::from_fn(|k| self.table(k, s)), self.nu))
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
            gear: &w.gear,
        }
    }
}
