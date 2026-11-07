use crate::ffi;
use std::ffi::{c_char, CStr, CString};
use std::path::Path;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Field {
    GainParams,
    BiasParams,
    DofArmature,
    DofDamping,
    DofFrictionLoss,
}

pub struct Model {
    pub(crate) raw: *mut ffi::MjModel,
}

unsafe impl Send for Model {}
unsafe impl Sync for Model {}

fn slice_of<'a>(ptr: *mut f64, len: usize) -> &'a mut [f64] {
    unsafe { std::slice::from_raw_parts_mut(ptr, len) }
}

impl Model {
    pub fn load(path: &Path) -> Result<Self, String> {
        crate::install_handlers();

        let text = path.to_str().ok_or("The model path isn't valid UTF-8")?;
        let name = CString::new(text).map_err(|e| e.to_string())?;
        let mut error = [0 as c_char; 1024];
        let raw = unsafe { ffi::mj_loadXML(name.as_ptr(), std::ptr::null(), error.as_mut_ptr(), 1024) };

        if raw.is_null() {
            let message = unsafe { CStr::from_ptr(error.as_ptr()) }.to_string_lossy().into_owned();

            return Err(format!("Couldn't load the model: {message}"));
        }

        Ok(Self { raw })
    }

    pub fn duplicate(&self) -> Self {
        Self {
            raw: unsafe { ffi::mj_copyModel(std::ptr::null_mut(), self.raw) },
        }
    }

    pub fn nq(&self) -> usize {
        unsafe { ffi::forge_nq(self.raw) as usize }
    }

    pub fn nv(&self) -> usize {
        unsafe { ffi::forge_nv(self.raw) as usize }
    }

    pub fn nu(&self) -> usize {
        unsafe { ffi::forge_nu(self.raw) as usize }
    }

    pub fn nbody(&self) -> usize {
        unsafe { ffi::forge_nbody(self.raw) as usize }
    }

    pub fn ngeom(&self) -> usize {
        unsafe { ffi::forge_ngeom(self.raw) as usize }
    }

    pub fn timestep(&self) -> f64 {
        unsafe { ffi::forge_timestep(self.raw) }
    }

    fn id_of(&self, kind: i32, name: &str) -> Option<usize> {
        let text = CString::new(name).ok()?;
        let id = unsafe { ffi::mj_name2id(self.raw, kind, text.as_ptr()) };

        usize::try_from(id).ok()
    }

    pub fn joint_id(&self, name: &str) -> Option<usize> {
        self.id_of(unsafe { ffi::forge_obj_joint() }, name)
    }

    pub fn actuator_id(&self, name: &str) -> Option<usize> {
        self.id_of(unsafe { ffi::forge_obj_actuator() }, name)
    }

    pub fn body_id(&self, name: &str) -> Option<usize> {
        self.id_of(unsafe { ffi::forge_obj_body() }, name)
    }

    pub fn joint_qpos_adr(&self, joint: usize) -> usize {
        unsafe { ffi::forge_jnt_qposadr(self.raw, joint as i32) as usize }
    }

    pub fn joint_dof_adr(&self, joint: usize) -> usize {
        unsafe { ffi::forge_jnt_dofadr(self.raw, joint as i32) as usize }
    }

    pub fn ctrl_limited(&self, actuator: usize) -> bool {
        unsafe { ffi::forge_ctrl_limited(self.raw, actuator as i32) != 0 }
    }

    pub fn history_samples(&self, actuator: usize) -> usize {
        unsafe { ffi::forge_history_samples(self.raw, actuator as i32).max(0) as usize }
    }

    pub fn ctrl_range(&self, actuator: usize) -> (f64, f64) {
        let range = unsafe { std::slice::from_raw_parts(ffi::forge_ctrlrange(self.raw), 2 * self.nu()) };

        (range[2 * actuator], range[2 * actuator + 1])
    }

    pub fn gain_width() -> usize {
        unsafe { ffi::forge_ngain() as usize }
    }

    pub fn bias_width() -> usize {
        unsafe { ffi::forge_nbias() as usize }
    }

    pub fn field(&self, field: Field) -> &[f64] {
        let (ptr, len) = self.field_location(field);

        unsafe { std::slice::from_raw_parts(ptr, len) }
    }

    pub fn field_mut(&mut self, field: Field) -> &mut [f64] {
        let (ptr, len) = self.field_location(field);

        slice_of(ptr, len)
    }

    fn field_location(&self, field: Field) -> (*mut f64, usize) {
        unsafe {
            match field {
                Field::GainParams => (ffi::forge_gainprm(self.raw), Self::gain_width() * self.nu()),
                Field::BiasParams => (ffi::forge_biasprm(self.raw), Self::bias_width() * self.nu()),
                Field::DofArmature => (ffi::forge_dof_armature(self.raw), self.nv()),
                Field::DofDamping => (ffi::forge_dof_damping(self.raw), self.nv()),
                Field::DofFrictionLoss => (ffi::forge_dof_frictionloss(self.raw), self.nv()),
            }
        }
    }

    pub fn state_size(&self, signature: i32) -> usize {
        unsafe { ffi::mj_stateSize(self.raw, signature) as usize }
    }
}

impl Drop for Model {
    fn drop(&mut self) {
        unsafe { ffi::mj_deleteModel(self.raw) }
    }
}

pub struct Data {
    pub(crate) raw: *mut ffi::MjData,
    nq: usize,
    nv: usize,
    nu: usize,
}

unsafe impl Send for Data {}

impl Data {
    pub fn new(model: &Model) -> Self {
        Self {
            raw: unsafe { ffi::mj_makeData(model.raw) },
            nq: model.nq(),
            nv: model.nv(),
            nu: model.nu(),
        }
    }

    pub fn qpos(&mut self) -> &mut [f64] {
        slice_of(unsafe { ffi::forge_qpos(self.raw) }, self.nq)
    }

    pub fn qvel(&mut self) -> &mut [f64] {
        slice_of(unsafe { ffi::forge_qvel(self.raw) }, self.nv)
    }

    pub fn ctrl(&mut self) -> &mut [f64] {
        slice_of(unsafe { ffi::forge_ctrl(self.raw) }, self.nu)
    }

    pub fn set_time(&mut self, time: f64) {
        unsafe { ffi::forge_set_time(self.raw, time) }
    }

    pub fn reset(&mut self, model: &Model) {
        unsafe { ffi::mj_resetData(model.raw, self.raw) }
    }

    pub fn step(&mut self, model: &Model) {
        unsafe { ffi::mj_step(model.raw, self.raw) }
    }

    pub fn forward(&mut self, model: &Model) {
        unsafe { ffi::mj_forward(model.raw, self.raw) }
    }

    pub fn get_state(&self, model: &Model, state: &mut [f64], signature: i32) {
        assert_eq!(state.len(), model.state_size(signature));

        unsafe { ffi::mj_getState(model.raw, self.raw, state.as_mut_ptr(), signature) }
    }

    pub fn set_state(&mut self, model: &Model, state: &[f64], signature: i32) {
        assert_eq!(state.len(), model.state_size(signature));

        unsafe { ffi::mj_setState(model.raw, self.raw, state.as_ptr(), signature) }
    }

    pub fn set_const(&mut self, model: &Model) {
        unsafe { ffi::mj_setConst(model.raw, self.raw) }
    }

    pub fn time(&self) -> f64 {
        unsafe { ffi::forge_time(self.raw) }
    }

    pub fn hold_delayed_controls(&mut self, model: &Model, ctrl: &[f64]) {
        let now = self.time();
        let timestep = model.timestep();

        for (actuator, value) in ctrl.iter().enumerate().take(model.nu()) {
            let samples = model.history_samples(actuator);

            if samples == 0 {
                continue;
            }

            let times: Vec<f64> = (0..samples).map(|k| now - (samples - k) as f64 * timestep).collect();
            let values = vec![*value; samples];

            unsafe { ffi::mj_initCtrlHistory(model.raw, self.raw, actuator as i32, times.as_ptr(), values.as_ptr()) };
        }
    }
}

impl Drop for Data {
    fn drop(&mut self) {
        unsafe { ffi::mj_deleteData(self.raw) }
    }
}
