use crate::ffi;
use crate::model::Model;
use std::ffi::{c_char, c_int, CStr, CString};

#[derive(Clone, Copy, Debug)]
pub struct StateLayout {
    pub nstate: usize,
    pub time: usize,
    pub qpos: usize,
    pub qvel: usize,
    pub warmstart: usize,
    pub ctrl: usize,
}

pub struct Batch {
    raw: *mut ffi::MjBatch,
    nsim: usize,
    layout: StateLayout,
}

unsafe impl Send for Batch {}

fn component_offset(raw: *mut ffi::MjBatch, base: *mut f64, component: c_int) -> usize {
    let address = unsafe { ffi::mjb_stateComponent(raw, component, std::ptr::null_mut()) };

    (address as usize - base as usize) / std::mem::size_of::<f64>()
}

fn layout_of(raw: *mut ffi::MjBatch) -> StateLayout {
    unsafe {
        let base = ffi::mjb_state(raw);

        StateLayout {
            nstate: ffi::mjb_nstate(raw) as usize,
            time: component_offset(raw, base, ffi::forge_state_time()),
            qpos: component_offset(raw, base, ffi::forge_state_qpos()),
            qvel: component_offset(raw, base, ffi::forge_state_qvel()),
            warmstart: component_offset(raw, base, ffi::forge_state_warmstart()),
            ctrl: component_offset(raw, base, ffi::forge_state_ctrl()),
        }
    }
}

fn make_batch(model: *const ffi::MjModel, nsim: usize, nthread: usize) -> Result<*mut ffi::MjBatch, String> {
    let mut config = ffi::MjBatchConfig {
        nthread: 0,
        persistent: 0,
    };
    let mut error = [0 as c_char; 1024];

    unsafe { ffi::mjb_defaultConfig(&mut config) };
    config.nthread = nthread as c_int;

    let raw = unsafe { ffi::mjb_makeBatch(model, nsim as c_int, &config, error.as_mut_ptr(), 1024) };

    if raw.is_null() {
        let message = unsafe { CStr::from_ptr(error.as_ptr()) }.to_string_lossy().into_owned();

        return Err(format!("Couldn't build the batch: {message}"));
    }

    Ok(raw)
}

impl Batch {
    pub fn new(model: &Model, nsim: usize, nthread: usize) -> Result<Self, String> {
        crate::install_handlers();

        let raw = make_batch(model.raw, nsim, nthread)?;

        Ok(Self {
            raw,
            nsim,
            layout: layout_of(raw),
        })
    }

    pub fn nsim(&self) -> usize {
        self.nsim
    }

    pub fn nthread(&self) -> usize {
        unsafe { ffi::mjb_nthread(self.raw) as usize }
    }

    pub fn layout(&self) -> StateLayout {
        self.layout
    }

    pub fn state(&mut self) -> &mut [f64] {
        let len = self.nsim * self.layout.nstate;

        unsafe { std::slice::from_raw_parts_mut(ffi::mjb_state(self.raw), len) }
    }

    pub fn row(&mut self, sim: usize) -> &mut [f64] {
        let width = self.layout.nstate;

        &mut self.state()[sim * width..(sim + 1) * width]
    }

    pub fn expand(&mut self, field: &str) -> Result<(&mut [f64], usize), String> {
        let name = CString::new(field).map_err(|e| e.to_string())?;
        let mut size: c_int = 0;
        let mut elem: c_int = 0;
        let address = unsafe { ffi::mjb_expand(self.raw, name.as_ptr(), &mut size, &mut elem) };

        if address.is_null() || elem as usize != std::mem::size_of::<f64>() {
            return Err(format!("Couldn't expand the model field {field}"));
        }

        let width = size as usize;
        let len = self.nsim * width;

        Ok((
            unsafe { std::slice::from_raw_parts_mut(address.cast::<f64>(), len) },
            width,
        ))
    }

    pub fn rethread(&mut self, nthread: usize, fields: &[&str]) -> Result<(), String> {
        let model = unsafe { ffi::mjb_model(self.raw) };
        let fresh = make_batch(model, self.nsim, nthread)?;
        let len = self.nsim * self.layout.nstate;

        unsafe { std::ptr::copy_nonoverlapping(ffi::mjb_state(self.raw), ffi::mjb_state(fresh), len) };

        for field in fields {
            let name = CString::new(*field).map_err(|e| e.to_string())?;
            let (mut size, mut elem): (c_int, c_int) = (0, 0);
            let old = unsafe { ffi::mjb_expanded(self.raw, name.as_ptr(), &mut size, &mut elem) };

            if old.is_null() {
                continue;
            }

            let target = unsafe { ffi::mjb_expand(fresh, name.as_ptr(), &mut size, &mut elem) };
            let bytes = self.nsim * size as usize * elem as usize;

            unsafe { std::ptr::copy_nonoverlapping(old.cast::<u8>(), target.cast::<u8>(), bytes) };
        }

        unsafe { ffi::mjb_deleteBatch(self.raw) };
        self.raw = fresh;

        Ok(())
    }

    pub fn step(&mut self, nstep: usize) -> usize {
        let stage = unsafe { ffi::forge_stage_none() };

        unsafe { ffi::mjb_step(self.raw, std::ptr::null(), self.nsim as c_int, nstep as c_int, stage) as usize }
    }

    pub fn set_const(&mut self) -> usize {
        unsafe { ffi::mjb_setConst(self.raw, std::ptr::null(), self.nsim as c_int) as usize }
    }

    pub fn first_error(&self) -> Option<String> {
        let status = unsafe { std::slice::from_raw_parts(ffi::mjb_status(self.raw), self.nsim) };
        let sim = status.iter().position(|s| *s != 0)?;
        let raw = unsafe { CStr::from_ptr(ffi::mjb_error(self.raw, sim as c_int)) };

        Some(raw.to_string_lossy().into_owned())
    }
}

impl Drop for Batch {
    fn drop(&mut self) {
        unsafe { ffi::mjb_deleteBatch(self.raw) }
    }
}
