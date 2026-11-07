#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinaryOp {
    Add,
    Sub,
    Mul,
    Div,
    Pow,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CompareOp {
    Less,
    LessEqual,
    Greater,
    GreaterEqual,
    Equal,
    NotEqual,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogicOp {
    And,
    Or,
}

#[derive(Clone, Debug)]
pub struct Generator {
    pub element: Box<Expr>,
    pub variable: String,
    pub source: Box<Expr>,
}

#[derive(Clone, Debug)]
pub enum ExprKind {
    Number(f64),
    Text(String),
    Name(String),
    Attribute(Box<Expr>, String),
    Index(Box<Expr>, Box<Expr>),
    Slice(Box<Expr>, Option<Box<Expr>>, Option<Box<Expr>>),
    Negate(Box<Expr>),
    Not(Box<Expr>),
    Binary(BinaryOp, Box<Expr>, Box<Expr>),
    Compare(CompareOp, Box<Expr>, Box<Expr>),
    Logic(LogicOp, Box<Expr>, Box<Expr>),
    Choose(Box<Expr>, Box<Expr>, Box<Expr>),
    Call(String, Vec<Expr>),
    Generate(Generator),
}

#[derive(Clone, Debug)]
pub struct Expr {
    pub kind: ExprKind,
    pub line: usize,
}

#[derive(Clone, Debug)]
pub enum Stmt {
    Assign { name: String, value: Expr, line: usize },
    Return { value: Expr, line: usize },
}

#[derive(Clone, Debug)]
pub struct Function {
    pub name: String,
    pub params: Vec<String>,
    pub body: Vec<Stmt>,
    pub line: usize,
}
