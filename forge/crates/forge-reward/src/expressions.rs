use crate::ast::{BinaryOp, CompareOp, Expr, ExprKind, Generator, LogicOp};
use crate::lexer::Token;
use crate::parser::{fail, Parser};

const RESERVED: [&str; 9] = [
    "lambda", "def", "return", "import", "from", "while", "for", "in", "else",
];

fn node(kind: ExprKind, line: usize) -> Expr {
    Expr { kind, line }
}

fn boxed(kind: ExprKind, line: usize) -> Box<Expr> {
    Box::new(node(kind, line))
}

fn compare_op(token: &Token) -> Option<CompareOp> {
    match token {
        Token::Symbol("<") => Some(CompareOp::Less),
        Token::Symbol("<=") => Some(CompareOp::LessEqual),
        Token::Symbol(">") => Some(CompareOp::Greater),
        Token::Symbol(">=") => Some(CompareOp::GreaterEqual),
        Token::Symbol("==") => Some(CompareOp::Equal),
        Token::Symbol("!=") => Some(CompareOp::NotEqual),
        _ => None,
    }
}

impl Parser {
    pub fn expression(&mut self) -> Result<Expr, String> {
        let line = self.line();
        let value = self.either()?;

        if !self.eat_word("if") {
            return Ok(value);
        }

        let condition = self.either()?;

        if !self.eat_word("else") {
            return fail(line, "A conditional needs else");
        }

        let other = self.expression()?;

        Ok(node(
            ExprKind::Choose(Box::new(condition), Box::new(value), Box::new(other)),
            line,
        ))
    }

    fn either(&mut self) -> Result<Expr, String> {
        let mut left = self.both()?;

        while self.eat_word("or") {
            let line = self.line();

            left = node(
                ExprKind::Logic(LogicOp::Or, Box::new(left), Box::new(self.both()?)),
                line,
            );
        }

        Ok(left)
    }

    fn both(&mut self) -> Result<Expr, String> {
        let mut left = self.negation()?;

        while self.eat_word("and") {
            let line = self.line();

            left = node(
                ExprKind::Logic(LogicOp::And, Box::new(left), Box::new(self.negation()?)),
                line,
            );
        }

        Ok(left)
    }

    fn negation(&mut self) -> Result<Expr, String> {
        let line = self.line();

        if self.eat_word("not") {
            return Ok(node(ExprKind::Not(Box::new(self.negation()?)), line));
        }

        self.comparison()
    }

    fn comparison(&mut self) -> Result<Expr, String> {
        let left = self.sum()?;
        let line = self.line();
        let Some(op) = compare_op(self.peek()) else {
            return Ok(left);
        };

        self.advance();

        let right = self.sum()?;

        if compare_op(self.peek()).is_some() {
            return fail(line, "Chained comparisons aren't allowed");
        }

        Ok(node(ExprKind::Compare(op, Box::new(left), Box::new(right)), line))
    }

    fn sum(&mut self) -> Result<Expr, String> {
        let mut left = self.product()?;

        loop {
            let line = self.line();
            let op = match self.peek() {
                Token::Symbol("+") => BinaryOp::Add,
                Token::Symbol("-") => BinaryOp::Sub,
                _ => return Ok(left),
            };

            self.advance();
            left = node(ExprKind::Binary(op, Box::new(left), Box::new(self.product()?)), line);
        }
    }

    fn product(&mut self) -> Result<Expr, String> {
        let mut left = self.unary()?;

        loop {
            let line = self.line();
            let op = match self.peek() {
                Token::Symbol("*") => BinaryOp::Mul,
                Token::Symbol("/") => BinaryOp::Div,
                Token::Symbol("//" | "%") => return fail(line, "Use safe_div; // and % aren't allowed"),
                _ => return Ok(left),
            };

            self.advance();
            left = node(ExprKind::Binary(op, Box::new(left), Box::new(self.unary()?)), line);
        }
    }

    fn unary(&mut self) -> Result<Expr, String> {
        let line = self.line();

        if self.eat_symbol("-") {
            return Ok(node(ExprKind::Negate(Box::new(self.unary()?)), line));
        }

        if self.eat_symbol("+") {
            return self.unary();
        }

        let base = self.postfix()?;

        if !self.eat_symbol("**") {
            return Ok(base);
        }

        Ok(node(
            ExprKind::Binary(BinaryOp::Pow, Box::new(base), Box::new(self.unary()?)),
            line,
        ))
    }

    fn subscript(&mut self, target: Expr, line: usize) -> Result<Expr, String> {
        let start = if self.is_symbol(":") {
            None
        } else {
            Some(Box::new(self.expression()?))
        };

        if !self.eat_symbol(":") {
            self.expect_symbol("]")?;

            let index = start.ok_or_else(|| format!("Line {line}: Expected an index"))?;

            return Ok(node(ExprKind::Index(Box::new(target), index), line));
        }

        let end = if self.is_symbol("]") {
            None
        } else {
            Some(Box::new(self.expression()?))
        };

        self.expect_symbol("]")?;

        Ok(node(ExprKind::Slice(Box::new(target), start, end), line))
    }

    fn postfix(&mut self) -> Result<Expr, String> {
        let mut value = self.atom()?;

        loop {
            let line = self.line();

            if self.eat_symbol("[") {
                value = self.subscript(value, line)?;
            } else if self.eat_symbol(".") {
                value = node(ExprKind::Attribute(Box::new(value), self.expect_name()?), line);
            } else if self.is_symbol("(") {
                return fail(line, "Only named functions can be called");
            } else {
                return Ok(value);
            }
        }
    }

    fn arguments(&mut self, line: usize) -> Result<Vec<Expr>, String> {
        let mut args = Vec::new();

        while !self.eat_symbol(")") {
            let value = self.expression()?;

            if self.eat_word("for") {
                let variable = self.expect_name()?;

                if !self.eat_word("in") {
                    return fail(line, "Expected in");
                }

                let source = Box::new(self.expression()?);
                let generator = Generator {
                    element: Box::new(value),
                    variable,
                    source,
                };

                self.expect_symbol(")")?;

                return Ok(vec![node(ExprKind::Generate(generator), line)]);
            }

            args.push(value);

            if !self.is_symbol(")") {
                self.expect_symbol(",")?;
            }
        }

        Ok(args)
    }

    fn atom(&mut self) -> Result<Expr, String> {
        let line = self.line();

        match self.advance() {
            Token::Number(value) => Ok(node(ExprKind::Number(value), line)),
            Token::Text(text) => Ok(node(ExprKind::Text(text), line)),
            Token::Symbol("(") => {
                let inner = self.expression()?;

                self.expect_symbol(")")?;

                Ok(inner)
            }
            Token::Symbol("[") => fail(line, "Lists aren't allowed"),
            Token::Name(name) if name == "lambda" => fail(line, "Lambdas aren't allowed"),
            Token::Name(name) if RESERVED.contains(&name.as_str()) => fail(line, &format!("{name} isn't allowed here")),
            Token::Name(name) if self.eat_symbol("(") => Ok(node(ExprKind::Call(name, self.arguments(line)?), line)),
            Token::Name(name) => Ok(*boxed(ExprKind::Name(name), line)),
            _ => fail(line, "Expected a value"),
        }
    }
}
