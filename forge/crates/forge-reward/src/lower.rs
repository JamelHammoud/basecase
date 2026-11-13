use crate::ast::{BinaryOp, CompareOp, LogicOp};
use crate::check::Program;
use crate::code::{Binary, Code, Input, Op, Unary};
use crate::ir::{Elementwise, Node, Pairwise, Reduction, StateField};

const EXP_LIMIT: f64 = 80.0;
const LOG_FLOOR: f64 = 1e-300;
const NO_BODIES: &str = "state.bodies isn't lowered for Forge's GPU loop";

#[derive(Clone, Debug)]
enum Sym {
    Number(usize),
    Vector(Vec<usize>),
    Truth(usize),
    Nothing,
}

struct Lowering<'a> {
    program: &'a Program,
    code: Code,
}

fn arithmetic(op: BinaryOp) -> Binary {
    match op {
        BinaryOp::Add => Binary::Add,
        BinaryOp::Sub => Binary::Sub,
        BinaryOp::Mul => Binary::Mul,
        BinaryOp::Div => Binary::Div,
        BinaryOp::Pow => Binary::Pow,
    }
}

fn comparison(op: CompareOp) -> Binary {
    match op {
        CompareOp::Less => Binary::Less,
        CompareOp::LessEqual => Binary::LessEqual,
        CompareOp::Greater => Binary::Greater,
        CompareOp::GreaterEqual => Binary::GreaterEqual,
        CompareOp::Equal => Binary::Equal,
        CompareOp::NotEqual => Binary::NotEqual,
    }
}

fn pairwise(kind: Pairwise) -> Binary {
    match kind {
        Pairwise::Min => Binary::Min,
        Pairwise::Max => Binary::Max,
        Pairwise::SafeDiv => Binary::SafeDiv,
    }
}

fn elements(value: &Sym) -> Result<Vec<usize>, String> {
    match value {
        Sym::Vector(v) => Ok(v.clone()),
        Sym::Number(x) => Ok(vec![*x]),
        _ => Err("A reward expression isn't a number or a vector".to_owned()),
    }
}

fn number(value: &Sym) -> Result<usize, String> {
    match value {
        Sym::Number(x) | Sym::Truth(x) => Ok(*x),
        _ => Err("A reward expression isn't a number".to_owned()),
    }
}

impl Lowering<'_> {
    fn op(&mut self, op: Op) -> usize {
        self.code.push(op)
    }

    fn constant(&mut self, value: f64) -> usize {
        self.op(Op::Const(value))
    }

    fn read(&mut self, input: Input) -> usize {
        self.op(Op::Read(input))
    }

    fn field(&mut self, field: StateField, joints: usize) -> Sym {
        let three = |s: &mut Self, f: fn(usize) -> Input| Sym::Vector((0..3).map(|k| s.read(f(k))).collect());
        let each = |s: &mut Self, f: fn(usize) -> Input| Sym::Vector((0..joints).map(|k| s.read(f(k))).collect());

        match field {
            StateField::Gravity => three(self, Input::Gravity),
            StateField::AngVel => three(self, Input::AngVel),
            StateField::LinVel => three(self, Input::LinVel),
            StateField::Command => three(self, Input::Command),
            StateField::Z => Sym::Number(self.read(Input::Z)),
            StateField::Z0 => Sym::Number(self.read(Input::Z0)),
            StateField::ControlDt => Sym::Number(self.read(Input::ControlDt)),
            StateField::JointPos => each(self, Input::JointPos),
            StateField::JointVel => each(self, Input::JointVel),
            StateField::Action => each(self, Input::Action),
            StateField::LastAction => each(self, Input::LastAction),
            StateField::Reference => Sym::Vector((0..joints + 2).map(|k| self.read(Input::Reference(k))).collect()),
        }
    }

    fn map(&mut self, value: Sym, f: impl Fn(&mut Self, usize) -> usize) -> Result<Sym, String> {
        Ok(match value {
            Sym::Number(x) => Sym::Number(f(self, x)),
            Sym::Vector(v) => Sym::Vector(v.into_iter().map(|x| f(self, x)).collect()),
            _ => return Err("A reward expression isn't a number or a vector".to_owned()),
        })
    }

    fn zip(&mut self, a: Sym, b: Sym, op: Binary) -> Result<Sym, String> {
        let pairs = |s: &mut Self, xs: Vec<usize>, ys: Vec<usize>| {
            let len = xs.len().max(ys.len());
            let at = |v: &Vec<usize>, i: usize| if v.len() == 1 { v[0] } else { v[i] };

            (0..len)
                .map(|i| s.op(Op::Binary(op, at(&xs, i), at(&ys, i))))
                .collect::<Vec<_>>()
        };

        Ok(match (&a, &b) {
            (Sym::Number(x), Sym::Number(y)) => Sym::Number(self.op(Op::Binary(op, *x, *y))),
            _ => Sym::Vector(pairs(self, elements(&a)?, elements(&b)?)),
        })
    }

    fn unary(&mut self, kind: Unary, x: usize) -> usize {
        self.op(Op::Unary(kind, x))
    }

    fn binary_constant(&mut self, op: Binary, x: usize, value: f64) -> usize {
        let c = self.constant(value);

        self.op(Op::Binary(op, x, c))
    }

    fn apply(&mut self, kind: Elementwise, x: usize) -> usize {
        match kind {
            Elementwise::Exp => {
                let capped = self.binary_constant(Binary::Min, x, EXP_LIMIT);

                self.unary(Unary::Exp, capped)
            }
            Elementwise::Log => {
                let floored = self.binary_constant(Binary::Max, x, LOG_FLOOR);

                self.unary(Unary::Log, floored)
            }
            Elementwise::Sqrt => {
                let floored = self.binary_constant(Binary::Max, x, 0.0);

                self.unary(Unary::Sqrt, floored)
            }
            Elementwise::Abs => self.unary(Unary::Abs, x),
            Elementwise::Tanh => self.unary(Unary::Tanh, x),
            Elementwise::Sin => self.unary(Unary::Sin, x),
            Elementwise::Cos => self.unary(Unary::Cos, x),
            Elementwise::Square => self.op(Op::Binary(Binary::Mul, x, x)),
        }
    }

    fn power(&mut self, x: usize, power: i32) -> usize {
        let mut out = self.constant(1.0);

        for _ in 0..power.max(0) {
            out = self.op(Op::Binary(Binary::Mul, out, x));
        }

        if power < 0 {
            let one = self.constant(1.0);

            return self.op(Op::Binary(Binary::Div, one, out));
        }

        out
    }

    fn fold(&mut self, values: &[usize], op: Binary, empty: f64) -> usize {
        let Some((first, rest)) = values.split_first() else {
            return self.constant(empty);
        };

        rest.iter().fold(*first, |acc, x| self.op(Op::Binary(op, acc, *x)))
    }

    fn reduce(&mut self, kind: Reduction, values: &[usize]) -> usize {
        match kind {
            Reduction::Sum => self.fold(values, Binary::Add, 0.0),
            Reduction::Mean if values.is_empty() => self.constant(0.0),
            Reduction::Mean => {
                let total = self.fold(values, Binary::Add, 0.0);

                self.binary_constant(Binary::Div, total, values.len() as f64)
            }
            Reduction::Min => self.fold(values, Binary::Min, f64::INFINITY),
            Reduction::Max => self.fold(values, Binary::Max, f64::NEG_INFINITY),
            Reduction::Norm => {
                let squares: Vec<usize> = values
                    .iter()
                    .map(|x| self.op(Op::Binary(Binary::Mul, *x, *x)))
                    .collect();
                let total = self.fold(&squares, Binary::Add, 0.0);

                self.unary(Unary::Sqrt, total)
            }
        }
    }

    fn select(&mut self, condition: usize, yes: Sym, no: Sym) -> Result<Sym, String> {
        if let (Sym::Truth(a), Sym::Truth(b)) = (&yes, &no) {
            return Ok(Sym::Truth(self.op(Op::Select(condition, *a, *b))));
        }

        let (a, b) = (elements(&yes)?, elements(&no)?);

        if a.len() == 1 && b.len() == 1 {
            return Ok(Sym::Number(self.op(Op::Select(condition, a[0], b[0]))));
        }

        let picked = a
            .iter()
            .zip(&b)
            .map(|(x, y)| self.op(Op::Select(condition, *x, *y)))
            .collect();

        Ok(Sym::Vector(picked))
    }

    fn call(&mut self, function: usize, args: Vec<Sym>) -> Result<Sym, String> {
        let compiled = &self.program.functions[function];
        let mut frame = vec![Sym::Nothing; compiled.slots.max(args.len())];

        for (slot, arg) in args.into_iter().enumerate() {
            frame[slot] = arg;
        }

        for (slot, node) in &compiled.assignments {
            frame[*slot] = self.eval(&mut frame, node)?;
        }

        self.eval(&mut frame, &compiled.result)
    }

    fn term(&mut self, frame: &mut [Sym], index: usize, inner: &Node) -> Result<Sym, String> {
        let raw = number(&self.eval(frame, inner)?)?;
        let guarded = self.unary(Unary::Finite, raw);

        self.code.terms.push((self.program.terms[index].clone(), guarded));

        Ok(Sym::Number(guarded))
    }

    fn pair(&mut self, frame: &mut [Sym], a: &Node, b: &Node) -> Result<(Sym, Sym), String> {
        Ok((self.eval(frame, a)?, self.eval(frame, b)?))
    }

    fn eval(&mut self, frame: &mut [Sym], node: &Node) -> Result<Sym, String> {
        let joints = self.program.schema.joints;

        Ok(match node {
            Node::Number(v) => Sym::Number(self.constant(*v)),
            Node::Truth(b) => Sym::Truth(self.constant(f64::from(u8::from(*b)))),
            Node::Local(slot) => frame[*slot].clone(),
            Node::State => Sym::Nothing,
            Node::Bodies | Node::Body(..) | Node::Gather(..) => return Err(NO_BODIES.to_owned()),
            Node::Field(field) => self.field(*field, joints),
            Node::Index(inner, at) => Sym::Number(elements(&self.eval(frame, inner)?)?[*at]),
            Node::Slice(inner, from, to) => Sym::Vector(elements(&self.eval(frame, inner)?)?[*from..*to].to_vec()),
            Node::Negate(inner) => {
                let value = self.eval(frame, inner)?;

                self.map(value, |s, x| s.unary(Unary::Negate, x))?
            }
            Node::Not(inner) => {
                let value = number(&self.eval(frame, inner)?)?;

                Sym::Truth(self.unary(Unary::Not, value))
            }
            Node::Binary(op, a, b) => {
                let (a, b) = self.pair(frame, a, b)?;

                self.zip(a, b, arithmetic(*op))?
            }
            Node::Power(inner, power) => {
                let value = self.eval(frame, inner)?;

                self.map(value, |s, x| s.power(x, *power))?
            }
            Node::Compare(op, a, b) => {
                let (a, b) = self.pair(frame, a, b)?;

                Sym::Truth(self.op(Op::Binary(comparison(*op), number(&a)?, number(&b)?)))
            }
            Node::Logic(op, a, b) => {
                let (a, b) = self.pair(frame, a, b)?;
                let kind = if *op == LogicOp::And { Binary::And } else { Binary::Or };

                Sym::Truth(self.op(Op::Binary(kind, number(&a)?, number(&b)?)))
            }
            Node::Choose(condition, yes, no) => {
                let condition = number(&self.eval(frame, condition)?)?;
                let (yes, no) = self.pair(frame, yes, no)?;

                self.select(condition, yes, no)?
            }
            Node::Apply(kind, inner) => {
                let value = self.eval(frame, inner)?;

                self.map(value, |s, x| s.apply(*kind, x))?
            }
            Node::Pair(kind, a, b) => {
                let (a, b) = self.pair(frame, a, b)?;

                self.zip(a, b, pairwise(*kind))?
            }
            Node::Clamp(x, low, high) => {
                let (x, low) = self.pair(frame, x, low)?;
                let high = self.eval(frame, high)?;
                let floored = self.zip(x, low, Binary::Max)?;

                self.zip(floored, high, Binary::Min)?
            }
            Node::Dot(a, b) => {
                let (a, b) = self.pair(frame, a, b)?;
                let products = self.zip(a, b, Binary::Mul)?;

                Sym::Number(self.reduce(Reduction::Sum, &elements(&products)?))
            }
            Node::Reduce(kind, inner) => {
                let values = elements(&self.eval(frame, inner)?)?;

                Sym::Number(self.reduce(*kind, &values))
            }
            Node::Call(function, args) => {
                let values = args
                    .iter()
                    .map(|a| self.eval(frame, a))
                    .collect::<Result<Vec<_>, _>>()?;

                self.call(*function, values)?
            }
            Node::Term(index, inner) => self.term(frame, *index, inner)?,
        })
    }
}

impl Program {
    pub fn lower(&self) -> Result<Code, String> {
        if self.schema.bodies > 0 {
            return Err(NO_BODIES.to_owned());
        }

        let mut lowering = Lowering {
            program: self,
            code: Code::default(),
        };
        let state = Sym::Number(lowering.constant(0.0));
        let raw = number(&lowering.call(self.entry, vec![state])?)?;

        lowering.code.result = lowering.unary(Unary::Finite, raw);

        Ok(lowering.code)
    }
}
