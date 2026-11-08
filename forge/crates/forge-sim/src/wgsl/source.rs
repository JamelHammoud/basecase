use super::emit::WgslSink;
use crate::gpu::layout::Layout;
use crate::gpu::{prelude, BLOCK};
use crate::plan::Plan;
use std::fmt::Write;

const STAGES: [&str; 14] = [
    include_str!("shaders/df.wgsl"),
    include_str!("shaders/common.wgsl"),
    include_str!("shaders/quat.wgsl"),
    include_str!("shaders/kinematics.wgsl"),
    include_str!("shaders/inertia.wgsl"),
    include_str!("shaders/dynamics.wgsl"),
    include_str!("shaders/collide.wgsl"),
    include_str!("shaders/primitives.wgsl"),
    include_str!("shaders/rows.wgsl"),
    include_str!("shaders/assemble.wgsl"),
    include_str!("shaders/search.wgsl"),
    include_str!("shaders/bracket.wgsl"),
    include_str!("shaders/newton.wgsl"),
    include_str!("shaders/step.wgsl"),
];
const QUALIFY: &str = include_str!("shaders/qualify.wgsl");
const H_SHARED: &str = include_str!("shaders/h_shared.wgsl");
const H_DEVICE: &str = include_str!("shaders/h_device.wgsl");

pub const ENTRIES: [&str; 4] = ["step_worlds", "forward_worlds", "profile_worlds", "qualify"];

#[derive(Clone, Debug)]
pub struct Program {
    pub source: String,
    pub ints: Vec<i32>,
    pub reals: Vec<f32>,
    pub nstate: usize,
    pub nreals: usize,
    pub nints: usize,
}

pub fn layout_for(plan: &Plan, workgroup_bytes: usize) -> Layout {
    Layout::sized(plan, workgroup_bytes)
}

pub fn program(plan: &Plan, layout: &Layout) -> Program {
    let mut e = WgslSink::default();

    prelude::model(&mut e, plan, layout);

    let _ = writeln!(e.text, "const BLOCKU: u32 = {BLOCK}u;");
    let _ = writeln!(
        e.text,
        "const TG_SIZE: u32 = {}u;",
        BLOCK * (plan.nm + 2 * plan.kernel.nv).max(1)
    );

    let mut source = e.text;

    for stage in STAGES.iter().chain([&QUALIFY]) {
        source.push_str(stage);
        source.push('\n');
    }

    source.push_str(if layout.shared { H_SHARED } else { H_DEVICE });

    if e.ints.is_empty() {
        e.ints.push(0);
    }

    if e.reals.is_empty() {
        e.reals.extend([0.0, 0.0]);
    }

    Program {
        source,
        ints: e.ints,
        reals: e.reals,
        nstate: layout.nstate,
        nreals: layout.reals,
        nints: layout.nints.max(1),
    }
}
