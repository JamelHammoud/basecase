#[derive(Default)]
pub struct Image {
    bytes: Vec<u8>,
}

impl Image {
    pub fn align(&mut self, size: usize) {
        while !self.bytes.len().is_multiple_of(size) {
            self.bytes.push(0);
        }
    }

    pub fn u8(&mut self, value: u8) {
        self.bytes.push(value);
    }

    pub fn i16(&mut self, value: i16) {
        self.align(2);
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    pub fn u32(&mut self, value: u32) {
        self.align(4);
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    pub fn f32(&mut self, value: f32) {
        self.align(4);
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    pub fn finish(mut self) -> Vec<u8> {
        self.align(4);
        self.bytes
    }
}
