use crate::fault::Fault;
use crate::ladder::{digest, Hash};
use crate::safety::{ReadBus, Reply};
use crate::telemetry::block;
use servo_wire::Family;

pub(super) const SCAN_TIMEOUT_US: u64 = 20_000;
const DUPLICATE_PROBES: usize = 3;

pub const STS3215_MODEL: u16 = 777;
pub const XL330_MODEL: u16 = 1200;

pub fn expected_model(family: Family) -> u16 {
    match family {
        Family::Feetech => STS3215_MODEL,
        Family::Dynamixel => XL330_MODEL,
    }
}

pub fn scan_bus(bus: &mut ReadBus, ids: &[u8]) -> Result<Hash, Fault> {
    let scanned = scan_present(bus, ids)?;

    match scanned.missing.first() {
        Some(id) => Err(Fault::NoReply { id: *id }),
        None => Ok(scanned.firmware),
    }
}

pub struct Scanned {
    pub firmware: Hash,
    pub missing: Vec<u8>,
}

pub fn scan_present(bus: &mut ReadBus, ids: &[u8]) -> Result<Scanned, Fault> {
    let mut firmware = Vec::new();
    let mut missing = Vec::new();

    for id in ids {
        match check_servo(bus, *id, expected_model(bus.family())) {
            Ok(version) => {
                firmware.push(*id);
                firmware.extend_from_slice(&version);
            }
            Err(Fault::NoReply { .. }) => missing.push(*id),
            Err(fault) => return Err(fault),
        }
    }

    Ok(Scanned {
        firmware: digest(&firmware),
        missing,
    })
}

pub(super) fn check_servo(bus: &mut ReadBus, id: u8, expected: u16) -> Result<Vec<u8>, Fault> {
    let (model, version) = identify(bus, id)?;

    if model != expected {
        return Err(Fault::WrongModel {
            id,
            found: model,
            expected,
        });
    }

    probe_for_duplicates(bus, id)?;

    Ok(version)
}

fn identify(bus: &mut ReadBus, id: u8) -> Result<(u16, Vec<u8>), Fault> {
    let ping = bus.ping(id, SCAN_TIMEOUT_US).map_err(|_| Fault::BusGone)?;
    let status = status_or_fault(id, ping)?;

    match bus.family() {
        Family::Dynamixel => {
            let [low, high, version, ..] = status.data.as_slice() else {
                return Err(Fault::Garbled { id });
            };

            Ok((u16::from_le_bytes([*low, *high]), vec![*version]))
        }
        Family::Feetech => {
            let model = bus.read(id, 3, 2, SCAN_TIMEOUT_US).map_err(|_| Fault::BusGone)?;
            let version = bus.read(id, 0, 2, SCAN_TIMEOUT_US).map_err(|_| Fault::BusGone)?;
            let model = status_or_fault(id, model)?;
            let version = status_or_fault(id, version)?;
            let [low, high] = model.data.as_slice() else {
                return Err(Fault::Garbled { id });
            };

            Ok((u16::from_le_bytes([*low, *high]), version.data))
        }
    }
}

fn probe_for_duplicates(bus: &mut ReadBus, id: u8) -> Result<(), Fault> {
    let (address, length) = block(bus.family());

    for _ in 0..DUPLICATE_PROBES {
        match bus
            .read(id, address, length, SCAN_TIMEOUT_US)
            .map_err(|_| Fault::BusGone)?
        {
            Reply::Status(_) => {}
            Reply::Corrupt | Reply::WrongId(_) => return Err(Fault::DuplicateId { id }),
            Reply::Missing => return Err(Fault::NoReply { id }),
        }
    }

    Ok(())
}

fn status_or_fault(id: u8, reply: Reply) -> Result<servo_wire::Status, Fault> {
    match reply {
        Reply::Status(status) => Ok(status),
        Reply::Missing => Err(Fault::NoReply { id }),
        Reply::Corrupt => Err(Fault::Garbled { id }),
        Reply::WrongId(answered) => Err(Fault::WrongId { asked: id, answered }),
    }
}
