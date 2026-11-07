use crate::family::{Frame, Scan, Status};

pub const BROADCAST_ID: u8 = 0xFE;
pub const STATUS_CODE: u8 = 0x55;
pub const MAX_LENGTH: usize = 1024;

pub const OP_PING: u8 = 0x01;
pub const OP_READ: u8 = 0x02;
pub const OP_WRITE: u8 = 0x03;
pub const OP_REG_WRITE: u8 = 0x04;
pub const OP_ACTION: u8 = 0x05;
pub const OP_FACTORY_RESET: u8 = 0x06;
pub const OP_REBOOT: u8 = 0x08;
pub const OP_CLEAR: u8 = 0x10;
pub const OP_SYNC_READ: u8 = 0x82;
pub const OP_SYNC_WRITE: u8 = 0x83;
pub const OP_BULK_WRITE: u8 = 0x93;

pub const ERR_RESULT_FAIL: u8 = 1;
pub const ERR_INSTRUCTION: u8 = 2;
pub const ERR_CRC: u8 = 3;
pub const ERR_DATA_RANGE: u8 = 4;
pub const ERR_DATA_LENGTH: u8 = 5;
pub const ERR_DATA_LIMIT: u8 = 6;
pub const ERR_ACCESS: u8 = 7;
pub const ERR_ALERT: u8 = 0x80;

const HEADER: [u8; 3] = [0xFF, 0xFF, 0xFD];

pub fn crc16(bytes: &[u8]) -> u16 {
    bytes.iter().fold(0u16, |crc, byte| crc_step(crc, *byte))
}

fn crc_step(crc: u16, byte: u8) -> u16 {
    let mut value = crc ^ (u16::from(byte) << 8);

    for _ in 0..8 {
        value = if value & 0x8000 == 0 {
            value << 1
        } else {
            (value << 1) ^ 0x8005
        };
    }

    value
}

pub fn stuff(raw: &[u8], preceding: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(raw.len() + 4);
    let mut history = [0u8; 2];

    for (index, byte) in preceding.iter().rev().take(2).enumerate() {
        history[1 - index] = *byte;
    }

    for byte in raw {
        out.push(*byte);

        if *byte == 0xFD && history == [0xFF, 0xFF] {
            out.push(0xFD);
        }

        history = [history[1], *byte];
    }

    out
}

pub fn unstuff(stuffed: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(stuffed.len());
    let mut index = 0;

    while index < stuffed.len() {
        out.push(stuffed[index]);

        let tail_is_header = index >= 2 && stuffed[index - 2] == 0xFF && stuffed[index - 1] == 0xFF;
        let is_stuffed = stuffed[index] == 0xFD && stuffed.get(index + 1) == Some(&0xFD);

        index += if tail_is_header && is_stuffed { 2 } else { 1 };
    }

    out
}

pub fn scan(bytes: &[u8]) -> Scan {
    let Some(start) = bytes.windows(3).position(|triple| triple == HEADER) else {
        return no_header(bytes);
    };

    if start > 0 {
        return Scan::Skip(start);
    }

    if bytes.len() < 7 {
        return Scan::NeedMore;
    }

    let length = usize::from(u16::from_le_bytes([bytes[5], bytes[6]]));

    if bytes[3] == 0xFD || bytes[4] == 0xFF || !(3..=MAX_LENGTH).contains(&length) {
        return Scan::Skip(1);
    }

    let total = length + 7;

    if bytes.len() < total {
        return Scan::NeedMore;
    }

    let crc = u16::from_le_bytes([bytes[total - 2], bytes[total - 1]]);

    if crc16(&bytes[..total - 2]) != crc {
        return Scan::Corrupt { consumed: total };
    }

    Scan::Frame(Frame {
        id: bytes[4],
        code: bytes[7],
        params: unstuff(&bytes[8..total - 2]),
        consumed: total,
    })
}

fn no_header(bytes: &[u8]) -> Scan {
    let keep = match bytes {
        [.., 0xFF, 0xFF] => 2,
        [.., 0xFF] => 1,
        _ => 0,
    };
    let drop = bytes.len() - keep;

    if drop > 0 {
        Scan::Skip(drop)
    } else {
        Scan::NeedMore
    }
}

fn frame(id: u8, code: u8, params: &[u8]) -> Vec<u8> {
    let stuffed = stuff(params, &[code]);
    let length = u16::try_from(stuffed.len() + 3).unwrap_or(u16::MAX).to_le_bytes();
    let mut out = Vec::with_capacity(stuffed.len() + 10);

    out.extend_from_slice(&HEADER);
    out.extend_from_slice(&[0x00, id, length[0], length[1], code]);
    out.extend_from_slice(&stuffed);

    let crc = crc16(&out).to_le_bytes();

    out.extend_from_slice(&crc);

    out
}

pub fn ping_request(id: u8) -> Vec<u8> {
    frame(id, OP_PING, &[])
}

pub fn read_request(id: u8, address: u16, length: u16) -> Vec<u8> {
    let [address_low, address_high] = address.to_le_bytes();
    let [length_low, length_high] = length.to_le_bytes();

    frame(id, OP_READ, &[address_low, address_high, length_low, length_high])
}

pub fn sync_read_request(address: u16, length: u16, ids: &[u8]) -> Vec<u8> {
    let [address_low, address_high] = address.to_le_bytes();
    let [length_low, length_high] = length.to_le_bytes();
    let mut params = vec![address_low, address_high, length_low, length_high];

    params.extend_from_slice(ids);

    frame(BROADCAST_ID, OP_SYNC_READ, &params)
}

pub fn status_frame(id: u8, error: u8, data: &[u8]) -> Vec<u8> {
    let mut params = Vec::with_capacity(data.len() + 1);

    params.push(error);
    params.extend_from_slice(data);

    frame(id, STATUS_CODE, &params)
}

pub fn status_of(frame: &Frame) -> Option<Status> {
    if frame.code != STATUS_CODE {
        return None;
    }

    let (error, data) = frame.params.split_first()?;

    Some(Status {
        id: frame.id,
        error: *error,
        data: data.to_vec(),
    })
}

pub fn opcode_changes_motor(code: u8) -> bool {
    matches!(
        code,
        OP_WRITE | OP_REG_WRITE | OP_ACTION | OP_FACTORY_RESET | OP_REBOOT | OP_CLEAR | OP_SYNC_WRITE | OP_BULK_WRITE
    )
}

#[cfg(feature = "raw-frames")]
pub fn raw_frame(id: u8, code: u8, params: &[u8]) -> Vec<u8> {
    frame(id, code, params)
}

#[cfg(kani)]
mod proofs {
    use super::*;

    #[kani::proof]
    #[kani::unwind(16)]
    fn scan_never_panics_and_consumes_within_bounds() {
        let bytes: [u8; 12] = kani::any();
        let length: usize = kani::any();

        kani::assume(length <= bytes.len());

        match scan(&bytes[..length]) {
            Scan::Skip(count) => assert!(count > 0 && count <= length),
            Scan::Corrupt { consumed } => assert!(consumed > 0 && consumed <= length),
            Scan::Frame(found) => assert!(found.consumed > 0 && found.consumed <= length),
            Scan::NeedMore => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn ping_matches_the_published_example() {
        assert_eq!(
            ping_request(1),
            vec![0xFF, 0xFF, 0xFD, 0x00, 0x01, 0x03, 0x00, 0x01, 0x19, 0x4E]
        );
    }

    #[test]
    fn stuffing_escapes_a_header_inside_params() {
        assert_eq!(stuff(&[0xFF, 0xFF, 0xFD, 1], &[]), vec![0xFF, 0xFF, 0xFD, 0xFD, 1]);
        assert_eq!(unstuff(&[0xFF, 0xFF, 0xFD, 0xFD, 1]), vec![0xFF, 0xFF, 0xFD, 1]);
    }

    #[test]
    fn stuffing_escapes_across_the_status_error_byte() {
        let bytes = status_frame(1, 0xFF, &[0xFF, 0xFD, 9]);
        let Scan::Frame(found) = scan(&bytes) else {
            panic!("expected a frame");
        };

        assert_eq!(status_of(&found).unwrap().data, vec![0xFF, 0xFD, 9]);
    }

    #[test]
    fn a_stuffed_header_is_not_a_new_frame() {
        let bytes = [0xFF, 0xFF, 0xFD, 0xFD, 0x01, 0x03, 0x00];

        assert_eq!(scan(&bytes), Scan::Skip(1));
    }

    #[test]
    fn flipped_bit_is_corrupt() {
        let mut bytes = status_frame(2, 0, &[10, 20, 30]);

        bytes[9] ^= 1;
        assert!(matches!(scan(&bytes), Scan::Corrupt { .. }));
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
        fn stuffing_round_trips(raw in proptest::collection::vec(prop_oneof![Just(0xFFu8), Just(0xFDu8), any::<u8>()], 0..120)) {
            prop_assert_eq!(unstuff(&stuff(&raw, &[])), raw);
        }

        #[test]
        fn any_status_round_trips(id in 0u8..=0xFD, error in any::<u8>(), data in proptest::collection::vec(prop_oneof![Just(0xFFu8), Just(0xFDu8), any::<u8>()], 0..120)) {
            let bytes = status_frame(id, error, &data);
            let Scan::Frame(found) = scan(&bytes) else {
                return Err(TestCaseError::fail("expected a frame"));
            };
            let status = status_of(&found).unwrap();

            prop_assert_eq!(status.id, id);
            prop_assert_eq!(status.error, error);
            prop_assert_eq!(status.data, data);
        }
    }
}
