pub const HEADER: [u8; 4] = [0x00, 0x01, 0x00, 0x00];

#[derive(Default)]
pub struct Writer {
    body: Vec<u8>,
}

impl Writer {
    pub fn new() -> Self {
        Self::default()
    }

    fn align(&mut self, size: usize) {
        while !self.body.len().is_multiple_of(size) {
            self.body.push(0);
        }
    }

    pub fn u8(&mut self, value: u8) {
        self.body.push(value);
    }

    pub fn bool(&mut self, value: bool) {
        self.body.push(u8::from(value));
    }

    pub fn i16(&mut self, value: i16) {
        self.align(2);
        self.body.extend_from_slice(&value.to_le_bytes());
    }

    pub fn u32(&mut self, value: u32) {
        self.align(4);
        self.body.extend_from_slice(&value.to_le_bytes());
    }

    pub fn i32(&mut self, value: i32) {
        self.align(4);
        self.body.extend_from_slice(&value.to_le_bytes());
    }

    pub fn f32(&mut self, value: f32) {
        self.align(4);
        self.body.extend_from_slice(&value.to_le_bytes());
    }

    pub fn i64(&mut self, value: i64) {
        self.align(8);
        self.body.extend_from_slice(&value.to_le_bytes());
    }

    pub fn f64(&mut self, value: f64) {
        self.align(8);
        self.body.extend_from_slice(&value.to_le_bytes());
    }

    pub fn string(&mut self, value: &str) {
        let length = u32::try_from(value.len() + 1).unwrap_or(u32::MAX);

        self.u32(length);
        self.body.extend_from_slice(value.as_bytes());
        self.body.push(0);
    }

    pub fn bytes(&mut self, value: &[u8]) {
        self.u32(u32::try_from(value.len()).unwrap_or(u32::MAX));
        self.body.extend_from_slice(value);
    }

    pub fn finish(self) -> Vec<u8> {
        let mut out = HEADER.to_vec();

        out.extend_from_slice(&self.body);
        out
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Short;

pub struct Reader<'a> {
    body: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    pub fn new(payload: &'a [u8]) -> Result<Self, Short> {
        match payload {
            [0x00, 0x01, _, _, body @ ..] => Ok(Self { body, at: 0 }),
            _ => Err(Short),
        }
    }

    fn take(&mut self, size: usize, align: usize) -> Result<&'a [u8], Short> {
        let start = self.at.next_multiple_of(align);
        let end = start.checked_add(size).ok_or(Short)?;
        let bytes = self.body.get(start..end).ok_or(Short)?;

        self.at = end;

        Ok(bytes)
    }

    fn array<const N: usize>(&mut self, align: usize) -> Result<[u8; N], Short> {
        self.take(N, align)?.try_into().map_err(|_| Short)
    }

    pub fn u8(&mut self) -> Result<u8, Short> {
        Ok(self.take(1, 1)?[0])
    }

    pub fn bool(&mut self) -> Result<bool, Short> {
        Ok(self.u8()? != 0)
    }

    pub fn i16(&mut self) -> Result<i16, Short> {
        Ok(i16::from_le_bytes(self.array(2)?))
    }

    pub fn u32(&mut self) -> Result<u32, Short> {
        Ok(u32::from_le_bytes(self.array(4)?))
    }

    pub fn i32(&mut self) -> Result<i32, Short> {
        Ok(i32::from_le_bytes(self.array(4)?))
    }

    pub fn f32(&mut self) -> Result<f32, Short> {
        Ok(f32::from_le_bytes(self.array(4)?))
    }

    pub fn i64(&mut self) -> Result<i64, Short> {
        Ok(i64::from_le_bytes(self.array(8)?))
    }

    pub fn f64(&mut self) -> Result<f64, Short> {
        Ok(f64::from_le_bytes(self.array(8)?))
    }

    pub fn raw(&mut self, size: usize) -> Result<&'a [u8], Short> {
        self.take(size, 1)
    }

    pub fn remaining(&self) -> usize {
        self.body.len().saturating_sub(self.at)
    }

    pub fn string(&mut self) -> Result<String, Short> {
        let length = usize::try_from(self.u32()?).map_err(|_| Short)?;
        let bytes = self.take(length, 1)?;
        let text = bytes.strip_suffix(&[0]).unwrap_or(bytes);

        String::from_utf8(text.to_vec()).map_err(|_| Short)
    }

    pub fn bytes(&mut self) -> Result<Vec<u8>, Short> {
        let length = usize::try_from(self.u32()?).map_err(|_| Short)?;

        Ok(self.take(length, 1)?.to_vec())
    }

    pub fn consumed(&self) -> usize {
        self.at
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aligns_each_value_to_its_size_from_the_start_of_the_body() {
        let mut writer = Writer::new();

        writer.u8(7);
        writer.f32(1.5);
        writer.u8(9);
        writer.i16(-2);
        writer.i64(3);
        writer.u8(1);
        writer.f64(-0.5);

        let payload = writer.finish();
        let mut reader = Reader::new(&payload).unwrap();

        assert_eq!(payload.len(), 4 + 40);
        assert_eq!(reader.u8(), Ok(7));
        assert_eq!(reader.f32(), Ok(1.5));
        assert_eq!(reader.u8(), Ok(9));
        assert_eq!(reader.i16(), Ok(-2));
        assert_eq!(reader.i64(), Ok(3));
        assert_eq!(reader.u8(), Ok(1));
        assert_eq!(reader.f64(), Ok(-0.5));
        assert_eq!(reader.remaining(), 0);
    }

    #[test]
    fn strings_carry_their_terminator() {
        let mut writer = Writer::new();

        writer.string("{}");

        let payload = writer.finish();

        assert_eq!(&payload[4..], &[3, 0, 0, 0, b'{', b'}', 0]);
        assert_eq!(Reader::new(&payload).unwrap().string(), Ok("{}".into()));
    }

    #[test]
    fn a_short_or_headerless_payload_is_refused() {
        assert!(Reader::new(&[0, 1]).is_err());
        assert!(Reader::new(&[0, 0, 0, 0, 1]).is_err());
        assert_eq!(Reader::new(&HEADER).unwrap().u32(), Err(Short));
    }
}
