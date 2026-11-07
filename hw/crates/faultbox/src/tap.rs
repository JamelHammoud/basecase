use servo_wire::dynamixel as dxl;
use servo_wire::feetech as sts;
use servo_wire::{Family, Frame, Scan};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WireEvent {
    pub at_us: u64,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Default)]
pub struct Tap {
    events: Arc<Mutex<Vec<WireEvent>>>,
}

impl Tap {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(&self, at_us: u64, bytes: &[u8]) {
        if let Ok(mut events) = self.events.lock() {
            events.push(WireEvent {
                at_us,
                bytes: bytes.to_vec(),
            });
        }
    }

    pub fn events(&self) -> Vec<WireEvent> {
        self.events.lock().map(|events| events.clone()).unwrap_or_default()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WriteRecord {
    pub at_us: u64,
    pub id: u8,
    pub address: u16,
    pub data: Vec<u8>,
    pub opcode: u8,
}

pub fn decode_writes(family: Family, events: &[WireEvent]) -> Vec<WriteRecord> {
    let mut records = Vec::new();

    for event in events {
        let mut rest = event.bytes.as_slice();

        while !rest.is_empty() {
            match family.scan(rest) {
                Scan::Frame(frame) => {
                    records.extend(frame_writes(family, &frame, event.at_us));
                    rest = &rest[frame.consumed..];
                }
                Scan::Skip(count) => rest = &rest[count..],
                Scan::Corrupt { consumed } => rest = &rest[consumed..],
                Scan::NeedMore => break,
            }
        }
    }

    records
}

fn frame_writes(family: Family, frame: &Frame, at_us: u64) -> Vec<WriteRecord> {
    if !family.opcode_changes_motor(frame.code) {
        return Vec::new();
    }

    let address_width = match family {
        Family::Feetech => 1,
        Family::Dynamixel => 2,
    };
    let sync_write = match family {
        Family::Feetech => sts::OP_SYNC_WRITE,
        Family::Dynamixel => dxl::OP_SYNC_WRITE,
    };

    if frame.code == sync_write {
        return sync_records(frame, address_width, at_us);
    }

    let address = read_word(&frame.params, address_width);
    let data = frame.params.get(address_width..).unwrap_or_default().to_vec();

    vec![WriteRecord {
        at_us,
        id: frame.id,
        address,
        data,
        opcode: frame.code,
    }]
}

fn sync_records(frame: &Frame, width: usize, at_us: u64) -> Vec<WriteRecord> {
    let address = read_word(&frame.params, width);
    let length = usize::from(read_word(frame.params.get(width..).unwrap_or_default(), width));
    let body = frame.params.get(2 * width..).unwrap_or_default();

    if length == 0 {
        return Vec::new();
    }

    body.chunks_exact(length + 1)
        .map(|chunk| WriteRecord {
            at_us,
            id: chunk[0],
            address,
            data: chunk[1..].to_vec(),
            opcode: frame.code,
        })
        .collect()
}

fn read_word(bytes: &[u8], width: usize) -> u16 {
    match (width, bytes) {
        (1, [low, ..]) => u16::from(*low),
        (2, [low, high, ..]) => u16::from_le_bytes([*low, *high]),
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_produce_no_write_records() {
        let tap = Tap::new();

        tap.record(1, &Family::Feetech.sync_read_request(56, 2, &[1, 2]));
        tap.record(2, &Family::Dynamixel.ping_request(1));

        assert!(decode_writes(Family::Feetech, &tap.events()).is_empty());
    }
}
