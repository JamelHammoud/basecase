use crate::lanes::{LANES, V};
use crate::plan::Plan;
use crate::state::State;
use crate::step::{forward, step, Workspace};
use forge_ir::Kernel;

pub struct Sim {
    pub plan: Plan,
    pub states: Vec<State>,
    pub worlds: usize,
    work: Workspace,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Snapshot {
    pub qpos: Vec<f64>,
    pub qvel: Vec<f64>,
    pub xpos: Vec<f64>,
    pub cinert: Vec<f64>,
    pub qfrc_bias: Vec<f64>,
    pub qacc: Vec<f64>,
    pub ncon: usize,
}

fn lane(values: &[V], l: usize) -> Vec<f64> {
    values.iter().map(|v| v.0[l]).collect()
}

pub fn locate(world: usize) -> (usize, usize) {
    (world / LANES, world % LANES)
}

impl Sim {
    pub fn new(kernel: Kernel, worlds: usize) -> Self {
        let plan = Plan::new(kernel);
        let states = (0..worlds.div_ceil(LANES)).map(|_| State::new(&plan)).collect();
        let work = Workspace::new(&plan);

        Self {
            plan,
            states,
            worlds,
            work,
        }
    }

    pub fn workspace(&self) -> Workspace {
        Workspace::new(&self.plan)
    }

    pub fn set_ctrl(&mut self, world: usize, ctrl: &[f64]) {
        let (b, l) = locate(world);

        self.states[b].set_ctrl(l, ctrl);
    }

    pub fn reset(&mut self, world: usize, qpos: &[f64]) {
        let (b, l) = locate(world);

        self.states[b].reset(&self.plan, l, qpos);
    }

    pub fn state(&self, world: usize) -> Snapshot {
        let (b, l) = locate(world);
        let s = &self.states[b];

        Snapshot {
            qpos: lane(&s.qpos, l),
            qvel: lane(&s.qvel, l),
            xpos: Vec::new(),
            cinert: Vec::new(),
            qfrc_bias: Vec::new(),
            qacc: lane(&s.warm, l),
            ncon: 0,
        }
    }

    pub fn forward_snapshot(&mut self, world: usize) -> Snapshot {
        let (b, l) = locate(world);

        forward(&self.plan, &mut self.states[b], &mut self.work);

        let k = &self.work.block;

        Snapshot {
            xpos: lane(&k.xpos, l),
            cinert: lane(&k.cinert, l),
            qfrc_bias: lane(&k.qfrc_bias, l),
            qacc: lane(&k.qacc, l),
            ncon: k.ncon.0[l] as usize,
            ..self.state(world)
        }
    }

    pub fn step(&mut self) {
        for s in &mut self.states {
            step(&self.plan, s, &mut self.work);
        }
    }

    pub fn step_parallel(&mut self, workspaces: &mut [Workspace]) {
        let plan = &self.plan;
        let per = self.states.len().div_ceil(workspaces.len().max(1));

        std::thread::scope(|scope| {
            for (chunk, w) in self.states.chunks_mut(per.max(1)).zip(workspaces.iter_mut()) {
                scope.spawn(move || {
                    for s in chunk {
                        step(plan, s, w);
                    }
                });
            }
        });
    }
}
