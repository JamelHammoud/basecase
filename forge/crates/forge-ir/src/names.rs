use crate::read::Reader;

pub struct Names<'a> {
    bytes: &'a [u8],
    reader: &'a Reader<'a>,
}

impl<'a> Names<'a> {
    pub fn new(reader: &'a Reader<'a>) -> Self {
        Self {
            bytes: reader.u8s("names").unwrap_or(&[]),
            reader,
        }
    }

    pub fn get(&self, kind: &str, id: usize) -> String {
        let label = match kind {
            "jnt" => "joint",
            other => other,
        };
        let start = self
            .reader
            .i32s(&format!("name_{kind}adr"))
            .ok()
            .and_then(|adr| adr.get(id).copied())
            .and_then(|a| usize::try_from(a).ok());
        let text = start
            .map(|s| {
                let rest = &self.bytes[s.min(self.bytes.len())..];
                let end = rest.iter().position(|&b| b == 0).unwrap_or(rest.len());

                String::from_utf8_lossy(&rest[..end]).into_owned()
            })
            .unwrap_or_default();

        if text.is_empty() {
            format!("{label} {id}")
        } else {
            format!("{label} {text}")
        }
    }
}
