use std::ffi::{c_char, c_int, c_void};

#[repr(C)]
pub struct MjModel {
    _private: [u8; 0],
}

#[repr(C)]
pub struct MjData {
    _private: [u8; 0],
}

#[repr(C)]
pub struct MjBatch {
    _private: [u8; 0],
}

#[repr(C)]
pub struct MjBatchConfig {
    pub nthread: c_int,
    pub persistent: u8,
}

extern "C" {
    pub fn mj_loadXML(filename: *const c_char, vfs: *const c_void, error: *mut c_char, error_sz: c_int)
        -> *mut MjModel;
    pub fn mj_copyModel(dest: *mut MjModel, src: *const MjModel) -> *mut MjModel;
    pub fn mj_deleteModel(m: *mut MjModel);
    pub fn mj_makeData(m: *const MjModel) -> *mut MjData;
    pub fn mj_deleteData(d: *mut MjData);
    pub fn mj_resetData(m: *const MjModel, d: *mut MjData);
    pub fn mj_step(m: *const MjModel, d: *mut MjData);
    pub fn mj_forward(m: *const MjModel, d: *mut MjData);
    pub fn mj_setConst(m: *mut MjModel, d: *mut MjData);
    pub fn mj_stateSize(m: *const MjModel, sig: c_int) -> c_int;
    pub fn mj_getState(m: *const MjModel, d: *const MjData, state: *mut f64, sig: c_int);
    pub fn mj_setState(m: *const MjModel, d: *mut MjData, state: *const f64, sig: c_int);
    pub fn mj_name2id(m: *const MjModel, kind: c_int, name: *const c_char) -> c_int;
    pub fn mj_versionString() -> *const c_char;

    pub fn mjb_defaultConfig(config: *mut MjBatchConfig);
    pub fn mjb_makeBatch(
        m: *const MjModel,
        nsim: c_int,
        config: *const MjBatchConfig,
        error: *mut c_char,
        error_sz: c_int,
    ) -> *mut MjBatch;
    pub fn mjb_deleteBatch(b: *mut MjBatch);
    pub fn mjb_nstate(b: *const MjBatch) -> c_int;
    pub fn mjb_state(b: *mut MjBatch) -> *mut f64;
    pub fn mjb_stateComponent(b: *mut MjBatch, component: c_int, size: *mut c_int) -> *mut f64;
    pub fn mjb_step(b: *mut MjBatch, ids: *const c_int, nid: c_int, nstep: c_int, stage: c_int) -> c_int;
    pub fn mjb_expand(b: *mut MjBatch, name: *const c_char, size: *mut c_int, elemsize: *mut c_int) -> *mut c_void;
    pub fn mjb_setConst(b: *mut MjBatch, ids: *const c_int, nid: c_int) -> c_int;
    pub fn mjb_nthread(b: *const MjBatch) -> c_int;
    pub fn mjb_model(b: *const MjBatch) -> *const MjModel;
    pub fn mjb_expanded(b: *mut MjBatch, name: *const c_char, size: *mut c_int, elemsize: *mut c_int) -> *const c_void;
    pub fn mjb_status(b: *const MjBatch) -> *const c_int;
    pub fn mjb_error(b: *const MjBatch, sim: c_int) -> *const c_char;

    pub fn forge_install_handlers();
    pub fn forge_state_integration() -> c_int;
    pub fn forge_state_warmstart() -> c_int;
    pub fn forge_state_qpos() -> c_int;
    pub fn forge_state_qvel() -> c_int;
    pub fn forge_state_ctrl() -> c_int;
    pub fn forge_state_time() -> c_int;
    pub fn forge_obj_joint() -> c_int;
    pub fn forge_obj_actuator() -> c_int;
    pub fn forge_obj_body() -> c_int;
    pub fn forge_stage_none() -> c_int;
    pub fn forge_nq(m: *const MjModel) -> c_int;
    pub fn forge_nv(m: *const MjModel) -> c_int;
    pub fn forge_nu(m: *const MjModel) -> c_int;
    pub fn forge_nbody(m: *const MjModel) -> c_int;
    pub fn forge_ngeom(m: *const MjModel) -> c_int;
    pub fn forge_timestep(m: *const MjModel) -> f64;
    pub fn forge_jnt_qposadr(m: *const MjModel, joint: c_int) -> c_int;
    pub fn forge_jnt_dofadr(m: *const MjModel, joint: c_int) -> c_int;
    pub fn forge_ctrl_limited(m: *const MjModel, actuator: c_int) -> c_int;
    pub fn forge_ctrlrange(m: *const MjModel) -> *mut f64;
    pub fn forge_gainprm(m: *const MjModel) -> *mut f64;
    pub fn forge_biasprm(m: *const MjModel) -> *mut f64;
    pub fn forge_ngain() -> c_int;
    pub fn forge_nbias() -> c_int;
    pub fn forge_dof_armature(m: *const MjModel) -> *mut f64;
    pub fn forge_dof_damping(m: *const MjModel) -> *mut f64;
    pub fn forge_dof_frictionloss(m: *const MjModel) -> *mut f64;
    pub fn forge_qpos(d: *const MjData) -> *mut f64;
    pub fn forge_qvel(d: *const MjData) -> *mut f64;
    pub fn forge_ctrl(d: *const MjData) -> *mut f64;
    pub fn forge_set_time(d: *mut MjData, t: f64);
}
