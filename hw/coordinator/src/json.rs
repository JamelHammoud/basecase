const MAX_DEPTH: usize = 32;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
}

impl Value {
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Obj(fields) => fields.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Num(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_arr(&self) -> Option<&[Value]> {
        match self {
            Value::Arr(items) => Some(items),
            _ => None,
        }
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

pub fn parse(text: &str) -> Option<Value> {
    let mut reader = Reader {
        bytes: text.as_bytes(),
        at: 0,
    };
    let value = reader.value(0)?;

    reader.skip_space();

    (reader.at == reader.bytes.len()).then_some(value)
}

impl Reader<'_> {
    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.at).copied()
    }

    fn next_byte(&mut self) -> Option<u8> {
        let b = self.peek()?;

        self.at += 1;

        Some(b)
    }

    fn skip_space(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.at += 1;
        }
    }

    fn expect_word(&mut self, word: &str, value: Value) -> Option<Value> {
        let end = self.at.checked_add(word.len())?;

        if self.bytes.get(self.at..end)? != word.as_bytes() {
            return None;
        }

        self.at = end;

        Some(value)
    }

    fn value(&mut self, depth: usize) -> Option<Value> {
        if depth > MAX_DEPTH {
            return None;
        }

        self.skip_space();

        match self.peek()? {
            b'{' => self.object(depth),
            b'[' => self.array(depth),
            b'"' => self.string().map(Value::Str),
            b't' => self.expect_word("true", Value::Bool(true)),
            b'f' => self.expect_word("false", Value::Bool(false)),
            b'n' => self.expect_word("null", Value::Null),
            _ => self.number(),
        }
    }

    fn array(&mut self, depth: usize) -> Option<Value> {
        self.at += 1;

        let mut items = Vec::new();

        self.skip_space();

        if self.peek()? == b']' {
            self.at += 1;

            return Some(Value::Arr(items));
        }

        loop {
            items.push(self.value(depth + 1)?);
            self.skip_space();

            match self.next_byte()? {
                b',' => {}
                b']' => return Some(Value::Arr(items)),
                _ => return None,
            }
        }
    }

    fn object(&mut self, depth: usize) -> Option<Value> {
        self.at += 1;

        let mut fields = Vec::new();

        self.skip_space();

        if self.peek()? == b'}' {
            self.at += 1;

            return Some(Value::Obj(fields));
        }

        loop {
            self.skip_space();

            let key = self.string()?;

            self.skip_space();

            if self.next_byte()? != b':' {
                return None;
            }

            fields.push((key, self.value(depth + 1)?));
            self.skip_space();

            match self.next_byte()? {
                b',' => {}
                b'}' => return Some(Value::Obj(fields)),
                _ => return None,
            }
        }
    }

    fn string(&mut self) -> Option<String> {
        if self.next_byte()? != b'"' {
            return None;
        }

        let mut out = Vec::new();

        loop {
            match self.next_byte()? {
                b'"' => return String::from_utf8(out).ok(),
                b'\\' => self.escape(&mut out)?,
                b => out.push(b),
            }
        }
    }

    fn escape(&mut self, out: &mut Vec<u8>) -> Option<()> {
        let simple = match self.next_byte()? {
            b'"' => b'"',
            b'\\' => b'\\',
            b'/' => b'/',
            b'b' => 8,
            b'f' => 12,
            b'n' => b'\n',
            b'r' => b'\r',
            b't' => b'\t',
            b'u' => return self.unicode(out),
            _ => return None,
        };

        out.push(simple);

        Some(())
    }

    fn unicode(&mut self, out: &mut Vec<u8>) -> Option<()> {
        let end = self.at.checked_add(4)?;
        let hex = std::str::from_utf8(self.bytes.get(self.at..end)?).ok()?;
        let code = u32::from_str_radix(hex, 16).ok()?;
        let c = char::from_u32(code).unwrap_or('\u{fffd}');
        let mut buf = [0u8; 4];

        self.at = end;
        out.extend_from_slice(c.encode_utf8(&mut buf).as_bytes());

        Some(())
    }

    fn number(&mut self) -> Option<Value> {
        let start = self.at;

        while matches!(
            self.peek(),
            Some(b'0'..=b'9' | b'-' | b'+' | b'.' | b'e' | b'E')
        ) {
            self.at += 1;
        }

        let text = std::str::from_utf8(self.bytes.get(start..self.at)?).ok()?;
        let n: f64 = text.parse().ok()?;

        n.is_finite().then_some(Value::Num(n))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_objects_arrays_and_escapes() {
        let v = parse(r#" {"a":[1,2.5,-3e2],"b":"x\n\u0041","c":true,"d":null} "#).unwrap();

        assert_eq!(v.get("a").unwrap().as_arr().unwrap().len(), 3);
        assert_eq!(v.get("b").unwrap().as_str().unwrap(), "x\nA");
        assert_eq!(v.get("c").unwrap().as_bool(), Some(true));
        assert_eq!(v.get("d"), Some(&Value::Null));
    }

    #[test]
    fn refuses_garbage_without_panicking() {
        for bad in [
            "", "{", "[1,", "{\"a\"}", "tru", "1e999", "\"\\q\"", "[]x", "\"\\u12",
        ] {
            assert!(parse(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn refuses_nesting_past_the_limit() {
        let deep = format!("{}{}", "[".repeat(100_000), "]".repeat(100_000));

        assert!(parse(&deep).is_none());
    }
}
