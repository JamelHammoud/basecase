use super::emit::Emitter;
use crate::gpu::layout::Layout;
use crate::gpu::prelude;
use crate::plan::Plan;

const DF: &str = include_str!("shaders/df.metal");
const STAGES: [&str; 12] = [
    include_str!("shaders/common.metal"),
    include_str!("shaders/kinematics.metal"),
    include_str!("shaders/inertia.metal"),
    include_str!("shaders/dynamics.metal"),
    include_str!("shaders/collide.metal"),
    include_str!("shaders/primitives.metal"),
    include_str!("shaders/rows.metal"),
    include_str!("shaders/assemble.metal"),
    include_str!("shaders/search.metal"),
    include_str!("shaders/newton.metal"),
    include_str!("shaders/step.metal"),
    include_str!("shaders/qualify.metal"),
];

pub fn source(plan: &Plan, layout: &Layout) -> String {
    let mut e = Emitter::default();

    prelude::model(&mut e, plan, layout);

    let mut out = String::with_capacity(DF.len() + e.text.len() + 64 * 1024);

    out.push_str(DF);
    out.push_str(&e.text);

    for stage in STAGES {
        out.push_str(stage);
        out.push('\n');
    }

    out
}
