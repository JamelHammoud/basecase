use crate::ast::{BinaryOp, CompareOp, LogicOp};
use crate::check::Program;
use crate::ir::{BodyField, Elementwise, Node, Pairwise, Reduction, StateField};
use crate::state::RewardState;

const EXP_LIMIT: f64 = 80.0;
const LOG_FLOOR: f64 = 1e-300;

#[derive(Clone, Debug)]
enum Value {
    Number(f64),
    Vector(Vec<f64>),
    Truth(bool),
    Nothing,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TermValue {
    pub name: String,
    pub value: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Evaluation {
    pub total: f64,
    pub terms: Vec<TermValue>,
    pub blamed: Vec<String>,
}

struct Run<'a> {
    program: &'a Program,
    state: &'a RewardState<'a>,
    terms: Vec<TermValue>,
    blamed: Vec<String>,
}

fn apply(kind: Elementwise, x: f64) -> f64 {
    match kind {
        Elementwise::Exp => x.min(EXP_LIMIT).exp(),
        Elementwise::Log => x.max(LOG_FLOOR).ln(),
        Elementwise::Sqrt => x.max(0.0).sqrt(),
        Elementwise::Abs => x.abs(),
        Elementwise::Tanh => x.tanh(),
        Elementwise::Sin => x.sin(),
        Elementwise::Cos => x.cos(),
        Elementwise::Square => x * x,
    }
}

fn pair(kind: Pairwise, a: f64, b: f64) -> f64 {
    match kind {
        Pairwise::Min => a.min(b),
        Pairwise::Max => a.max(b),
        Pairwise::SafeDiv if b == 0.0 => 0.0,
        Pairwise::SafeDiv => a / b,
    }
}

fn arithmetic(op: BinaryOp, a: f64, b: f64) -> f64 {
    match op {
        BinaryOp::Add => a + b,
        BinaryOp::Sub => a - b,
        BinaryOp::Mul => a * b,
        BinaryOp::Div => a / b,
        BinaryOp::Pow => a.powf(b),
    }
}

fn compare(op: CompareOp, a: f64, b: f64) -> bool {
    match op {
        CompareOp::Less => a < b,
        CompareOp::LessEqual => a <= b,
        CompareOp::Greater => a > b,
        CompareOp::GreaterEqual => a >= b,
        CompareOp::Equal => a == b,
        CompareOp::NotEqual => a != b,
    }
}

fn reduce(kind: Reduction, values: &[f64]) -> f64 {
    match kind {
        Reduction::Sum => values.iter().sum(),
        Reduction::Mean if values.is_empty() => 0.0,
        Reduction::Mean => values.iter().sum::<f64>() / values.len() as f64,
        Reduction::Min => values.iter().copied().fold(f64::INFINITY, f64::min),
        Reduction::Max => values.iter().copied().fold(f64::NEG_INFINITY, f64::max),
        Reduction::Norm => values.iter().map(|v| v * v).sum::<f64>().sqrt(),
    }
}

fn zip_with(a: Value, b: Value, f: impl Fn(f64, f64) -> f64) -> Value {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => Value::Number(f(x, y)),
        (Value::Vector(v), Value::Number(y)) => Value::Vector(v.iter().map(|x| f(*x, y)).collect()),
        (Value::Number(x), Value::Vector(w)) => Value::Vector(w.iter().map(|y| f(x, *y)).collect()),
        (Value::Vector(v), Value::Vector(w)) => Value::Vector(v.iter().zip(&w).map(|(x, y)| f(*x, *y)).collect()),
        _ => Value::Nothing,
    }
}

fn map(value: Value, f: impl Fn(f64) -> f64) -> Value {
    match value {
        Value::Number(x) => Value::Number(f(x)),
        Value::Vector(v) => Value::Vector(v.into_iter().map(f).collect()),
        other => other,
    }
}

fn number(value: Value) -> f64 {
    match value {
        Value::Number(x) => x,
        _ => f64::NAN,
    }
}

fn truth(value: Value) -> bool {
    matches!(value, Value::Truth(true))
}

fn vector(value: Value) -> Vec<f64> {
    match value {
        Value::Vector(v) => v,
        Value::Number(x) => vec![x],
        _ => Vec::new(),
    }
}

impl Run<'_> {
    fn field(&self, field: StateField) -> Value {
        let s = self.state;

        match field {
            StateField::Gravity => Value::Vector(s.gravity.to_vec()),
            StateField::AngVel => Value::Vector(s.angvel.to_vec()),
            StateField::LinVel => Value::Vector(s.linvel.to_vec()),
            StateField::Command => Value::Vector(s.command.to_vec()),
            StateField::Z => Value::Number(s.z),
            StateField::Z0 => Value::Number(s.z0),
            StateField::ControlDt => Value::Number(s.control_dt),
            StateField::JointPos => Value::Vector(s.joint_pos.to_vec()),
            StateField::JointVel => Value::Vector(s.joint_vel.to_vec()),
            StateField::Action => Value::Vector(s.action.to_vec()),
            StateField::LastAction => Value::Vector(s.last_action.to_vec()),
        }
    }

    fn body(&self, frame: &[Value], slot: usize, field: BodyField) -> Value {
        let Value::Number(index) = frame[slot] else {
            return Value::Nothing;
        };
        let body = self.state.bodies[index as usize];

        match field {
            BodyField::Pos => Value::Vector(body.pos.to_vec()),
            BodyField::Vel => Value::Vector(body.vel.to_vec()),
            BodyField::Z => Value::Number(body.pos[2]),
        }
    }

    fn gather(&mut self, frame: &mut [Value], kind: Reduction, slot: usize, element: &Node) -> Value {
        let mut values = Vec::with_capacity(self.state.bodies.len());

        for index in 0..self.state.bodies.len() {
            frame[slot] = Value::Number(index as f64);
            values.push(number(self.eval(frame, element)));
        }

        Value::Number(reduce(kind, &values))
    }

    fn term(&mut self, frame: &mut [Value], index: usize, inner: &Node) -> Value {
        let raw = number(self.eval(frame, inner));
        let name = self.program.terms[index].clone();
        let value = if raw.is_finite() { raw } else { 0.0 };

        if !raw.is_finite() {
            self.blamed.push(name.clone());
        }

        self.terms.push(TermValue { name, value });

        Value::Number(value)
    }

    fn call(&mut self, function: usize, args: &[Node], frame: &mut [Value]) -> Value {
        let compiled = &self.program.functions[function];
        let mut inner = vec![Value::Nothing; compiled.slots.max(args.len())];

        for (slot, arg) in args.iter().enumerate() {
            inner[slot] = self.eval(frame, arg);
        }

        for (slot, node) in &compiled.assignments {
            inner[*slot] = self.eval(&mut inner, node);
        }

        self.eval(&mut inner, &compiled.result)
    }

    fn eval(&mut self, frame: &mut [Value], node: &Node) -> Value {
        match node {
            Node::Number(v) => Value::Number(*v),
            Node::Truth(b) => Value::Truth(*b),
            Node::Local(slot) => frame[*slot].clone(),
            Node::State | Node::Bodies => Value::Nothing,
            Node::Field(field) => self.field(*field),
            Node::Body(slot, field) => self.body(frame, *slot, *field),
            Node::Index(inner, at) => Value::Number(vector(self.eval(frame, inner))[*at]),
            Node::Slice(inner, from, to) => Value::Vector(vector(self.eval(frame, inner))[*from..*to].to_vec()),
            Node::Negate(inner) => map(self.eval(frame, inner), |x| -x),
            Node::Not(inner) => Value::Truth(!truth(self.eval(frame, inner))),
            Node::Binary(op, a, b) => {
                let (a, b) = (self.eval(frame, a), self.eval(frame, b));

                zip_with(a, b, |x, y| arithmetic(*op, x, y))
            }
            Node::Power(inner, power) => map(self.eval(frame, inner), |x| x.powi(*power)),
            Node::Compare(op, a, b) => {
                let (a, b) = (number(self.eval(frame, a)), number(self.eval(frame, b)));

                Value::Truth(compare(*op, a, b))
            }
            Node::Logic(LogicOp::And, a, b) => Value::Truth(truth(self.eval(frame, a)) && truth(self.eval(frame, b))),
            Node::Logic(LogicOp::Or, a, b) => Value::Truth(truth(self.eval(frame, a)) || truth(self.eval(frame, b))),
            Node::Choose(condition, yes, no) => {
                let branch = if truth(self.eval(frame, condition)) { yes } else { no };

                self.eval(frame, branch)
            }
            Node::Apply(kind, inner) => map(self.eval(frame, inner), |x| apply(*kind, x)),
            Node::Pair(kind, a, b) => {
                let (a, b) = (self.eval(frame, a), self.eval(frame, b));

                zip_with(a, b, |x, y| pair(*kind, x, y))
            }
            Node::Clamp(x, low, high) => {
                let (x, low, high) = (self.eval(frame, x), self.eval(frame, low), self.eval(frame, high));

                zip_with(zip_with(x, low, f64::max), high, f64::min)
            }
            Node::Dot(a, b) => {
                let (a, b) = (vector(self.eval(frame, a)), vector(self.eval(frame, b)));

                Value::Number(a.iter().zip(&b).map(|(x, y)| x * y).sum())
            }
            Node::Reduce(kind, inner) => Value::Number(reduce(*kind, &vector(self.eval(frame, inner)))),
            Node::Gather(kind, slot, element) => self.gather(frame, *kind, *slot, element),
            Node::Call(function, args) => self.call(*function, args, frame),
            Node::Term(index, inner) => self.term(frame, *index, inner),
        }
    }
}

impl Program {
    pub fn evaluate(&self, state: &RewardState) -> Evaluation {
        assert_eq!(
            state.joint_pos.len(),
            self.schema.joints,
            "The state has a different joint count"
        );
        assert_eq!(
            state.bodies.len(),
            self.schema.bodies,
            "The state has a different body count"
        );

        let mut run = Run {
            program: self,
            state,
            terms: Vec::new(),
            blamed: Vec::new(),
        };
        let raw = number(run.call(self.entry, &[Node::Number(0.0)], &mut []));
        let total = if raw.is_finite() { raw } else { 0.0 };

        if !raw.is_finite() {
            run.blamed.push("total".to_owned());
        }

        Evaluation {
            total,
            terms: run.terms,
            blamed: run.blamed,
        }
    }
}
