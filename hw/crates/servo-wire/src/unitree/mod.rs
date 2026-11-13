pub mod api;
pub mod g1;
pub mod hg;
mod image;

pub use crate::cdr::Short;
pub use hg::{ImuState, LowCmd, LowState, MotorCmd, MotorState, MOTOR_SLOTS};

const POLYNOMIAL: u32 = 0x04c1_1db7;

pub fn crc32_core(words: &[u32]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;

    for word in words {
        for bit in (0..32).rev() {
            let carry = crc & 0x8000_0000 != 0;

            crc <<= 1;

            if carry {
                crc ^= POLYNOMIAL;
            }

            if word & (1 << bit) != 0 {
                crc ^= POLYNOMIAL;
            }
        }
    }

    crc
}

pub(crate) fn crc_of_image(image: &[u8]) -> u32 {
    let words: Vec<u32> = image
        .as_chunks::<4>()
        .0
        .iter()
        .map(|chunk| u32::from_le_bytes(*chunk))
        .collect();
    let covered = words.len().saturating_sub(1);

    crc32_core(&words[..covered])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_crc_of_nothing_is_the_seed() {
        assert_eq!(crc32_core(&[]), 0xFFFF_FFFF);
    }

    #[test]
    fn one_flipped_bit_changes_the_crc() {
        let words = [1u32, 2, 3, 4];
        let mut flipped = words;

        flipped[2] ^= 1 << 7;
        assert_ne!(crc32_core(&words), crc32_core(&flipped));
    }
}
