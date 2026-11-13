use crate::ast::{BinaryOp, CompareOp, LogicOp};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Type {
    Scalar,
    Vector(usize),
    Bool,
    State,
    Bodies,
    Body,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StateField {
    Gravity,
    AngVel,
    LinVel,
    Command,
    Z,
    Z0,
    ControlDt,
    JointPos,
    JointVel,
    Action,
    LastAction,
    Reference,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BodyField {
    Pos,
    Vel,
    Z,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Elementwise {
    Exp,
    Log,
    Sqrt,
    Abs,
    Tanh,
    Sin,
    Cos,
    Square,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pairwise {
    Min,
    Max,
    SafeDiv,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reduction {
    Sum,
    Mean,
    Min,
    Max,
    Norm,
}

#[derive(Clone, Debug)]
pub enum Node {
    Number(f64),
    Truth(bool),
    Local(usize),
    State,
    Field(StateField),
    Bodies,
    Body(usize, BodyField),
    Index(Box<Node>, usize),
    Slice(Box<Node>, usize, usize),
    Negate(Box<Node>),
    Not(Box<Node>),
    Binary(BinaryOp, Box<Node>, Box<Node>),
    Power(Box<Node>, i32),
    Compare(CompareOp, Box<Node>, Box<Node>),
    Logic(LogicOp, Box<Node>, Box<Node>),
    Choose(Box<Node>, Box<Node>, Box<Node>),
    Apply(Elementwise, Box<Node>),
    Pair(Pairwise, Box<Node>, Box<Node>),
    Clamp(Box<Node>, Box<Node>, Box<Node>),
    Dot(Box<Node>, Box<Node>),
    Reduce(Reduction, Box<Node>),
    Gather(Reduction, usize, Box<Node>),
    Call(usize, Vec<Node>),
    Term(usize, Box<Node>),
}

#[derive(Clone, Debug)]
pub struct CompiledFunction {
    pub slots: usize,
    pub assignments: Vec<(usize, Node)>,
    pub result: Node,
}
