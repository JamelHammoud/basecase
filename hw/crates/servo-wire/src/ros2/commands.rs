use super::joint_state::{Duration, Header};
use super::wire::{
    count, each, finite, floats, length, none_or_each, text, texts, unique, write_floats, write_texts, SMALLEST_STRING,
};
use super::{Ros2Error, MAX_ROS_JOINTS, MAX_TRAJECTORY_POINTS};
use crate::cdr::{Reader, Writer};

const SMALLEST_DIMENSION: usize = SMALLEST_STRING + 8;
const SMALLEST_POINT: usize = 4 * 4 + 8;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MultiArrayDimension {
    pub label: String,
    pub size: u32,
    pub stride: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MultiArrayLayout {
    pub dim: Vec<MultiArrayDimension>,
    pub data_offset: u32,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Float64MultiArray {
    pub layout: MultiArrayLayout,
    pub data: Vec<f64>,
}

impl Float64MultiArray {
    pub fn new(data: Vec<f64>) -> Self {
        Self {
            layout: MultiArrayLayout::default(),
            data,
        }
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut writer = Writer::new();

        writer.u32(length(self.layout.dim.len()));

        for dimension in &self.layout.dim {
            writer.string(&dimension.label);
            writer.u32(dimension.size);
            writer.u32(dimension.stride);
        }

        writer.u32(self.layout.data_offset);
        write_floats(&mut writer, &self.data);
        writer.finish()
    }

    pub fn decode(payload: &[u8]) -> Result<Self, Ros2Error> {
        let mut reader = Reader::new(payload)?;
        let dimensions = count(&mut reader, SMALLEST_DIMENSION, MAX_ROS_JOINTS)?;
        let dim = (0..dimensions)
            .map(|_| read_dimension(&mut reader))
            .collect::<Result<_, _>>()?;
        let layout = MultiArrayLayout {
            dim,
            data_offset: reader.u32()?,
        };
        let data = floats(&mut reader, MAX_ROS_JOINTS)?;

        finite(&data)?;

        Ok(Self { layout, data })
    }
}

fn read_dimension(reader: &mut Reader) -> Result<MultiArrayDimension, Ros2Error> {
    Ok(MultiArrayDimension {
        label: text(reader)?,
        size: reader.u32()?,
        stride: reader.u32()?,
    })
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct JointTrajectoryPoint {
    pub positions: Vec<f64>,
    pub velocities: Vec<f64>,
    pub accelerations: Vec<f64>,
    pub effort: Vec<f64>,
    pub time_from_start: Duration,
}

impl JointTrajectoryPoint {
    pub fn at(positions: Vec<f64>, time_from_start: Duration) -> Self {
        Self {
            positions,
            time_from_start,
            ..Self::default()
        }
    }

    fn write(&self, writer: &mut Writer) {
        write_floats(writer, &self.positions);
        write_floats(writer, &self.velocities);
        write_floats(writer, &self.accelerations);
        write_floats(writer, &self.effort);
        self.time_from_start.write(writer);
    }

    fn read(reader: &mut Reader) -> Result<Self, Ros2Error> {
        Ok(Self {
            positions: floats(reader, MAX_ROS_JOINTS)?,
            velocities: floats(reader, MAX_ROS_JOINTS)?,
            accelerations: floats(reader, MAX_ROS_JOINTS)?,
            effort: floats(reader, MAX_ROS_JOINTS)?,
            time_from_start: Duration::read(reader)?,
        })
    }

    fn checked(&self, joints: usize) -> Result<(), Ros2Error> {
        each(&self.positions, joints)?;
        none_or_each(&self.velocities, joints)?;
        none_or_each(&self.accelerations, joints)?;
        none_or_each(&self.effort, joints)?;
        finite(&self.positions)
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct JointTrajectory {
    pub header: Header,
    pub joint_names: Vec<String>,
    pub points: Vec<JointTrajectoryPoint>,
}

impl JointTrajectory {
    pub fn encode(&self) -> Vec<u8> {
        let mut writer = Writer::new();

        self.header.write(&mut writer);
        write_texts(&mut writer, &self.joint_names);
        writer.u32(length(self.points.len()));

        for point in &self.points {
            point.write(&mut writer);
        }

        writer.finish()
    }

    pub fn decode(payload: &[u8]) -> Result<Self, Ros2Error> {
        let mut reader = Reader::new(payload)?;
        let header = Header::read(&mut reader)?;
        let joint_names = texts(&mut reader, MAX_ROS_JOINTS)?;
        let points = count(&mut reader, SMALLEST_POINT, MAX_TRAJECTORY_POINTS)?;
        let points: Vec<JointTrajectoryPoint> = (0..points)
            .map(|_| JointTrajectoryPoint::read(&mut reader))
            .collect::<Result<_, _>>()?;

        unique(&joint_names)?;

        for point in &points {
            point.checked(joint_names.len())?;
        }

        Ok(Self {
            header,
            joint_names,
            points,
        })
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Vector3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vector3 {
    fn write(self, writer: &mut Writer) {
        writer.f64(self.x);
        writer.f64(self.y);
        writer.f64(self.z);
    }

    fn read(reader: &mut Reader) -> Result<Self, Ros2Error> {
        Ok(Self {
            x: reader.f64()?,
            y: reader.f64()?,
            z: reader.f64()?,
        })
    }

    fn values(self) -> [f64; 3] {
        [self.x, self.y, self.z]
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Twist {
    pub linear: Vector3,
    pub angular: Vector3,
}

impl Twist {
    pub fn planar(forward: f64, turn: f64) -> Self {
        Self {
            linear: Vector3 {
                x: forward,
                ..Vector3::default()
            },
            angular: Vector3 {
                z: turn,
                ..Vector3::default()
            },
        }
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut writer = Writer::new();

        self.linear.write(&mut writer);
        self.angular.write(&mut writer);
        writer.finish()
    }

    pub fn decode(payload: &[u8]) -> Result<Self, Ros2Error> {
        let mut reader = Reader::new(payload)?;
        let twist = Self {
            linear: Vector3::read(&mut reader)?,
            angular: Vector3::read(&mut reader)?,
        };

        finite(&twist.linear.values())?;
        finite(&twist.angular.values())?;

        Ok(twist)
    }
}
