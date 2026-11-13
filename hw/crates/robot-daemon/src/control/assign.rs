use super::scan::{check_servo, SCAN_TIMEOUT_US};
use super::{Daemon, DaemonEvent, Holder, Run};
use crate::fault::Fault;
use crate::ladder::Mode;
use crate::safety::{ReadBus, Reply, WriteError};
use servo_wire::Family;

pub const FACTORY_ID: u8 = 1;
pub const CENSUS_WINDOW_US: u64 = 780_000;

const OUTSIDE_SET_UP: &str = "Servos get their IDs in Set up, with the motors off.";
const NONE_NEW: &str = "No new servo answers. Plug in the next one.";
const MANY_NEW: &str = "More than one new servo answers. Plug in one at a time.";
const MOTOR_ON: &str = "The new servo's motor is on. Unplug it and plug it back in.";

struct Addresses {
    id: u16,
    torque: u16,
}

fn addresses(family: Family) -> Addresses {
    match family {
        Family::Feetech => Addresses { id: 5, torque: 40 },
        Family::Dynamixel => Addresses { id: 7, torque: 64 },
    }
}

impl Daemon {
    pub(super) fn assign_id(&mut self, id: u8, model: u16) -> Result<(), String> {
        if self.ladder.mode() != Mode::SetUp || !matches!(self.run, Run::Idle) {
            return Err(OUTSIDE_SET_UP.into());
        }

        if !self.config.ids.contains(&id) {
            return Err(format!("This robot has no servo {id}."));
        }

        let layout = self.config.ids.clone();
        let Holder::Armed(layer) = &mut self.holder else {
            return Err(OUTSIDE_SET_UP.into());
        };
        let from = new_servo(layer.bus_mut(), &layout, id, model)?;

        if from != id {
            layer.renumber(from, id).map_err(|error| refused_write(&error))?;
        }

        read_back(layer.bus_mut(), id)?;

        let at_us = self.now_us();

        self.push(DaemonEvent::Assigned { at_us, id });

        Ok(())
    }
}

fn new_servo(bus: &mut ReadBus, layout: &[u8], target: u8, model: u16) -> Result<u8, String> {
    let census = bus.census(CENSUS_WINDOW_US).map_err(|_| Fault::BusGone.message())?;
    let fresh: Vec<u8> = census
        .ids
        .iter()
        .copied()
        .filter(|id| *id == FACTORY_ID || !layout.contains(id))
        .collect();

    if target != FACTORY_ID && census.ids.contains(&target) {
        return Err(format!(
            "Another servo already has ID {target}. Unplug it, then plug in the new one."
        ));
    }

    let [from] = fresh.as_slice() else {
        return Err(if fresh.is_empty() && !census.clashed {
            NONE_NEW
        } else {
            MANY_NEW
        }
        .into());
    };

    check_new_servo(bus, *from, model)?;

    Ok(*from)
}

fn check_new_servo(bus: &mut ReadBus, id: u8, model: u16) -> Result<(), String> {
    match check_servo(bus, id, model) {
        Ok(_) => {}
        Err(Fault::NoReply { .. }) => return Err(NONE_NEW.into()),
        Err(Fault::DuplicateId { .. } | Fault::Garbled { .. } | Fault::WrongId { .. }) => return Err(MANY_NEW.into()),
        Err(fault) => return Err(fault.message()),
    }

    let torque = addresses(bus.family()).torque;

    match bus.read(id, torque, 1, SCAN_TIMEOUT_US) {
        Ok(Reply::Status(status)) if status.data == [0] => Ok(()),
        Ok(Reply::Status(_)) => Err(MOTOR_ON.into()),
        Ok(_) => Err(NONE_NEW.into()),
        Err(_) => Err(Fault::BusGone.message()),
    }
}

fn read_back(bus: &mut ReadBus, id: u8) -> Result<(), String> {
    let address = addresses(bus.family()).id;

    match bus.read(id, address, 1, SCAN_TIMEOUT_US) {
        Ok(Reply::Status(status)) if status.data == [id] => Ok(()),
        Err(_) => Err(Fault::BusGone.message()),
        Ok(_) => Err(format!(
            "Servo {id} didn't keep its new ID. Unplug it and plug it back in, then try again."
        )),
    }
}

fn refused_write(error: &WriteError) -> String {
    match error {
        WriteError::MotorsOn => MOTOR_ON.into(),
        WriteError::Sealed => OUTSIDE_SET_UP.into(),
        _ => Fault::BusGone.message(),
    }
}
