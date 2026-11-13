use super::wire::{each, finite, floats, none_or_each, text, texts, unique, write_floats, write_texts};
use super::{Ros2Error, MAX_ROS_JOINTS};
use crate::cdr::{Reader, Writer};

const MICROS_PER_SECOND: u64 = 1_000_000;
const NANOS_PER_MICRO: u64 = 1_000;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Time {
    pub sec: i32,
    pub nanosec: u32,
}

pub type Duration = Time;

impl Time {
    pub fn from_micros(micros: u64) -> Self {
        Self {
            sec: i32::try_from(micros / MICROS_PER_SECOND).unwrap_or(i32::MAX),
            nanosec: u32::try_from((micros % MICROS_PER_SECOND) * NANOS_PER_MICRO).unwrap_or(0),
        }
    }

    pub fn as_micros(self) -> Option<u64> {
        let seconds = u64::try_from(self.sec).ok()?;

        Some(seconds * MICROS_PER_SECOND + u64::from(self.nanosec) / NANOS_PER_MICRO)
    }

    pub(super) fn write(self, writer: &mut Writer) {
        writer.i32(self.sec);
        writer.u32(self.nanosec);
    }

    pub(super) fn read(reader: &mut Reader) -> Result<Self, Ros2Error> {
        Ok(Self {
            sec: reader.i32()?,
            nanosec: reader.u32()?,
        })
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Header {
    pub stamp: Time,
    pub frame_id: String,
}

impl Header {
    pub(super) fn write(&self, writer: &mut Writer) {
        self.stamp.write(writer);
        writer.string(&self.frame_id);
    }

    pub(super) fn read(reader: &mut Reader) -> Result<Self, Ros2Error> {
        Ok(Self {
            stamp: Time::read(reader)?,
            frame_id: text(reader)?,
        })
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct JointState {
    pub header: Header,
    pub name: Vec<String>,
    pub position: Vec<f64>,
    pub velocity: Vec<f64>,
    pub effort: Vec<f64>,
}

impl JointState {
    pub fn encode(&self) -> Vec<u8> {
        let mut writer = Writer::new();

        self.header.write(&mut writer);
        write_texts(&mut writer, &self.name);
        write_floats(&mut writer, &self.position);
        write_floats(&mut writer, &self.velocity);
        write_floats(&mut writer, &self.effort);
        writer.finish()
    }

    pub fn decode(payload: &[u8]) -> Result<Self, Ros2Error> {
        let mut reader = Reader::new(payload)?;
        let state = Self {
            header: Header::read(&mut reader)?,
            name: texts(&mut reader, MAX_ROS_JOINTS)?,
            position: floats(&mut reader, MAX_ROS_JOINTS)?,
            velocity: floats(&mut reader, MAX_ROS_JOINTS)?,
            effort: floats(&mut reader, MAX_ROS_JOINTS)?,
        };

        state.checked()
    }

    fn checked(self) -> Result<Self, Ros2Error> {
        let count = self.name.len();

        each(&self.position, count)?;
        none_or_each(&self.velocity, count)?;
        none_or_each(&self.effort, count)?;
        unique(&self.name)?;
        finite(&self.position)?;

        Ok(self)
    }

    pub fn position_of(&self, name: &str) -> Option<f64> {
        let at = self.name.iter().position(|candidate| candidate == name)?;

        self.position.get(at).copied()
    }
}
