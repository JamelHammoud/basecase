use crate::ast::{BinaryOp, Expr, ExprKind, Function, Stmt};
use crate::lexer::{tokenize, Spanned, Token};

const FORBIDDEN_STATEMENTS: [(&str, &str); 16] = [
    ("import", "Imports aren't allowed"),
    ("from", "Imports aren't allowed"),
    ("while", "Loops aren't allowed; use sum(... for b in state.bodies)"),
    ("for", "Loops aren't allowed; use sum(... for b in state.bodies)"),
    ("class", "Classes aren't allowed"),
    ("lambda", "Lambdas aren't allowed"),
    ("global", "Globals aren't allowed"),
    ("nonlocal", "Globals aren't allowed"),
    ("with", "with blocks aren't allowed"),
    ("try", "try blocks aren't allowed"),
    ("del", "del isn't allowed"),
    ("yield", "Generators aren't allowed"),
    ("raise", "raise isn't allowed"),
    ("assert", "assert isn't allowed"),
    ("if", "if blocks aren't allowed; use `a if condition else b`"),
    ("async", "async isn't allowed"),
];

pub struct Parser {
    tokens: Vec<Spanned>,
    at: usize,
}

pub fn fail<T>(line: usize, message: &str) -> Result<T, String> {
    Err(format!("Line {line}: {message}"))
}

impl Parser {
    pub fn line(&self) -> usize {
        self.tokens[self.at].line
    }

    pub fn peek(&self) -> &Token {
        &self.tokens[self.at].token
    }

    pub fn peek_at(&self, offset: usize) -> &Token {
        let index = (self.at + offset).min(self.tokens.len() - 1);

        &self.tokens[index].token
    }

    pub fn advance(&mut self) -> Token {
        let token = self.tokens[self.at].token.clone();

        self.at = (self.at + 1).min(self.tokens.len() - 1);

        token
    }

    pub fn is_symbol(&self, symbol: &str) -> bool {
        matches!(self.peek(), Token::Symbol(s) if *s == symbol)
    }

    pub fn is_word(&self, word: &str) -> bool {
        matches!(self.peek(), Token::Name(n) if n == word)
    }

    pub fn eat_symbol(&mut self, symbol: &str) -> bool {
        let found = self.is_symbol(symbol);

        if found {
            self.advance();
        }

        found
    }

    pub fn eat_word(&mut self, word: &str) -> bool {
        let found = self.is_word(word);

        if found {
            self.advance();
        }

        found
    }

    pub fn expect_symbol(&mut self, symbol: &str) -> Result<(), String> {
        if self.eat_symbol(symbol) {
            return Ok(());
        }

        fail(self.line(), &format!("Expected {symbol}"))
    }

    pub fn expect_name(&mut self) -> Result<String, String> {
        match self.advance() {
            Token::Name(name) => Ok(name),
            _ => fail(self.line(), "Expected a name"),
        }
    }

    fn expect_newline(&mut self) -> Result<(), String> {
        if matches!(self.advance(), Token::Newline) {
            return Ok(());
        }

        fail(self.line(), "Expected the end of the line")
    }

    fn reject_forbidden(&self) -> Result<(), String> {
        let Token::Name(word) = self.peek() else {
            return Ok(());
        };

        match FORBIDDEN_STATEMENTS.iter().find(|(w, _)| w == word) {
            Some((_, message)) => fail(self.line(), message),
            None => Ok(()),
        }
    }

    fn assignment_target(&self, line: usize, params: &[String]) -> Result<String, String> {
        let Token::Name(name) = self.peek().clone() else {
            return fail(line, "Only plain names can be assigned");
        };
        let simple = matches!(self.peek_at(1), Token::Symbol("=" | "+=" | "-=" | "*=" | "/="));

        if params.contains(&name) {
            return fail(line, "State is read-only");
        }

        if !simple {
            return fail(line, "Only plain names can be assigned");
        }

        Ok(name)
    }

    fn compound(&mut self, name: &str, line: usize) -> Result<Expr, String> {
        let op = match self.advance() {
            Token::Symbol("+=") => Some(BinaryOp::Add),
            Token::Symbol("-=") => Some(BinaryOp::Sub),
            Token::Symbol("*=") => Some(BinaryOp::Mul),
            Token::Symbol("/=") => Some(BinaryOp::Div),
            _ => None,
        };
        let value = self.expression()?;
        let Some(op) = op else { return Ok(value) };
        let current = Expr {
            kind: ExprKind::Name(name.to_owned()),
            line,
        };

        Ok(Expr {
            kind: ExprKind::Binary(op, Box::new(current), Box::new(value)),
            line,
        })
    }

    fn statement(&mut self, params: &[String]) -> Result<Option<Stmt>, String> {
        let line = self.line();

        self.reject_forbidden()?;

        if self.is_word("def") {
            return fail(line, "Functions must be defined at the top level");
        }

        if self.eat_word("return") {
            let value = self.expression()?;

            self.expect_newline()?;

            return Ok(Some(Stmt::Return { value, line }));
        }

        if matches!(self.peek(), Token::Text(_)) && matches!(self.peek_at(1), Token::Newline) {
            self.advance();
            self.advance();

            return Ok(None);
        }

        let assigns = (1..self.tokens.len() - self.at)
            .map(|offset| self.peek_at(offset))
            .take_while(|t| !matches!(t, Token::Newline | Token::End))
            .any(|t| matches!(t, Token::Symbol("=" | "+=" | "-=" | "*=" | "/=")));

        if !assigns {
            return fail(line, "A statement must assign a name or return a value");
        }

        let name = self.assignment_target(line, params)?;

        self.advance();

        let value = self.compound(&name, line)?;

        self.expect_newline()?;

        Ok(Some(Stmt::Assign { name, value, line }))
    }

    fn function(&mut self) -> Result<Function, String> {
        let line = self.line();
        let name = self.expect_name()?;
        let mut params = Vec::new();

        self.expect_symbol("(")?;

        while !self.eat_symbol(")") {
            params.push(self.expect_name()?);

            if !self.is_symbol(")") {
                self.expect_symbol(",")?;
            }
        }

        self.expect_symbol(":")?;
        self.expect_newline()?;

        if !matches!(self.advance(), Token::Indent) {
            return fail(line, "A function needs an indented body");
        }

        let mut body = Vec::new();

        while !matches!(self.peek(), Token::Dedent | Token::End) {
            body.extend(self.statement(&params)?);
        }

        self.advance();

        Ok(Function {
            name,
            params,
            body,
            line,
        })
    }

    pub fn program(&mut self) -> Result<Vec<Function>, String> {
        let mut functions = Vec::new();

        loop {
            if matches!(self.peek(), Token::End) {
                return Ok(functions);
            }

            if matches!(self.peek(), Token::Newline) {
                self.advance();

                continue;
            }

            if self.eat_word("def") {
                functions.push(self.function()?);

                continue;
            }

            self.reject_forbidden()?;

            return fail(self.line(), "Only function definitions are allowed at the top level");
        }
    }
}

pub fn parse(source: &str) -> Result<Vec<Function>, String> {
    let mut parser = Parser {
        tokens: tokenize(source)?,
        at: 0,
    };

    parser.program()
}
