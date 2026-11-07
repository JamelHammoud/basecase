#[derive(Clone, Debug, PartialEq)]
pub enum Token {
    Name(String),
    Number(f64),
    Text(String),
    Symbol(&'static str),
    Newline,
    Indent,
    Dedent,
    End,
}

#[derive(Clone, Debug)]
pub struct Spanned {
    pub token: Token,
    pub line: usize,
}

const SYMBOLS: [&str; 26] = [
    "**", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "//", "(", ")", "[", "]", ",", ":", ".", "+", "-", "*", "/",
    "<", ">", "=", "%", ";",
];

struct Lexer<'a> {
    chars: Vec<char>,
    at: usize,
    line: usize,
    depth: usize,
    indents: Vec<usize>,
    out: Vec<Spanned>,
    source: &'a str,
}

fn error(line: usize, message: &str) -> String {
    format!("Line {line}: {message}")
}

impl Lexer<'_> {
    fn push(&mut self, token: Token) {
        self.out.push(Spanned { token, line: self.line });
    }

    fn peek(&self, offset: usize) -> Option<char> {
        self.chars.get(self.at + offset).copied()
    }

    fn line_start(&mut self) -> Result<(), String> {
        let mut width = 0;

        while let Some(c) = self.peek(0).filter(|c| *c == ' ' || *c == '\t') {
            width += if c == '\t' { 4 } else { 1 };
            self.at += 1;
        }

        if matches!(self.peek(0), None | Some('\n') | Some('#')) {
            return Ok(());
        }

        let current = *self.indents.last().unwrap_or(&0);

        if width > current {
            self.indents.push(width);
            self.push(Token::Indent);

            return Ok(());
        }

        while width < *self.indents.last().unwrap_or(&0) {
            self.indents.pop();
            self.push(Token::Dedent);
        }

        if width != *self.indents.last().unwrap_or(&0) {
            return Err(error(self.line, "Indentation doesn't match any outer block"));
        }

        Ok(())
    }

    fn number(&mut self) -> Result<(), String> {
        let start = self.at;

        while self.peek(0).is_some_and(|c| c.is_ascii_digit() || c == '.' || c == '_') {
            self.at += 1;
        }

        if matches!(self.peek(0), Some('e') | Some('E')) {
            self.at += 1;

            if matches!(self.peek(0), Some('+') | Some('-')) {
                self.at += 1;
            }

            while self.peek(0).is_some_and(|c| c.is_ascii_digit()) {
                self.at += 1;
            }
        }

        let text: String = self.chars[start..self.at].iter().filter(|c| **c != '_').collect();
        let value = text
            .parse::<f64>()
            .map_err(|_| error(self.line, &format!("{text} isn't a number")))?;

        self.push(Token::Number(value));

        Ok(())
    }

    fn text(&mut self, quote: char) -> Result<(), String> {
        self.at += 1;

        let start = self.at;

        while let Some(c) = self.peek(0) {
            if c == quote {
                let value: String = self.chars[start..self.at].iter().collect();

                self.at += 1;
                self.push(Token::Text(value));

                return Ok(());
            }

            if c == '\n' || c == '\\' {
                break;
            }

            self.at += 1;
        }

        Err(error(self.line, "Strings must close on the same line, without escapes"))
    }

    fn name(&mut self) {
        let start = self.at;

        while self.peek(0).is_some_and(|c| c.is_alphanumeric() || c == '_') {
            self.at += 1;
        }

        self.push(Token::Name(self.chars[start..self.at].iter().collect()));
    }

    fn symbol(&mut self) -> Result<(), String> {
        let rest: String = self.chars[self.at..(self.at + 2).min(self.chars.len())]
            .iter()
            .collect();
        let found = SYMBOLS.iter().find(|s| rest.starts_with(**s)).ok_or_else(|| {
            let c = self.peek(0).unwrap_or(' ');

            error(self.line, &format!("Unexpected character {c}"))
        })?;

        match *found {
            "(" | "[" => self.depth += 1,
            ")" | "]" => self.depth = self.depth.saturating_sub(1),
            _ => {}
        }

        self.at += found.len();
        self.push(Token::Symbol(found));

        Ok(())
    }

    fn newline(&mut self) -> Result<(), String> {
        self.at += 1;

        if self.depth == 0 && !matches!(self.out.last().map(|s| &s.token), None | Some(Token::Newline)) {
            self.push(Token::Newline);
        }

        self.line += 1;

        if self.depth == 0 {
            self.line_start()?;
        }

        Ok(())
    }

    fn run(mut self) -> Result<Vec<Spanned>, String> {
        if self.source.contains('\r') {
            self.chars.retain(|c| *c != '\r');
        }

        self.line_start()?;

        while let Some(c) = self.peek(0) {
            match c {
                '\n' => self.newline()?,
                ' ' | '\t' => self.at += 1,
                '#' => {
                    while self.peek(0).is_some_and(|c| c != '\n') {
                        self.at += 1;
                    }
                }
                '"' | '\'' => self.text(c)?,
                c if c.is_ascii_digit() || (c == '.' && self.peek(1).is_some_and(|d| d.is_ascii_digit())) => {
                    self.number()?
                }
                c if c.is_alphabetic() || c == '_' => self.name(),
                _ => self.symbol()?,
            }
        }

        if !matches!(self.out.last().map(|s| &s.token), None | Some(Token::Newline)) {
            self.push(Token::Newline);
        }

        while self.indents.len() > 1 {
            self.indents.pop();
            self.push(Token::Dedent);
        }

        self.push(Token::End);

        Ok(self.out)
    }
}

pub fn tokenize(source: &str) -> Result<Vec<Spanned>, String> {
    let lexer = Lexer {
        chars: source.chars().collect(),
        at: 0,
        line: 1,
        depth: 0,
        indents: vec![0],
        out: Vec::new(),
        source,
    };

    lexer.run()
}

#[cfg(test)]
mod tests {
    use super::{tokenize, Token};

    #[test]
    fn indents_and_joins_bracketed_lines() {
        let tokens = tokenize("def f(s):\n    x = (1 +\n        2)\n    return x\n").expect("lexes");
        let kinds: Vec<Token> = tokens.into_iter().map(|t| t.token).collect();

        assert_eq!(kinds.iter().filter(|t| **t == Token::Indent).count(), 1);
        assert_eq!(kinds.iter().filter(|t| **t == Token::Dedent).count(), 1);
        assert_eq!(kinds.iter().filter(|t| **t == Token::Newline).count(), 3);
        assert!(kinds.contains(&Token::Number(2.0)));
    }
}
