use std::ops::{Add, AddAssign, Div, Mul, MulAssign, Neg, Sub, SubAssign};

pub const LANES: usize = 4;

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(C, align(32))]
pub struct V(pub [f64; LANES]);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(C, align(32))]
pub struct M(pub [u64; LANES]);

pub const ZERO: V = V([0.0; LANES]);
pub const ONE: V = V([1.0; LANES]);

macro_rules! lanewise {
    ($trait:ident, $fn:ident, $op:tt) => {
        impl $trait for V {
            type Output = V;

            #[inline(always)]
            fn $fn(self, o: V) -> V {
                let mut r = [0.0; LANES];

                for i in 0..LANES {
                    r[i] = self.0[i] $op o.0[i];
                }

                V(r)
            }
        }

        impl $trait<f64> for V {
            type Output = V;

            #[inline(always)]
            fn $fn(self, o: f64) -> V {
                let mut r = [0.0; LANES];

                for i in 0..LANES {
                    r[i] = self.0[i] $op o;
                }

                V(r)
            }
        }
    };
}

lanewise!(Add, add, +);
lanewise!(Sub, sub, -);
lanewise!(Mul, mul, *);
lanewise!(Div, div, /);

impl Neg for V {
    type Output = V;

    #[inline(always)]
    fn neg(self) -> V {
        let mut r = [0.0; LANES];

        for i in 0..LANES {
            r[i] = -self.0[i];
        }

        V(r)
    }
}

impl AddAssign for V {
    #[inline(always)]
    fn add_assign(&mut self, o: V) {
        *self = *self + o;
    }
}

impl SubAssign for V {
    #[inline(always)]
    fn sub_assign(&mut self, o: V) {
        *self = *self - o;
    }
}

impl MulAssign for V {
    #[inline(always)]
    fn mul_assign(&mut self, o: V) {
        *self = *self * o;
    }
}

impl Default for V {
    fn default() -> Self {
        ZERO
    }
}

macro_rules! compare {
    ($name:ident, $op:tt) => {
        #[inline(always)]
        pub fn $name(self, o: V) -> M {
            let mut r = [0u64; LANES];

            for i in 0..LANES {
                r[i] = if self.0[i] $op o.0[i] { u64::MAX } else { 0 };
            }

            M(r)
        }
    };
}

impl V {
    #[inline(always)]
    pub const fn splat(x: f64) -> V {
        V([x, x, x, x])
    }

    #[inline(always)]
    pub fn map(self, f: impl Fn(f64) -> f64) -> V {
        let mut r = [0.0; LANES];

        for i in 0..LANES {
            r[i] = f(self.0[i]);
        }

        V(r)
    }

    #[inline(always)]
    pub fn sqrt(self) -> V {
        self.map(f64::sqrt)
    }

    #[inline(always)]
    pub fn abs(self) -> V {
        self.map(f64::abs)
    }

    #[inline(always)]
    pub fn max(self, o: V) -> V {
        let mut r = [0.0; LANES];

        for i in 0..LANES {
            r[i] = if self.0[i] < o.0[i] { o.0[i] } else { self.0[i] };
        }

        V(r)
    }

    #[inline(always)]
    pub fn min(self, o: V) -> V {
        let mut r = [0.0; LANES];

        for i in 0..LANES {
            r[i] = if self.0[i] < o.0[i] { self.0[i] } else { o.0[i] };
        }

        V(r)
    }

    #[inline(always)]
    pub fn clip(self, lo: V, hi: V) -> V {
        let mut r = [0.0; LANES];

        for i in 0..LANES {
            let x = self.0[i];

            r[i] = if x < lo.0[i] {
                lo.0[i]
            } else if x > hi.0[i] {
                hi.0[i]
            } else {
                x
            };
        }

        V(r)
    }

    compare!(lt, <);
    compare!(le, <=);
    compare!(gt, >);
    compare!(ge, >=);
    compare!(eq, ==);
    compare!(ne, !=);

    #[inline(always)]
    pub fn lane(self, i: usize) -> f64 {
        self.0[i]
    }
}

impl M {
    pub const NONE: M = M([0; LANES]);
    pub const ALL: M = M([u64::MAX; LANES]);

    #[inline(always)]
    pub fn from_fn(f: impl Fn(usize) -> bool) -> M {
        let mut r = [0u64; LANES];

        for (i, v) in r.iter_mut().enumerate() {
            *v = if f(i) { u64::MAX } else { 0 };
        }

        M(r)
    }

    #[inline(always)]
    pub fn and(self, o: M) -> M {
        let mut r = [0u64; LANES];

        for i in 0..LANES {
            r[i] = self.0[i] & o.0[i];
        }

        M(r)
    }

    #[inline(always)]
    pub fn or(self, o: M) -> M {
        let mut r = [0u64; LANES];

        for i in 0..LANES {
            r[i] = self.0[i] | o.0[i];
        }

        M(r)
    }

    #[inline(always)]
    pub fn flip(self) -> M {
        let mut r = [0u64; LANES];

        for i in 0..LANES {
            r[i] = !self.0[i];
        }

        M(r)
    }

    #[inline(always)]
    pub fn any(self) -> bool {
        self.0.iter().any(|&b| b != 0)
    }

    #[inline(always)]
    pub fn all(self) -> bool {
        self.0.iter().all(|&b| b != 0)
    }

    #[inline(always)]
    pub fn get(self, i: usize) -> bool {
        self.0[i] != 0
    }

    #[inline(always)]
    pub fn select(self, a: V, b: V) -> V {
        let mut r = [0.0; LANES];

        for i in 0..LANES {
            r[i] = f64::from_bits((a.0[i].to_bits() & self.0[i]) | (b.0[i].to_bits() & !self.0[i]));
        }

        V(r)
    }

    #[inline(always)]
    pub fn mask(self, a: V) -> V {
        self.select(a, ZERO)
    }
}

#[inline(always)]
pub fn dot3(a: &[V], b: &[V]) -> V {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
