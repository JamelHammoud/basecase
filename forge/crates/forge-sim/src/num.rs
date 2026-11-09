use std::ops::{Add, Mul, Neg, Sub};

pub trait Num:
    Copy + Add<Output = Self> + Sub<Output = Self> + Mul<Output = Self> + Neg<Output = Self> + Mul<f64, Output = Self>
{
}

impl<T> Num for T where
    T: Copy + Add<Output = T> + Sub<Output = T> + Mul<Output = T> + Neg<Output = T> + Mul<f64, Output = T>
{
}
