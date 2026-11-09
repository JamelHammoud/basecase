use super::emit::Emitter;
use crate::gpu::sink::Sink;
use forge_ir::task::{Binary, Code, Input, Observed, Op, Task, Unary};
use std::fmt::Write;

pub const RNG: &str = include_str!("shaders/rng.metal");
const KERNELS: &str = include_str!("shaders/task.metal");
pub const NEVER: i64 = i32::MAX as i64 / 2;
const SMALLEST_NORMAL: f64 = 1e-37;

fn float(x: f64) -> String {
    if x.is_nan() {
        return "NAN".to_owned();
    }

    if x.is_infinite() {
        return if x > 0.0 { "INFINITY" } else { "-INFINITY" }.to_owned();
    }

    let kept = if x != 0.0 && x.abs() < SMALLEST_NORMAL {
        SMALLEST_NORMAL.copysign(x)
    } else {
        x
    };

    format!("{:?}f", kept as f32)
}

fn input(i: Input) -> String {
    match i {
        Input::Gravity(k) => format!("s.g[{k}]"),
        Input::AngVel(k) => format!("s.w[{k}]"),
        Input::LinVel(k) => format!("s.v[{k}]"),
        Input::Command(k) => format!("s.cmd[{k}]"),
        Input::Z => "s.z".to_owned(),
        Input::Z0 => "s.z0".to_owned(),
        Input::ControlDt => "s.dt".to_owned(),
        Input::JointPos(j) => format!("s.jp[{j}]"),
        Input::JointVel(j) => format!("s.jv[{j}]"),
        Input::Action(j) => format!("s.a[{j}]"),
        Input::LastAction(j) => format!("s.la[{j}]"),
    }
}

fn unary(kind: Unary, a: &str) -> String {
    match kind {
        Unary::Negate => format!("-{a}"),
        Unary::Not => format!("({a} == 0.0f ? 1.0f : 0.0f)"),
        Unary::Exp => format!("precise::exp({a})"),
        Unary::Log => format!("precise::log({a})"),
        Unary::Sqrt => format!("precise::sqrt({a})"),
        Unary::Abs => format!("fabs({a})"),
        Unary::Tanh => format!("precise::tanh({a})"),
        Unary::Sin => format!("precise::sin({a})"),
        Unary::Cos => format!("precise::cos({a})"),
        Unary::Finite => format!("(isfinite({a}) ? {a} : 0.0f)"),
    }
}

fn truth(condition: String) -> String {
    format!("(({condition}) ? 1.0f : 0.0f)")
}

fn binary(kind: Binary, a: &str, b: &str) -> String {
    match kind {
        Binary::Add => format!("{a} + {b}"),
        Binary::Sub => format!("{a} - {b}"),
        Binary::Mul => format!("{a} * {b}"),
        Binary::Div => format!("{a} / {b}"),
        Binary::Pow => format!("precise::pow({a}, {b})"),
        Binary::Min => format!("fmin({a}, {b})"),
        Binary::Max => format!("fmax({a}, {b})"),
        Binary::SafeDiv => format!("({b} == 0.0f ? 0.0f : {a} / {b})"),
        Binary::Less => truth(format!("{a} < {b}")),
        Binary::LessEqual => truth(format!("{a} <= {b}")),
        Binary::Greater => truth(format!("{a} > {b}")),
        Binary::GreaterEqual => truth(format!("{a} >= {b}")),
        Binary::Equal => truth(format!("{a} == {b}")),
        Binary::NotEqual => truth(format!("{a} != {b}")),
        Binary::And => truth(format!("{a} != 0.0f && {b} != 0.0f")),
        Binary::Or => truth(format!("{a} != 0.0f || {b} != 0.0f")),
    }
}

fn expression(op: &Op) -> String {
    let r = |i: &usize| format!("r{i}");

    match op {
        Op::Const(v) => float(*v),
        Op::Read(i) => input(*i),
        Op::Unary(kind, a) => unary(*kind, &r(a)),
        Op::Binary(kind, a, b) => binary(*kind, &r(a), &r(b)),
        Op::Select(c, a, b) => format!("({} != 0.0f ? {} : {})", r(c), r(a), r(b)),
    }
}

pub fn function(name: &str, code: &Code) -> String {
    let mut out = format!("inline float {name}(thread const TaskState &s) {{\n");

    for (i, op) in code.ops.iter().enumerate() {
        let _ = writeln!(out, "    float r{i} = {};", expression(op));
    }

    let _ = writeln!(out, "    return r{};\n}}", code.result);

    out
}

fn observe(task: &Task) -> String {
    let mut out = String::from("inline void task_observe_one(thread const TaskState &s, device float *o) {\n");
    let mut at = 0;

    for observed in &task.observations {
        let (field, len) = match observed {
            Observed::Gravity => ("g", 3),
            Observed::AngVel => ("w", 3),
            Observed::LinVel => ("v", 3),
            Observed::Command => ("cmd", 3),
            Observed::JointOffsets => ("jp", task.nact()),
            Observed::JointVel => ("jv", task.nact()),
            Observed::LastAction => ("la", task.nact()),
        };

        let _ = writeln!(out, "    for (int k = 0; k < {len}; k++) o[{at} + k] = s.{field}[k];");
        at += len;
    }

    out.push_str("}\n");
    out
}

fn constants(e: &mut Emitter, task: &Task) {
    let joints = &task.joints;
    let gaps = task.pushes.map_or([NEVER, NEVER], |p| p.gap_steps);
    let speeds = task.pushes.map_or([0.0, 0.0], |p| p.speed);

    for (name, value) in [
        ("NACT", task.nact() as i64),
        ("NOBS", task.nobs() as i64),
        ("TASK_ROOT_QPOS", task.root_qpos as i64),
        ("TASK_ROOT_DOF", task.root_dof as i64),
        ("TASK_EPISODE", task.episode_steps),
        ("TASK_PUSHES", i64::from(task.pushes.is_some())),
        ("TASK_FALL_RESETS", i64::from(task.fall_resets)),
        ("TASK_NEVER", NEVER),
        ("PUSH_GAP_LO", gaps[0]),
        ("PUSH_GAP_HI", gaps[1]),
    ] {
        e.define(name, value);
    }

    for (name, value) in [
        ("TASK_NOISE", task.reset_noise),
        ("TASK_Z0", task.z0),
        ("TASK_DT", task.control_dt),
        ("PUSH_SPEED_LO", speeds[0]),
        ("PUSH_SPEED_HI", speeds[1]),
    ] {
        e.define(name, float(value));
    }

    e.floats("TASK_CMD", task.command.iter().map(|c| *c as f32));
    e.constant("TASK_SCALE", task.action_scale);
    e.ints("TJ_QPOS", joints.iter().map(|j| j.qpos as i64));
    e.ints("TJ_DOF", joints.iter().map(|j| j.dof as i64));
    e.ints("TJ_ACT", joints.iter().map(|j| j.actuator as i64));
    e.reals("TJ_DEFAULT", joints.iter().map(|j| j.default_pose));
    e.reals("TJ_LO", joints.iter().map(|j| j.ctrl_range[0]));
    e.reals("TJ_HI", joints.iter().map(|j| j.ctrl_range[1]));
    e.reals("CTRL_DEFAULT", task.ctrl_default.iter().copied());
}

const STATE: &str = "struct TaskState {
    float g[3];
    float w[3];
    float v[3];
    float cmd[3];
    float z;
    float z0;
    float dt;
    float jp[NACT];
    float jv[NACT];
    float a[NACT];
    float la[NACT];
};
";

pub fn source(task: &Task) -> String {
    let mut e = Emitter::default();

    constants(&mut e, task);

    let mut out = e.text;

    out.push_str(RNG);
    out.push_str(STATE);
    out.push_str(&function("task_reward", &task.reward));
    out.push_str(&function("task_fell", &task.fell));
    out.push_str(&observe(task));
    out.push_str(KERNELS);
    out
}
