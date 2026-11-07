use crate::family::{Frame, Scan, Status};

pub const BROADCAST_ID: u8 = 0xFE;
pub const MAX_LENGTH: usize = 250;

pub const OP_PING: u8 = 0x01;
pub const OP_READ: u8 = 0x02;
pub const OP_WRITE: u8 = 0x03;
pub const OP_REG_WRITE: u8 = 0x04;
pub const OP_ACTION: u8 = 0x05;
pub const OP_RESET: u8 = 0x06;
pub const OP_SYNC_READ: u8 = 0x82;
pub const OP_SYNC_WRITE: u8 = 0x83;

pub const ERR_VOLTAGE: u8 = 1;
pub const ERR_ANGLE: u8 = 2;
pub const ERR_OVERHEAT: u8 = 4;
pub const ERR_OVERCURRENT: u8 = 8;
pub const ERR_OVERLOAD: u8 = 32;

pub fn checksum(body: &[u8]) -> u8 {
    !body.iter().fold(0u8, |sum, byte| sum.wrapping_add(*byte))
}

pub fn scan(bytes: &[u8]) -> Scan {
    let Some(start) = bytes.windows(2).position(|pair| pair == [0xFF, 0xFF]) else {
        return no_header(bytes);
    };

    if start > 0 {
        return Scan::Skip(start);
    }

    if bytes.len() < 4 {
        return Scan::NeedMore;
    }

    let id = bytes[2];
    let length = usize::from(bytes[3]);

    if id == 0xFF || !(2..=MAX_LENGTH).contains(&length) {
        return Scan::Skip(1);
    }

    let total = length + 4;

    if bytes.len() < total {
        return Scan::NeedMore;
    }

    if checksum(&bytes[2..total - 1]) != bytes[total - 1] {
        return Scan::Corrupt { consumed: total };
    }

    Scan::Frame(Frame {
        id,
        code: bytes[4],
        params: bytes[5..total - 1].to_vec(),
        consumed: total,
    })
}

fn no_header(bytes: &[u8]) -> Scan {
    match bytes.last() {
        None => Scan::NeedMore,
        Some(0xFF) if bytes.len() == 1 => Scan::NeedMore,
        Some(0xFF) => Scan::Skip(bytes.len() - 1),
        Some(_) => Scan::Skip(bytes.len()),
    }
}

fn frame(id: u8, code: u8, params: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(params.len() + 6);
    let length = u8::try_from(params.len() + 2).unwrap_or(u8::MAX);

    out.extend_from_slice(&[0xFF, 0xFF, id, length, code]);
    out.extend_from_slice(params);
    out.push(checksum(&out[2..]));

    out
}

pub fn ping_request(id: u8) -> Vec<u8> {
    frame(id, OP_PING, &[])
}

pub fn read_request(id: u8, address: u16, length: u16) -> Vec<u8> {
    frame(id, OP_READ, &[low(address), low(length)])
}

pub fn sync_read_request(address: u16, length: u16, ids: &[u8]) -> Vec<u8> {
    let mut params = vec![low(address), low(length)];

    params.extend_from_slice(ids);

    frame(BROADCAST_ID, OP_SYNC_READ, &params)
}

pub fn status_frame(id: u8, error: u8, data: &[u8]) -> Vec<u8> {
    frame(id, error, data)
}

pub fn status_of(frame: &Frame) -> Status {
    Status {
        id: frame.id,
        error: frame.code,
        data: frame.params.clone(),
    }
}

pub fn opcode_changes_motor(code: u8) -> bool {
    matches!(code, OP_WRITE | OP_REG_WRITE | OP_ACTION | OP_RESET | OP_SYNC_WRITE)
}

fn low(value: u16) -> u8 {
    value.to_le_bytes()[0]
}

#[cfg(feature = "raw-frames")]
pub fn raw_frame(id: u8, code: u8, params: &[u8]) -> Vec<u8> {
    frame(id, code, params)
}

#[cfg(kani)]
mod proofs {
    use super::*;

    #[kani::proof]
    #[kani::unwind(12)]
    fn scan_never_panics_and_consumes_within_bounds() {
        let bytes: [u8; 10] = kani::any();
        let length: usize = kani::any();

        kani::assume(length <= bytes.len());

        match scan(&bytes[..length]) {
            Scan::Skip(count) => assert!(count > 0 && count <= length),
            Scan::Corrupt { consumed } => assert!(consumed > 0 && consumed <= length),
            Scan::Frame(found) => assert!(found.consumed > 0 && found.consumed <= length),
            Scan::NeedMore => {}
        }
    }

    #[kani::proof]
    #[kani::unwind(8)]
    fn a_single_flipped_byte_never_passes_the_checksum() {
        let body: [u8; 4] = kani::any();
        let flip: u8 = kani::any();
        let index: usize = kani::any();

        kani::assume(flip != 0 && index < body.len());

        let mut changed = body;

        changed[index] ^= flip;
        assert_ne!(checksum(&body), checksum(&changed));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn ping_matches_the_published_example() {
        assert_eq!(ping_request(1), vec![0xFF, 0xFF, 0x01, 0x02, 0x01, 0xFB]);
    }

    #[test]
    fn status_round_trips() {
        let bytes = status_frame(3, ERR_OVERLOAD, &[1, 2, 3]);
        let Scan::Frame(found) = scan(&bytes) else {
            panic!("expected a frame");
        };

        assert_eq!(found.id, 3);
        assert_eq!(found.code, ERR_OVERLOAD);
        assert_eq!(found.params, vec![1, 2, 3]);
        assert_eq!(found.consumed, bytes.len());
    }

    #[test]
    fn flipped_bit_is_corrupt() {
        let mut bytes = status_frame(3, 0, &[1, 2, 3]);

        bytes[5] ^= 0x10;
        assert!(matches!(scan(&bytes), Scan::Corrupt { .. }));
    }

    #[test]
    fn id_ff_is_not_a_frame_start() {
        assert_eq!(scan(&[0xFF, 0xFF, 0xFF, 0x02, 0x00, 0x00]), Scan::Skip(1));
    }

    #[test]
    fn lone_trailing_ff_keeps_the_possible_header() {
        assert_eq!(scan(&[0x12, 0x34, 0xFF]), Scan::Skip(2));
        assert_eq!(scan(&[0xFF]), Scan::NeedMore);
        assert_eq!(scan(&[0x12, 0x34]), Scan::Skip(2));
    }

    proptest! {
        #[test]
        fn scan_always_makes_progress_or_waits(bytes in proptest::collection::vec(any::<u8>(), 0..300)) {
            match scan(&bytes) {
                Scan::NeedMore => {}
                Scan::Skip(count) => prop_assert!(count > 0 && count <= bytes.len()),
                Scan::Corrupt { consumed } => prop_assert!(consumed > 0 && consumed <= bytes.len()),
                Scan::Frame(found) => prop_assert!(found.consumed > 0 && found.consumed <= bytes.len()),
            }
        }

        #[test]
        fn any_frame_round_trips(id in 0u8..=0xFD, error in 0u8..=0x7F, data in proptest::collection::vec(any::<u8>(), 0..200)) {
            let bytes = status_frame(id, error, &data);
            let Scan::Frame(found) = scan(&bytes) else {
                return Err(TestCaseError::fail("expected a frame"));
            };

            prop_assert_eq!(found.id, id);
            prop_assert_eq!(found.code, error);
            prop_assert_eq!(found.params, data);
        }
    }
}
