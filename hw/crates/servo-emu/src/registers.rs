pub const TABLE_SIZE: usize = 256;

#[derive(Clone)]
pub struct Registers {
    bytes: [u8; TABLE_SIZE],
}

impl Registers {
    pub fn zeroed() -> Self {
        Self { bytes: [0; TABLE_SIZE] }
    }

    pub fn u8_at(&self, address: u16) -> u8 {
        self.bytes[usize::from(address) % TABLE_SIZE]
    }

    pub fn set_u8(&mut self, address: u16, value: u8) {
        self.bytes[usize::from(address) % TABLE_SIZE] = value;
    }

    pub fn u16_at(&self, address: u16) -> u16 {
        u16::from_le_bytes([self.u8_at(address), self.u8_at(address.wrapping_add(1))])
    }

    pub fn set_u16(&mut self, address: u16, value: u16) {
        let [low, high] = value.to_le_bytes();

        self.set_u8(address, low);
        self.set_u8(address.wrapping_add(1), high);
    }

    pub fn u32_at(&self, address: u16) -> u32 {
        u32::from_le_bytes([
            self.u8_at(address),
            self.u8_at(address.wrapping_add(1)),
            self.u8_at(address.wrapping_add(2)),
            self.u8_at(address.wrapping_add(3)),
        ])
    }

    pub fn set_u32(&mut self, address: u16, value: u32) {
        for (offset, byte) in (0u16..).zip(value.to_le_bytes()) {
            self.set_u8(address.wrapping_add(offset), byte);
        }
    }

    pub fn slice(&self, address: u16, length: u16) -> Vec<u8> {
        (0..length)
            .map(|offset| self.u8_at(address.wrapping_add(offset)))
            .collect()
    }
}

pub fn sign_magnitude(value: i32, sign_bit: u8) -> u16 {
    let limit = (1i32 << sign_bit) - 1;
    let magnitude = u16::try_from(value.abs().min(limit)).unwrap_or(0);

    if value < 0 {
        magnitude | (1u16 << sign_bit)
    } else {
        magnitude
    }
}

pub fn from_sign_magnitude(raw: u16, sign_bit: u8) -> i32 {
    let magnitude = i32::from(raw & ((1u16 << sign_bit) - 1));

    if raw & (1u16 << sign_bit) != 0 {
        -magnitude
    } else {
        magnitude
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_magnitude_round_trips_inside_range() {
        for value in [-1023, -1, 0, 1, 1023] {
            assert_eq!(from_sign_magnitude(sign_magnitude(value, 10), 10), value);
        }
    }

    #[test]
    fn sign_magnitude_saturates() {
        assert_eq!(from_sign_magnitude(sign_magnitude(5000, 10), 10), 1023);
        assert_eq!(from_sign_magnitude(sign_magnitude(-5000, 10), 10), -1023);
    }

    #[test]
    fn little_endian_words() {
        let mut registers = Registers::zeroed();

        registers.set_u16(3, 777);
        assert_eq!(registers.slice(3, 2), vec![0x09, 0x03]);
        assert_eq!(registers.u16_at(3), 777);
        registers.set_u32(10, 0x0403_0201);
        assert_eq!(registers.slice(10, 4), vec![1, 2, 3, 4]);
        assert_eq!(registers.u32_at(10), 0x0403_0201);
    }
}
