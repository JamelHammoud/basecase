use super::actuators::options;
use super::emit::Emitter;
use super::layout::Layout;
use super::tables;
use crate::params::MIN_VAL;
use crate::plan::Plan;

const DF: &str = include_str!("shaders/df.metal");
const STAGES: [&str; 11] = [
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
];

const TRIG_S: [f64; 6] = [
    -1.666_666_666_666_663_2e-1,
    8.333_333_333_322_49e-3,
    -1.984_126_982_985_795e-4,
    2.755_731_370_707_007e-6,
    -2.505_076_025_340_686_3e-8,
    1.589_690_995_211_55e-10,
];
const TRIG_C: [f64; 6] = [
    4.166_666_666_666_66e-2,
    -1.388_888_888_887_411e-3,
    2.480_158_728_947_673e-5,
    -2.755_731_435_139_066_3e-7,
    2.087_572_321_298_175e-9,
    -1.135_964_755_778_819_5e-11,
];

fn constants(e: &mut Emitter) {
    e.constant("MIN_VAL", MIN_VAL);
    e.constant("MIN_MU", 1e-5);
    e.constant("MAX_VAL", 1e10);
    e.constant("TWO_OVER_PI", std::f64::consts::FRAC_2_PI);
    e.constant("TRIG_PIO2_1", 1.570_796_326_734_125_6);
    e.constant("TRIG_PIO2_1T", 6.077_100_506_506_192e-11);
    e.constant("SQRT3_HALF", 3f64.sqrt() / 2.0);

    for (i, s) in TRIG_S.iter().enumerate() {
        e.constant(&format!("TRIG_S{i}"), *s);
    }

    for (i, c) in TRIG_C.iter().enumerate() {
        e.constant(&format!("TRIG_C{i}"), *c);
    }

    for (name, value) in [
        ("KIND_FREE", 0),
        ("KIND_SLIDE", 2),
        ("FRAME_NONE", 0),
        ("FRAME_BODY", 1),
        ("FRAME_INERTIA", 2),
        ("FRAME_BODYROT", 3),
        ("MIX_MAX", 0),
        ("MIX_FIRST", 1),
        ("COLLIDER_CONVEX", 0),
        ("COLLIDER_SPHERE", 1),
        ("COLLIDER_CAPSULE", 2),
        ("COLLIDER_CYLINDER", 3),
    ] {
        e.define(name, value);
    }
}

fn sizes(e: &mut Emitter, plan: &Plan) {
    let k = &plan.kernel;

    for (name, value) in [
        ("NBODY", plan.nbody),
        ("NJNT", k.joints.len()),
        ("NGEOM", k.geoms.len()),
        ("NQ", k.nq),
        ("NV", k.nv),
        ("NU", k.nu),
        ("NM", plan.nm),
        ("NPAIR", k.pairs.len()),
        ("NFRIC", plan.friction.len()),
        ("NLIM", plan.limits.len()),
        ("NROWS", plan.nrows),
    ] {
        e.define(name, value);
    }
}

pub fn source(plan: &Plan, layout: &Layout) -> String {
    let mut e = Emitter::default();

    sizes(&mut e, plan);
    layout.emit(&mut e);
    constants(&mut e);
    options(&mut e, plan);
    tables::emit(&mut e, plan);

    let mut out = String::with_capacity(DF.len() + e.text.len() + 64 * 1024);

    out.push_str(DF);
    out.push_str(&e.text);

    for stage in STAGES {
        out.push_str(stage);
        out.push('\n');
    }

    out
}
