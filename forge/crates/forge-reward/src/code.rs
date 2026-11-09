#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Input {
    Gravity(usize),
    AngVel(usize),
    LinVel(usize),
    Command(usize),
    Z,
    Z0,
    ControlDt,
    JointPos(usize),
    JointVel(usize),
    Action(usize),
    LastAction(usize),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Unary {
    Negate,
    Not,
    Exp,
    Log,
    Sqrt,
    Abs,
    Tanh,
    Sin,
    Cos,
    Finite,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Binary {
    Add,
    Sub,
    Mul,
    Div,
    Pow,
    Min,
    Max,
    SafeDiv,
    Less,
    LessEqual,
    Greater,
    GreaterEqual,
    Equal,
    NotEqual,
    And,
    Or,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Op {
    Const(f64),
    Read(Input),
    Unary(Unary, usize),
    Binary(Binary, usize, usize),
    Select(usize, usize, usize),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Code {
    pub ops: Vec<Op>,
    pub result: usize,
    pub terms: Vec<(String, usize)>,
}

fn truth(x: bool) -> f64 {
    f64::from(u8::from(x))
}

fn unary(kind: Unary, x: f64) -> f64 {
    match kind {
        Unary::Negate => -x,
        Unary::Not => truth(x == 0.0),
        Unary::Exp => x.exp(),
        Unary::Log => x.ln(),
        Unary::Sqrt => x.sqrt(),
        Unary::Abs => x.abs(),
        Unary::Tanh => x.tanh(),
        Unary::Sin => x.sin(),
        Unary::Cos => x.cos(),
        Unary::Finite if x.is_finite() => x,
        Unary::Finite => 0.0,
    }
}

fn binary(kind: Binary, a: f64, b: f64) -> f64 {
    match kind {
        Binary::Add => a + b,
        Binary::Sub => a - b,
        Binary::Mul => a * b,
        Binary::Div => a / b,
        Binary::Pow => a.powf(b),
        Binary::Min => a.min(b),
        Binary::Max => a.max(b),
        Binary::SafeDiv if b == 0.0 => 0.0,
        Binary::SafeDiv => a / b,
        Binary::Less => truth(a < b),
        Binary::LessEqual => truth(a <= b),
        Binary::Greater => truth(a > b),
        Binary::GreaterEqual => truth(a >= b),
        Binary::Equal => truth(a == b),
        Binary::NotEqual => truth(a != b),
        Binary::And => truth(a != 0.0 && b != 0.0),
        Binary::Or => truth(a != 0.0 || b != 0.0),
    }
}

impl Code {
    pub fn push(&mut self, op: Op) -> usize {
        self.ops.push(op);
        self.ops.len() - 1
    }

    pub fn evaluate(&self, read: impl Fn(Input) -> f64) -> f64 {
        let mut values = Vec::with_capacity(self.ops.len());

        for op in &self.ops {
            let value = match *op {
                Op::Const(v) => v,
                Op::Read(input) => read(input),
                Op::Unary(kind, x) => unary(kind, values[x]),
                Op::Binary(kind, a, b) => binary(kind, values[a], values[b]),
                Op::Select(c, a, _) if values[c] != 0.0 => values[a],
                Op::Select(_, _, b) => values[b],
            };

            values.push(value);
        }

        values.get(self.result).copied().unwrap_or(0.0)
    }
}
