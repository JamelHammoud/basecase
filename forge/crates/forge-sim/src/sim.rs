use crate::block::Block;
use crate::lanes::{LANES, V};
use crate::plan::Plan;
use crate::step::{forward, step, Workspace};
use forge_ir::Kernel;

pub struct Sim {
    pub plan: Plan,
    pub blocks: Vec<Block>,
    pub worlds: usize,
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

impl Sim {
    pub fn new(kernel: Kernel, worlds: usize) -> Self {
        let plan = Plan::new(kernel);
        let blocks = (0..worlds.div_ceil(LANES)).map(|_| Block::new(&plan)).collect();

        Self { plan, blocks, worlds }
    }

    pub fn workspace(&self) -> Workspace {
        Workspace::new(&self.plan)
    }

    fn at(world: usize) -> (usize, usize) {
        (world / LANES, world % LANES)
    }

    pub fn set_ctrl(&mut self, world: usize, ctrl: &[f64]) {
        let (b, l) = Self::at(world);

        for (c, v) in self.blocks[b].ctrl.iter_mut().zip(ctrl) {
            c.0[l] = *v;
        }
    }

    pub fn set_state(&mut self, world: usize, qpos: &[f64], qvel: &[f64]) {
        let (b, l) = Self::at(world);
        let block = &mut self.blocks[b];

        for (q, v) in block.qpos.iter_mut().zip(qpos) {
            q.0[l] = *v;
        }

        for (q, v) in block.qvel.iter_mut().zip(qvel) {
            q.0[l] = *v;
        }
    }

    pub fn snapshot(&self, world: usize) -> Snapshot {
        let (b, l) = Self::at(world);
        let block = &self.blocks[b];

        Snapshot {
            qpos: lane(&block.qpos, l),
            qvel: lane(&block.qvel, l),
            xpos: lane(&block.xpos, l),
            cinert: lane(&block.cinert, l),
            qfrc_bias: lane(&block.qfrc_bias, l),
            qacc: lane(&block.qacc, l),
            ncon: block.ncon.0[l] as usize,
        }
    }

    pub fn forward(&mut self, w: &mut Workspace) {
        for b in &mut self.blocks {
            forward(&self.plan, b, w);
        }
    }

    pub fn step(&mut self, w: &mut Workspace) {
        for b in &mut self.blocks {
            step(&self.plan, b, w);
        }
    }

    pub fn step_parallel(&mut self, workspaces: &mut [Workspace]) {
        let plan = &self.plan;
        let per = self.blocks.len().div_ceil(workspaces.len().max(1));

        std::thread::scope(|scope| {
            for (chunk, w) in self.blocks.chunks_mut(per.max(1)).zip(workspaces.iter_mut()) {
                scope.spawn(move || {
                    for b in chunk {
                        step(plan, b, w);
                    }
                });
            }
        });
    }
}
