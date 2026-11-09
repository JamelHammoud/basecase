use crate::num::Num;
use std::ops::{Add, AddAssign, Div, Mul, Neg, Sub, SubAssign};

pub trait Real: Num + Div<Output = Self> + AddAssign + SubAssign + PartialOrd + std::fmt::Debug {
    fn c(x: f64) -> Self;
    fn re(self) -> f64;
    fn sqrt(self) -> Self;
    fn sin_cos(self) -> (Self, Self);
    fn exp(self) -> Self;
    fn ln_1p(self) -> Self;
}

impl Real for f64 {
    #[inline(always)]
    fn c(x: f64) -> Self {
        x
    }

    #[inline(always)]
    fn re(self) -> f64 {
        self
    }

    #[inline(always)]
    fn sqrt(self) -> Self {
        f64::sqrt(self)
    }

    #[inline(always)]
    fn sin_cos(self) -> (Self, Self) {
        f64::sin_cos(self)
    }

    #[inline(always)]
    fn exp(self) -> Self {
        f64::exp(self)
    }

    #[inline(always)]
    fn ln_1p(self) -> Self {
        f64::ln_1p(self)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Dual<const N: usize> {
    pub re: f64,
    pub du: [f64; N],
}

impl<const N: usize> Dual<N> {
    #[inline(always)]
    pub fn constant(re: f64) -> Self {
        Self { re, du: [0.0; N] }
    }

    #[inline(always)]
    pub fn seeded(re: f64, direction: usize) -> Self {
        let mut d = Self::constant(re);

        d.du[direction] = 1.0;
        d
    }

    #[inline(always)]
    fn chain(self, value: f64, slope: f64) -> Self {
        let mut du = [0.0; N];

        for k in 0..N {
            du[k] = self.du[k] * slope;
        }

        Self { re: value, du }
    }
}

impl<const N: usize> PartialEq for Dual<N> {
    fn eq(&self, o: &Self) -> bool {
        self.re == o.re
    }
}

impl<const N: usize> PartialOrd for Dual<N> {
    fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> {
        self.re.partial_cmp(&o.re)
    }
}

impl<const N: usize> Add for Dual<N> {
    type Output = Self;

    #[inline(always)]
    fn add(self, o: Self) -> Self {
        let mut du = [0.0; N];

        for k in 0..N {
            du[k] = self.du[k] + o.du[k];
        }

        Self { re: self.re + o.re, du }
    }
}

impl<const N: usize> Sub for Dual<N> {
    type Output = Self;

    #[inline(always)]
    fn sub(self, o: Self) -> Self {
        let mut du = [0.0; N];

        for k in 0..N {
            du[k] = self.du[k] - o.du[k];
        }

        Self { re: self.re - o.re, du }
    }
}

impl<const N: usize> Mul for Dual<N> {
    type Output = Self;

    #[inline(always)]
    fn mul(self, o: Self) -> Self {
        let mut du = [0.0; N];

        for k in 0..N {
            du[k] = self.du[k] * o.re + o.du[k] * self.re;
        }

        Self { re: self.re * o.re, du }
    }
}

impl<const N: usize> Div for Dual<N> {
    type Output = Self;

    #[inline(always)]
    fn div(self, o: Self) -> Self {
        let inv = 1.0 / o.re;
        let re = self.re * inv;
        let mut du = [0.0; N];

        for k in 0..N {
            du[k] = (self.du[k] - re * o.du[k]) * inv;
        }

        Self { re, du }
    }
}

impl<const N: usize> Mul<f64> for Dual<N> {
    type Output = Self;

    #[inline(always)]
    fn mul(self, o: f64) -> Self {
        self.chain(self.re * o, o)
    }
}

impl<const N: usize> Neg for Dual<N> {
    type Output = Self;

    #[inline(always)]
    fn neg(self) -> Self {
        self.chain(-self.re, -1.0)
    }
}

impl<const N: usize> AddAssign for Dual<N> {
    #[inline(always)]
    fn add_assign(&mut self, o: Self) {
        *self = *self + o;
    }
}

impl<const N: usize> SubAssign for Dual<N> {
    #[inline(always)]
    fn sub_assign(&mut self, o: Self) {
        *self = *self - o;
    }
}

impl<const N: usize> Real for Dual<N> {
    #[inline(always)]
    fn c(x: f64) -> Self {
        Self::constant(x)
    }

    #[inline(always)]
    fn re(self) -> f64 {
        self.re
    }

    #[inline(always)]
    fn sqrt(self) -> Self {
        let root = self.re.sqrt();

        self.chain(root, 0.5 / root)
    }

    #[inline(always)]
    fn sin_cos(self) -> (Self, Self) {
        let (s, c) = self.re.sin_cos();

        (self.chain(s, c), self.chain(c, -s))
    }

    #[inline(always)]
    fn exp(self) -> Self {
        let e = self.re.exp();

        self.chain(e, e)
    }

    #[inline(always)]
    fn ln_1p(self) -> Self {
        self.chain(self.re.ln_1p(), 1.0 / (1.0 + self.re))
    }
}
