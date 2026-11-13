use super::cdr::{Reader, Short, Writer};
use super::crc_of_image;
use super::image::Image;

pub const MOTOR_SLOTS: usize = 35;
pub const REMOTE_BYTES: usize = 40;

trait Sink {
    fn begin_struct(&mut self);
    fn u8(&mut self, value: u8);
    fn i16(&mut self, value: i16);
    fn u32(&mut self, value: u32);
    fn f32(&mut self, value: f32);
}

impl Sink for Writer {
    fn begin_struct(&mut self) {}

    fn u8(&mut self, value: u8) {
        Writer::u8(self, value);
    }

    fn i16(&mut self, value: i16) {
        Writer::i16(self, value);
    }

    fn u32(&mut self, value: u32) {
        Writer::u32(self, value);
    }

    fn f32(&mut self, value: f32) {
        Writer::f32(self, value);
    }
}

impl Sink for Image {
    fn begin_struct(&mut self) {
        self.align(4);
    }

    fn u8(&mut self, value: u8) {
        Image::u8(self, value);
    }

    fn i16(&mut self, value: i16) {
        Image::i16(self, value);
    }

    fn u32(&mut self, value: u32) {
        Image::u32(self, value);
    }

    fn f32(&mut self, value: f32) {
        Image::f32(self, value);
    }
}

fn floats(sink: &mut impl Sink, values: &[f32]) {
    for value in values {
        sink.f32(*value);
    }
}

fn words(sink: &mut impl Sink, values: &[u32]) {
    for value in values {
        sink.u32(*value);
    }
}

fn read_floats<const N: usize>(reader: &mut Reader) -> Result<[f32; N], Short> {
    let mut out = [0.0; N];

    for value in &mut out {
        *value = reader.f32()?;
    }

    Ok(out)
}

fn read_words<const N: usize>(reader: &mut Reader) -> Result<[u32; N], Short> {
    let mut out = [0; N];

    for value in &mut out {
        *value = reader.u32()?;
    }

    Ok(out)
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct MotorCmd {
    pub mode: u8,
    pub q: f32,
    pub dq: f32,
    pub tau: f32,
    pub kp: f32,
    pub kd: f32,
    pub reserve: u32,
}

impl MotorCmd {
    fn write(&self, sink: &mut impl Sink) {
        sink.begin_struct();
        sink.u8(self.mode);
        floats(sink, &[self.q, self.dq, self.tau, self.kp, self.kd]);
        sink.u32(self.reserve);
    }

    fn read(reader: &mut Reader) -> Result<Self, Short> {
        let mode = reader.u8()?;
        let [q, dq, tau, kp, kd] = read_floats(reader)?;

        Ok(Self {
            mode,
            q,
            dq,
            tau,
            kp,
            kd,
            reserve: reader.u32()?,
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct LowCmd {
    pub mode_pr: u8,
    pub mode_machine: u8,
    pub motor_cmd: [MotorCmd; MOTOR_SLOTS],
    pub reserve: [u32; 4],
    pub crc: u32,
}

impl Default for LowCmd {
    fn default() -> Self {
        Self {
            mode_pr: 0,
            mode_machine: 0,
            motor_cmd: [MotorCmd::default(); MOTOR_SLOTS],
            reserve: [0; 4],
            crc: 0,
        }
    }
}

impl LowCmd {
    fn write(&self, sink: &mut impl Sink) {
        sink.u8(self.mode_pr);
        sink.u8(self.mode_machine);

        for motor in &self.motor_cmd {
            motor.write(sink);
        }

        words(sink, &self.reserve);
        sink.u32(self.crc);
    }

    pub fn image(&self) -> Vec<u8> {
        let mut image = Image::default();

        self.write(&mut image);
        image.finish()
    }

    pub fn computed_crc(&self) -> u32 {
        crc_of_image(&self.image())
    }

    pub fn crc_ok(&self) -> bool {
        self.crc == self.computed_crc()
    }

    pub fn with_crc(mut self) -> Self {
        self.crc = self.computed_crc();
        self
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut writer = Writer::new();

        self.write(&mut writer);
        writer.finish()
    }

    pub fn decode(payload: &[u8]) -> Result<Self, Short> {
        let mut reader = Reader::new(payload)?;
        let mode_pr = reader.u8()?;
        let mode_machine = reader.u8()?;
        let mut motor_cmd = [MotorCmd::default(); MOTOR_SLOTS];

        for motor in &mut motor_cmd {
            *motor = MotorCmd::read(&mut reader)?;
        }

        Ok(Self {
            mode_pr,
            mode_machine,
            motor_cmd,
            reserve: read_words(&mut reader)?,
            crc: reader.u32()?,
        })
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct ImuState {
    pub quaternion: [f32; 4],
    pub gyroscope: [f32; 3],
    pub accelerometer: [f32; 3],
    pub rpy: [f32; 3],
    pub temperature: i16,
}

impl ImuState {
    fn write(&self, sink: &mut impl Sink) {
        sink.begin_struct();
        floats(sink, &self.quaternion);
        floats(sink, &self.gyroscope);
        floats(sink, &self.accelerometer);
        floats(sink, &self.rpy);
        sink.i16(self.temperature);
    }

    fn read(reader: &mut Reader) -> Result<Self, Short> {
        Ok(Self {
            quaternion: read_floats(reader)?,
            gyroscope: read_floats(reader)?,
            accelerometer: read_floats(reader)?,
            rpy: read_floats(reader)?,
            temperature: reader.i16()?,
        })
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct MotorState {
    pub mode: u8,
    pub q: f32,
    pub dq: f32,
    pub ddq: f32,
    pub tau_est: f32,
    pub temperature: [i16; 2],
    pub vol: f32,
    pub sensor: [u32; 2],
    pub motorstate: u32,
    pub reserve: [u32; 4],
}

impl MotorState {
    fn write(&self, sink: &mut impl Sink) {
        sink.begin_struct();
        sink.u8(self.mode);
        floats(sink, &[self.q, self.dq, self.ddq, self.tau_est]);
        sink.i16(self.temperature[0]);
        sink.i16(self.temperature[1]);
        sink.f32(self.vol);
        words(sink, &self.sensor);
        sink.u32(self.motorstate);
        words(sink, &self.reserve);
    }

    fn read(reader: &mut Reader) -> Result<Self, Short> {
        let mode = reader.u8()?;
        let [q, dq, ddq, tau_est] = read_floats(reader)?;
        let temperature = [reader.i16()?, reader.i16()?];

        Ok(Self {
            mode,
            q,
            dq,
            ddq,
            tau_est,
            temperature,
            vol: reader.f32()?,
            sensor: read_words(reader)?,
            motorstate: reader.u32()?,
            reserve: read_words(reader)?,
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct LowState {
    pub version: [u32; 2],
    pub mode_pr: u8,
    pub mode_machine: u8,
    pub tick: u32,
    pub imu_state: ImuState,
    pub motor_state: [MotorState; MOTOR_SLOTS],
    pub wireless_remote: [u8; REMOTE_BYTES],
    pub reserve: [u32; 4],
    pub crc: u32,
}

impl Default for LowState {
    fn default() -> Self {
        Self {
            version: [0; 2],
            mode_pr: 0,
            mode_machine: 0,
            tick: 0,
            imu_state: ImuState::default(),
            motor_state: [MotorState::default(); MOTOR_SLOTS],
            wireless_remote: [0; REMOTE_BYTES],
            reserve: [0; 4],
            crc: 0,
        }
    }
}

impl LowState {
    fn write(&self, sink: &mut impl Sink) {
        words(sink, &self.version);
        sink.u8(self.mode_pr);
        sink.u8(self.mode_machine);
        sink.u32(self.tick);
        self.imu_state.write(sink);

        for motor in &self.motor_state {
            motor.write(sink);
        }

        for byte in self.wireless_remote {
            sink.u8(byte);
        }

        words(sink, &self.reserve);
        sink.u32(self.crc);
    }

    pub fn image(&self) -> Vec<u8> {
        let mut image = Image::default();

        self.write(&mut image);
        image.finish()
    }

    pub fn computed_crc(&self) -> u32 {
        crc_of_image(&self.image())
    }

    pub fn crc_ok(&self) -> bool {
        self.crc == self.computed_crc()
    }

    pub fn with_crc(mut self) -> Self {
        self.crc = self.computed_crc();
        self
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut writer = Writer::new();

        self.write(&mut writer);
        writer.finish()
    }

    pub fn decode(payload: &[u8]) -> Result<Self, Short> {
        let mut reader = Reader::new(payload)?;
        let version = read_words(&mut reader)?;
        let mode_pr = reader.u8()?;
        let mode_machine = reader.u8()?;
        let tick = reader.u32()?;
        let imu_state = ImuState::read(&mut reader)?;
        let mut motor_state = [MotorState::default(); MOTOR_SLOTS];

        for motor in &mut motor_state {
            *motor = MotorState::read(&mut reader)?;
        }

        let mut wireless_remote = [0u8; REMOTE_BYTES];

        for byte in &mut wireless_remote {
            *byte = reader.u8()?;
        }

        Ok(Self {
            version,
            mode_pr,
            mode_machine,
            tick,
            imu_state,
            motor_state,
            wireless_remote,
            reserve: read_words(&mut reader)?,
            crc: reader.u32()?,
        })
    }
}

#[cfg(test)]
#[path = "hg_tests.rs"]
mod tests;
