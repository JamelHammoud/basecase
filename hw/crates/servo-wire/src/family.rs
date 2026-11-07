use crate::{dynamixel, feetech};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Family {
    Feetech,
    Dynamixel,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Frame {
    pub id: u8,
    pub code: u8,
    pub params: Vec<u8>,
    pub consumed: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Scan {
    NeedMore,
    Skip(usize),
    Frame(Frame),
    Corrupt { consumed: usize },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Status {
    pub id: u8,
    pub error: u8,
    pub data: Vec<u8>,
}

impl Family {
    pub fn scan(self, bytes: &[u8]) -> Scan {
        match self {
            Family::Feetech => feetech::scan(bytes),
            Family::Dynamixel => dynamixel::scan(bytes),
        }
    }

    pub fn broadcast_id(self) -> u8 {
        feetech::BROADCAST_ID
    }

    pub fn ping_request(self, id: u8) -> Vec<u8> {
        match self {
            Family::Feetech => feetech::ping_request(id),
            Family::Dynamixel => dynamixel::ping_request(id),
        }
    }

    pub fn read_request(self, id: u8, address: u16, length: u16) -> Vec<u8> {
        match self {
            Family::Feetech => feetech::read_request(id, address, length),
            Family::Dynamixel => dynamixel::read_request(id, address, length),
        }
    }

    pub fn sync_read_request(self, address: u16, length: u16, ids: &[u8]) -> Vec<u8> {
        match self {
            Family::Feetech => feetech::sync_read_request(address, length, ids),
            Family::Dynamixel => dynamixel::sync_read_request(address, length, ids),
        }
    }

    pub fn status_frame(self, id: u8, error: u8, data: &[u8]) -> Vec<u8> {
        match self {
            Family::Feetech => feetech::status_frame(id, error, data),
            Family::Dynamixel => dynamixel::status_frame(id, error, data),
        }
    }

    pub fn status_of(self, frame: &Frame) -> Option<Status> {
        match self {
            Family::Feetech => Some(feetech::status_of(frame)),
            Family::Dynamixel => dynamixel::status_of(frame),
        }
    }

    pub fn opcode_changes_motor(self, code: u8) -> bool {
        match self {
            Family::Feetech => feetech::opcode_changes_motor(code),
            Family::Dynamixel => dynamixel::opcode_changes_motor(code),
        }
    }
}
