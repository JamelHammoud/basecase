use crate::model::{Data, Model};
use std::ffi::{c_char, c_int, c_void, CString};

extern "C" {
    fn forge_model_array(
        m: *const c_void,
        name: *const c_char,
        kind: *mut c_int,
        rows: *mut c_int,
        cols: *mut c_int,
    ) -> *mut c_void;
    fn forge_model_size(m: *const c_void, name: *const c_char, value: *mut i64) -> c_int;
    fn forge_model_option(m: *const c_void, name: *const c_char, out: *mut f64) -> c_int;
    fn forge_data_array(
        m: *const c_void,
        d: *const c_void,
        name: *const c_char,
        kind: *mut c_int,
        rows: *mut c_int,
        cols: *mut c_int,
    ) -> *mut c_void;
    fn forge_data_ncon(d: *const c_void) -> c_int;
    fn forge_data_nefc(d: *const c_void) -> c_int;
    fn forge_data_contact(d: *const c_void, i: c_int, dist: *mut f64, pos: *mut f64, frame: *mut f64, geom: *mut c_int);
    fn forge_data_efc(d: *const c_void, name: *const c_char) -> *mut f64;
    fn forge_data_efc_type(d: *const c_void) -> *mut c_int;
}

#[derive(Clone, Copy, Debug)]
pub enum Values<'a> {
    F64(&'a [f64]),
    I32(&'a [i32]),
    F32(&'a [f32]),
    U8(&'a [u8]),
}

#[derive(Clone, Copy, Debug)]
pub struct Array<'a> {
    pub rows: usize,
    pub cols: usize,
    pub values: Values<'a>,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Contact {
    pub dist: f64,
    pub pos: [f64; 3],
    pub frame: [f64; 9],
    pub geom: [i32; 2],
}

fn c_name(name: &str) -> CString {
    CString::new(name).expect("field names have no NUL")
}

fn wrap<'a>(ptr: *mut c_void, kind: c_int, rows: c_int, cols: c_int) -> Option<Array<'a>> {
    let rows = usize::try_from(rows).ok()?;
    let cols = usize::try_from(cols).ok()?;
    let len = rows * cols;

    if len == 0 {
        return Some(Array {
            rows,
            cols,
            values: Values::F64(&[]),
        });
    }

    if ptr.is_null() {
        return None;
    }

    let values = unsafe {
        match kind {
            0 => Values::F64(std::slice::from_raw_parts(ptr as *const f64, len)),
            1 => Values::I32(std::slice::from_raw_parts(ptr as *const i32, len)),
            2 => Values::F32(std::slice::from_raw_parts(ptr as *const f32, len)),
            3 => Values::U8(std::slice::from_raw_parts(ptr as *const u8, len)),
            _ => return None,
        }
    };

    Some(Array { rows, cols, values })
}

impl<'a> Array<'a> {
    pub fn f64s(&self) -> Option<&'a [f64]> {
        match self.values {
            Values::F64(v) => Some(v),
            _ if self.rows * self.cols == 0 => Some(&[]),
            _ => None,
        }
    }

    pub fn i32s(&self) -> Option<&'a [i32]> {
        match self.values {
            Values::I32(v) => Some(v),
            _ if self.rows * self.cols == 0 => Some(&[]),
            _ => None,
        }
    }

    pub fn f32s(&self) -> Option<&'a [f32]> {
        match self.values {
            Values::F32(v) => Some(v),
            _ if self.rows * self.cols == 0 => Some(&[]),
            _ => None,
        }
    }

    pub fn u8s(&self) -> Option<&'a [u8]> {
        match self.values {
            Values::U8(v) => Some(v),
            _ if self.rows * self.cols == 0 => Some(&[]),
            _ => None,
        }
    }
}

impl Model {
    pub fn array(&self, name: &str) -> Option<Array<'_>> {
        let text = c_name(name);
        let (mut kind, mut rows, mut cols) = (0, 0, 0);
        let ptr = unsafe {
            forge_model_array(
                self.raw as *const c_void,
                text.as_ptr(),
                &mut kind,
                &mut rows,
                &mut cols,
            )
        };

        if ptr.is_null() && rows * cols != 0 {
            return None;
        }

        wrap(ptr, kind, rows, cols)
    }

    pub fn size(&self, name: &str) -> Option<i64> {
        let text = c_name(name);
        let mut value = 0;
        let found = unsafe { forge_model_size(self.raw as *const c_void, text.as_ptr(), &mut value) };

        (found != 0).then_some(value)
    }

    pub fn option(&self, name: &str) -> Vec<f64> {
        let text = c_name(name);
        let mut out = [0.0; 8];
        let n = unsafe { forge_model_option(self.raw as *const c_void, text.as_ptr(), out.as_mut_ptr()) };

        out[..n.max(0) as usize].to_vec()
    }
}

impl Data {
    pub fn array<'a>(&'a self, model: &Model, name: &str) -> Option<Array<'a>> {
        let text = c_name(name);
        let (mut kind, mut rows, mut cols) = (0, 0, 0);
        let ptr = unsafe {
            forge_data_array(
                model.raw as *const c_void,
                self.raw as *const c_void,
                text.as_ptr(),
                &mut kind,
                &mut rows,
                &mut cols,
            )
        };

        wrap(ptr, kind, rows, cols)
    }

    pub fn ncon(&self) -> usize {
        unsafe { forge_data_ncon(self.raw as *const c_void).max(0) as usize }
    }

    pub fn nefc(&self) -> usize {
        unsafe { forge_data_nefc(self.raw as *const c_void).max(0) as usize }
    }

    pub fn contact(&self, i: usize) -> Contact {
        let mut c = Contact::default();
        let mut geom = [0 as c_int; 2];

        unsafe {
            forge_data_contact(
                self.raw as *const c_void,
                i as c_int,
                &mut c.dist,
                c.pos.as_mut_ptr(),
                c.frame.as_mut_ptr(),
                geom.as_mut_ptr(),
            )
        };
        c.geom = geom;
        c
    }

    pub fn efc(&self, name: &str) -> &[f64] {
        let text = c_name(name);
        let ptr = unsafe { forge_data_efc(self.raw as *const c_void, text.as_ptr()) };

        if ptr.is_null() || self.nefc() == 0 {
            return &[];
        }

        unsafe { std::slice::from_raw_parts(ptr, self.nefc()) }
    }

    pub fn efc_types(&self) -> &[i32] {
        let ptr = unsafe { forge_data_efc_type(self.raw as *const c_void) };

        if ptr.is_null() || self.nefc() == 0 {
            return &[];
        }

        unsafe { std::slice::from_raw_parts(ptr, self.nefc()) }
    }
}
