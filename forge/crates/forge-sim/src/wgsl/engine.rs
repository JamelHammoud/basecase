use super::qualify::qualify;
use super::source::{layout_for, program, Program};
use crate::gpu::layout::Layout;
use crate::gpu::tables::{imps, supported};
use crate::gpu::BLOCK;
use crate::plan::Plan;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Entry {
    Step = 0,
    Forward = 1,
    Profile = 2,
    Qualify = 3,
}

pub struct Call<'a> {
    pub entry: Entry,
    pub groups: u32,
    pub params: [u32; 4],
    pub io: &'a mut [f32],
    pub order: &'a [u32],
    pub stats: &'a mut [i32],
}

pub trait Backend: Send {
    fn device(&self) -> String;
    fn workgroup_bytes(&self) -> usize;
    fn load(&mut self, program: &Program, worlds: usize) -> Result<(), String>;
    fn run(&mut self, call: Call<'_>) -> Result<f64, String>;
    fn scratch(&mut self) -> Result<Vec<f32>, String>;
}

pub struct Engine {
    pub plan: Plan,
    pub layout: Layout,
    backend: Box<dyn Backend>,
    pub io: Vec<f32>,
    pub order: Vec<u32>,
    pub stats: Vec<i32>,
    worlds: usize,
    scratch: Vec<f32>,
}

pub const QUALIFY_CASES: usize = 16;

pub fn refusal(plan: &Plan) -> Option<String> {
    imps(plan)
        .iter()
        .any(|i| !supported(i))
        .then(|| "a solimp power other than 1 or 2 needs pow, which Forge's WGSL engine doesn't evaluate".to_owned())
}

pub fn io_len(nstate: usize, worlds: usize) -> usize {
    (2 * nstate * worlds).max(2 * 8 * QUALIFY_CASES)
}

impl Engine {
    pub fn new(plan: Plan, worlds: usize, mut backend: Box<dyn Backend>) -> Result<Self, String> {
        if let Some(why) = refusal(&plan) {
            return Err(format!("Forge's WGSL engine refuses this model: {why}"));
        }

        let worlds = worlds.max(1);
        let layout = layout_for(&plan, backend.workgroup_bytes());
        let program = program(&plan, &layout);

        backend.load(&program, worlds)?;

        let mut engine = Self {
            io: vec![0.0; io_len(layout.nstate, worlds)],
            order: (0..worlds as u32).collect(),
            stats: vec![0; 2 * worlds],
            plan,
            layout,
            backend,
            worlds,
            scratch: Vec::new(),
        };

        qualify(&mut engine)?;

        Ok(engine)
    }

    pub fn device(&self) -> String {
        self.backend.device()
    }

    pub fn dispatch(&mut self, entry: Entry, params: [u32; 3]) -> Result<f64, String> {
        let groups = if entry == Entry::Qualify {
            1
        } else {
            self.worlds.div_ceil(BLOCK) as u32
        };

        self.backend.run(Call {
            entry,
            groups,
            params: [params[0], params[1], params[2], 0],
            io: &mut self.io,
            order: &self.order,
            stats: &mut self.stats,
        })
    }

    pub fn step(&mut self, nstep: usize) -> Result<f64, String> {
        self.dispatch(Entry::Step, [self.worlds as u32, nstep as u32, 0])
    }

    pub fn forward(&mut self) -> Result<f64, String> {
        self.dispatch(Entry::Forward, [self.worlds as u32, 0, 0])?;
        self.scratch = self.backend.scratch()?;

        Ok(0.0)
    }

    pub fn profile(&mut self, nstep: usize, upto: usize) -> Result<f64, String> {
        self.dispatch(Entry::Profile, [self.worlds as u32, nstep as u32, upto as u32])
    }

    pub fn field(&self, name: &str, thread: usize) -> Vec<f64> {
        let (at, len) = self.layout.at(name);
        let s = &self.scratch;

        (0..len)
            .map(|i| {
                let k = 2 * (((thread / BLOCK) * self.layout.reals + at + i) * BLOCK + thread % BLOCK);

                f64::from(s[k]) + f64::from(s[k + 1])
            })
            .collect()
    }
}
