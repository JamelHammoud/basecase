mod sealed {
    pub trait Sealed {}
}

pub trait Plain: sealed::Sealed + Copy + Default + Send + Sync + 'static {}

impl sealed::Sealed for f32 {}
impl sealed::Sealed for u32 {}
impl Plain for f32 {}
impl Plain for u32 {}
