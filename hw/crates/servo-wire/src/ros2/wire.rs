use super::{Ros2Error, MAX_ROS_STRING};
use crate::cdr::{Reader, Writer};

pub const SMALLEST_STRING: usize = 4;
pub const FLOAT: usize = 8;

pub fn length(len: usize) -> u32 {
    u32::try_from(len).unwrap_or(u32::MAX)
}

pub fn count(reader: &mut Reader, smallest: usize, cap: usize) -> Result<usize, Ros2Error> {
    let count = usize::try_from(reader.u32()?).map_err(|_| Ros2Error::TooMany)?;

    if count > cap {
        return Err(Ros2Error::TooMany);
    }

    if count.saturating_mul(smallest) > reader.remaining() {
        return Err(Ros2Error::Short);
    }

    Ok(count)
}

pub fn text(reader: &mut Reader) -> Result<String, Ros2Error> {
    let size = usize::try_from(reader.u32()?).map_err(|_| Ros2Error::TooLong)?;

    if size > MAX_ROS_STRING + 1 {
        return Err(Ros2Error::TooLong);
    }

    let Some((&0, text)) = reader.raw(size)?.split_last() else {
        return Err(Ros2Error::NotText);
    };

    if text.contains(&0) {
        return Err(Ros2Error::NotText);
    }

    String::from_utf8(text.to_vec()).map_err(|_| Ros2Error::NotText)
}

pub fn texts(reader: &mut Reader, cap: usize) -> Result<Vec<String>, Ros2Error> {
    let count = count(reader, SMALLEST_STRING, cap)?;

    (0..count).map(|_| text(reader)).collect()
}

pub fn floats(reader: &mut Reader, cap: usize) -> Result<Vec<f64>, Ros2Error> {
    let count = count(reader, FLOAT, cap)?;

    (0..count).map(|_| reader.f64().map_err(Ros2Error::from)).collect()
}

pub fn write_texts(writer: &mut Writer, values: &[String]) {
    writer.u32(length(values.len()));

    for value in values {
        writer.string(value);
    }
}

pub fn write_floats(writer: &mut Writer, values: &[f64]) {
    writer.u32(length(values.len()));

    for value in values {
        writer.f64(*value);
    }
}

pub fn unique(names: &[String]) -> Result<(), Ros2Error> {
    let repeated = names.iter().enumerate().any(|(at, name)| names[..at].contains(name));

    if repeated {
        Err(Ros2Error::Duplicate)
    } else {
        Ok(())
    }
}

pub fn finite(values: &[f64]) -> Result<(), Ros2Error> {
    if values.iter().all(|value| value.is_finite()) {
        Ok(())
    } else {
        Err(Ros2Error::NotFinite)
    }
}

pub fn none_or_each(values: &[f64], count: usize) -> Result<(), Ros2Error> {
    if values.is_empty() || values.len() == count {
        Ok(())
    } else {
        Err(Ros2Error::Mismatched)
    }
}

pub fn each(values: &[f64], count: usize) -> Result<(), Ros2Error> {
    if values.len() == count {
        Ok(())
    } else {
        Err(Ros2Error::Mismatched)
    }
}
