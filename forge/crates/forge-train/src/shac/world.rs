use forge_ir::task::{Binary, Code, Input, Observed, Op, Task, Unary};
use forge_sim::grad::{Dual, Real};

pub const WIDTH: usize = 16;

type D = Dual<WIDTH>;

pub fn rotate_into_frame<S: Real>(q: &[S], v: [S; 3]) -> [S; 3] {
    let (w, x, y, z) = (q[0], q[1], q[2], q[3]);
    let scale = w * w * 2.0 - S::c(1.0);
    let cross = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]];
    let along = (x * v[0] + y * v[1] + z * v[2]) * 2.0;

    [
        v[0] * scale - cross[0] * w * 2.0 + x * along,
        v[1] * scale - cross[1] * w * 2.0 + y * along,
        v[2] * scale - cross[2] * w * 2.0 + z * along,
    ]
}

pub struct Frame<'a, S> {
    pub qpos: &'a [S],
    pub qvel: &'a [S],
}

impl<S: Real> Frame<'_, S> {
    fn quat(&self, task: &Task) -> &[S] {
        &self.qpos[task.root_qpos + 3..task.root_qpos + 7]
    }

    fn gravity(&self, task: &Task) -> [S; 3] {
        rotate_into_frame(self.quat(task), [S::c(0.0), S::c(0.0), S::c(-1.0)])
    }

    fn linvel(&self, task: &Task) -> [S; 3] {
        let d = task.root_dof;

        rotate_into_frame(self.quat(task), [self.qvel[d], self.qvel[d + 1], self.qvel[d + 2]])
    }

    fn angvel(&self, task: &Task, k: usize) -> S {
        self.qvel[task.root_dof + 3 + k]
    }

    fn joint(&self, task: &Task, j: usize) -> S {
        let joint = &task.joints[j];

        self.qpos[joint.qpos] - S::c(joint.default_pose)
    }
}

pub fn observe<S: Real>(task: &Task, frame: &Frame<S>, last: &[S]) -> Vec<S> {
    let mut out = Vec::with_capacity(task.nobs());

    for observed in &task.observations {
        match observed {
            Observed::Gravity => out.extend(frame.gravity(task)),
            Observed::AngVel => out.extend((0..3).map(|k| frame.angvel(task, k))),
            Observed::LinVel => out.extend(frame.linvel(task)),
            Observed::Command => out.extend(task.command.map(S::c)),
            Observed::JointOffsets => out.extend((0..task.nact()).map(|j| frame.joint(task, j))),
            Observed::JointVel => out.extend(task.joints.iter().map(|j| frame.qvel[j.dof])),
            Observed::LastAction => out.extend(last.iter().copied()),
        }
    }

    out
}

pub struct Actions<'a, S> {
    pub action: &'a [S],
    pub last: &'a [S],
}

fn read<S: Real>(task: &Task, frame: &Frame<S>, actions: &Actions<S>, input: Input) -> S {
    match input {
        Input::Gravity(k) => frame.gravity(task)[k],
        Input::AngVel(k) => frame.angvel(task, k),
        Input::LinVel(k) => frame.linvel(task)[k],
        Input::Command(k) => S::c(task.command[k]),
        Input::Z => frame.qpos[task.root_qpos + 2],
        Input::Z0 => S::c(task.z0),
        Input::ControlDt => S::c(task.control_dt),
        Input::JointPos(j) => frame.joint(task, j),
        Input::JointVel(j) => frame.qvel[task.joints[j].dof],
        Input::Action(j) => actions.action[j],
        Input::LastAction(j) => actions.last[j],
    }
}

fn truth<S: Real>(x: bool) -> S {
    S::c(f64::from(u8::from(x)))
}

fn tanh<S: Real>(x: S) -> S {
    let e = (x * 2.0).exp();

    S::c(1.0) - S::c(2.0) / (e + S::c(1.0))
}

fn unary<S: Real>(kind: Unary, x: S) -> S {
    match kind {
        Unary::Negate => -x,
        Unary::Not => truth(x.re() == 0.0),
        Unary::Exp => x.exp(),
        Unary::Log => (x - S::c(1.0)).ln_1p(),
        Unary::Sqrt => x.sqrt(),
        Unary::Abs if x.re() < 0.0 => -x,
        Unary::Abs => x,
        Unary::Tanh => tanh(x),
        Unary::Sin => x.sin_cos().0,
        Unary::Cos => x.sin_cos().1,
        Unary::Finite if x.re().is_finite() => x,
        Unary::Finite => S::c(0.0),
    }
}

fn power<S: Real>(a: S, b: S) -> S {
    let k = b.re();

    if k.fract() == 0.0 && (0.0..=8.0).contains(&k) {
        return (0..k as usize).fold(S::c(1.0), |acc, _| acc * a);
    }

    ((a - S::c(1.0)).ln_1p() * b).exp()
}

fn binary<S: Real>(kind: Binary, a: S, b: S) -> S {
    let (x, y) = (a.re(), b.re());

    match kind {
        Binary::Add => a + b,
        Binary::Sub => a - b,
        Binary::Mul => a * b,
        Binary::Div => a / b,
        Binary::Pow => power(a, b),
        Binary::Min if x <= y => a,
        Binary::Max if x >= y => a,
        Binary::Min | Binary::Max => b,
        Binary::SafeDiv if y == 0.0 => S::c(0.0),
        Binary::SafeDiv => a / b,
        Binary::Less => truth(x < y),
        Binary::LessEqual => truth(x <= y),
        Binary::Greater => truth(x > y),
        Binary::GreaterEqual => truth(x >= y),
        Binary::Equal => truth(x == y),
        Binary::NotEqual => truth(x != y),
        Binary::And => truth(x != 0.0 && y != 0.0),
        Binary::Or => truth(x != 0.0 || y != 0.0),
    }
}

pub fn run<S: Real>(code: &Code, task: &Task, (frame, actions): (&Frame<S>, &Actions<S>)) -> S {
    let mut values: Vec<S> = Vec::with_capacity(code.ops.len());

    for op in &code.ops {
        let value = match *op {
            Op::Const(v) => S::c(v),
            Op::Read(input) => read(task, frame, actions, input),
            Op::Unary(kind, x) => unary(kind, values[x]),
            Op::Binary(kind, a, b) => binary(kind, values[a], values[b]),
            Op::Select(c, a, _) if values[c].re() != 0.0 => values[a],
            Op::Select(_, _, b) => values[b],
        };

        values.push(value);
    }

    values.get(code.result).copied().unwrap_or(S::c(0.0))
}

pub struct Linear {
    pub values: Vec<f64>,
    pub jacobian: Vec<f64>,
}

pub fn linearize(point: &[f64], outputs: usize, f: impl Fn(&[D]) -> Vec<D>) -> Linear {
    let n = point.len();
    let mut out = Linear {
        values: vec![0.0; outputs],
        jacobian: vec![0.0; outputs * n],
    };

    for start in (0..n).step_by(WIDTH) {
        let inputs: Vec<D> = point
            .iter()
            .enumerate()
            .map(|(i, &v)| match i.checked_sub(start) {
                Some(k) if k < WIDTH => D::seeded(v, k),
                _ => D::constant(v),
            })
            .collect();
        let result = f(&inputs);

        for (o, value) in result.iter().enumerate() {
            out.values[o] = value.re;

            for k in 0..WIDTH.min(n - start) {
                out.jacobian[o * n + start + k] = value.du[k];
            }
        }
    }

    out
}
