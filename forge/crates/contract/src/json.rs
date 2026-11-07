use std::fmt::Write;

pub const MAX_JSON_DEPTH: usize = 256;

#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>),
}

impl Json {
    pub fn parse(text: &str) -> Result<Json, String> {
        let mut parser = Parser {
            bytes: text.as_bytes(),
            at: 0,
        };
        let value = parser.value(0)?;

        parser.skip_space();

        if parser.at != parser.bytes.len() {
            return Err(parser.malformed());
        }

        Ok(value)
    }

    pub fn write(&self, out: &mut String) {
        match self {
            Json::Null => out.push_str("null"),
            Json::Bool(value) => out.push_str(if *value { "true" } else { "false" }),
            Json::Num(value) => write_number(out, *value),
            Json::Str(value) => write_string(out, value),
            Json::Arr(items) => write_array(out, items),
            Json::Obj(fields) => write_object(out, fields),
        }
    }

    pub fn text(&self) -> String {
        let mut out = String::new();

        self.write(&mut out);
        out
    }
}

fn write_array(out: &mut String, items: &[Json]) {
    out.push('[');

    for (i, item) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }

        item.write(out);
    }

    out.push(']');
}

fn write_object(out: &mut String, fields: &[(String, Json)]) {
    out.push('{');

    for (i, (key, value)) in fields.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }

        write_string(out, key);
        out.push(':');
        value.write(out);
    }

    out.push('}');
}

pub fn write_number(out: &mut String, value: f64) {
    if value.is_nan() {
        out.push_str("null");
    } else if value.is_infinite() {
        out.push_str(if value > 0.0 { "1e999" } else { "-1e999" });
    } else {
        let _ = write!(out, "{value:e}");
    }
}

pub fn write_string(out: &mut String, value: &str) {
    out.push('"');

    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }

    out.push('"');
}

struct Parser<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl Parser<'_> {
    fn malformed(&self) -> String {
        format!("Malformed JSON at byte {}", self.at)
    }

    fn skip_space(&mut self) {
        while matches!(self.bytes.get(self.at), Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.at += 1;
        }
    }

    fn value(&mut self, depth: usize) -> Result<Json, String> {
        if depth > MAX_JSON_DEPTH {
            return Err(String::from("JSON is nested too deep"));
        }

        self.skip_space();

        match self.bytes.get(self.at) {
            Some(b'{') => self.object(depth),
            Some(b'[') => self.array(depth),
            Some(b'"') => self.string().map(Json::Str),
            Some(b't') => self.word(b"true", Json::Bool(true)),
            Some(b'f') => self.word(b"false", Json::Bool(false)),
            Some(b'n') => self.word(b"null", Json::Null),
            Some(b'-' | b'0'..=b'9') => self.number(),
            _ => Err(self.malformed()),
        }
    }

    fn word(&mut self, word: &[u8], value: Json) -> Result<Json, String> {
        if !self.bytes[self.at..].starts_with(word) {
            return Err(self.malformed());
        }

        self.at += word.len();
        Ok(value)
    }

    fn eat(&mut self, byte: u8) -> bool {
        self.skip_space();

        if self.bytes.get(self.at) == Some(&byte) {
            self.at += 1;
            return true;
        }

        false
    }

    fn array(&mut self, depth: usize) -> Result<Json, String> {
        self.at += 1;

        let mut items = Vec::new();

        if self.eat(b']') {
            return Ok(Json::Arr(items));
        }

        loop {
            items.push(self.value(depth + 1)?);

            if self.eat(b']') {
                return Ok(Json::Arr(items));
            }

            if !self.eat(b',') {
                return Err(self.malformed());
            }
        }
    }

    fn object(&mut self, depth: usize) -> Result<Json, String> {
        self.at += 1;

        let mut fields: Vec<(String, Json)> = Vec::new();

        if self.eat(b'}') {
            return Ok(Json::Obj(fields));
        }

        loop {
            let field = self.field(depth)?;

            if fields.iter().any(|(key, _)| *key == field.0) {
                return Err(format!("Duplicate key {}", field.0));
            }

            fields.push(field);

            if self.eat(b'}') {
                return Ok(Json::Obj(fields));
            }

            if !self.eat(b',') {
                return Err(self.malformed());
            }
        }
    }

    fn field(&mut self, depth: usize) -> Result<(String, Json), String> {
        self.skip_space();

        if self.bytes.get(self.at) != Some(&b'"') {
            return Err(self.malformed());
        }

        let key = self.string()?;

        if !self.eat(b':') {
            return Err(self.malformed());
        }

        Ok((key, self.value(depth + 1)?))
    }

    fn digits(&mut self) -> usize {
        let start = self.at;

        while matches!(self.bytes.get(self.at), Some(b'0'..=b'9')) {
            self.at += 1;
        }

        self.at - start
    }

    fn integer_part(&mut self) -> Result<(), String> {
        if self.bytes.get(self.at) == Some(&b'0') {
            self.at += 1;
            return Ok(());
        }

        if self.digits() == 0 {
            return Err(self.malformed());
        }

        Ok(())
    }

    fn fraction_part(&mut self) -> Result<(), String> {
        if self.bytes.get(self.at) != Some(&b'.') {
            return Ok(());
        }

        self.at += 1;

        if self.digits() == 0 {
            return Err(self.malformed());
        }

        Ok(())
    }

    fn exponent_part(&mut self) -> Result<(), String> {
        if !matches!(self.bytes.get(self.at), Some(b'e' | b'E')) {
            return Ok(());
        }

        self.at += 1;

        if matches!(self.bytes.get(self.at), Some(b'+' | b'-')) {
            self.at += 1;
        }

        if self.digits() == 0 {
            return Err(self.malformed());
        }

        Ok(())
    }

    fn number(&mut self) -> Result<Json, String> {
        let start = self.at;

        if self.bytes.get(self.at) == Some(&b'-') {
            self.at += 1;
        }

        self.integer_part()?;
        self.fraction_part()?;
        self.exponent_part()?;

        std::str::from_utf8(&self.bytes[start..self.at])
            .ok()
            .and_then(|text| text.parse::<f64>().ok())
            .map(Json::Num)
            .ok_or_else(|| self.malformed())
    }

    fn string(&mut self) -> Result<String, String> {
        self.at += 1;

        let mut out = Vec::new();

        loop {
            match self.bytes.get(self.at).copied() {
                None => return Err(self.malformed()),
                Some(b'"') => {
                    self.at += 1;
                    return String::from_utf8(out).map_err(|_| self.malformed());
                }
                Some(b'\\') => self.escape(&mut out)?,
                Some(byte) if byte < 0x20 => return Err(self.malformed()),
                Some(byte) => {
                    out.push(byte);
                    self.at += 1;
                }
            }
        }
    }

    fn escape(&mut self, out: &mut Vec<u8>) -> Result<(), String> {
        let code = self
            .bytes
            .get(self.at + 1)
            .copied()
            .ok_or_else(|| self.malformed())?;

        self.at += 2;

        let plain = match code {
            b'"' => b'"',
            b'\\' => b'\\',
            b'/' => b'/',
            b'b' => 8,
            b'f' => 12,
            b'n' => b'\n',
            b'r' => b'\r',
            b't' => b'\t',
            b'u' => return self.unicode(out),
            _ => return Err(self.malformed()),
        };

        out.push(plain);
        Ok(())
    }

    fn hex4(&mut self) -> Result<u32, String> {
        let digits = self
            .bytes
            .get(self.at..self.at + 4)
            .ok_or_else(|| self.malformed())?;
        let text = std::str::from_utf8(digits).map_err(|_| self.malformed())?;
        let unit = u32::from_str_radix(text, 16).map_err(|_| self.malformed())?;

        self.at += 4;
        Ok(unit)
    }

    fn low_surrogate(&mut self) -> Result<u32, String> {
        if self.bytes.get(self.at..self.at + 2) != Some(b"\\u") {
            return Err(self.malformed());
        }

        self.at += 2;

        let low = self.hex4()?;

        if !(0xdc00..0xe000).contains(&low) {
            return Err(self.malformed());
        }

        Ok(low)
    }

    fn unicode(&mut self, out: &mut Vec<u8>) -> Result<(), String> {
        let unit = self.hex4()?;
        let scalar = if (0xd800..0xdc00).contains(&unit) {
            0x10000 + ((unit - 0xd800) << 10) + (self.low_surrogate()? - 0xdc00)
        } else {
            unit
        };
        let c = char::from_u32(scalar).ok_or_else(|| self.malformed())?;
        let mut buffer = [0u8; 4];

        out.extend_from_slice(c.encode_utf8(&mut buffer).as_bytes());
        Ok(())
    }
}
