use crate::ffi;
use crate::model::{Data, Model};
use std::ffi::c_int;

pub const GROUPS: usize = 6;

#[derive(Clone, Copy, Debug)]
pub struct Rays<'a> {
    pub origin: [f64; 3],
    pub dirs: &'a [f64],
    pub groups: [u8; GROUPS],
    pub static_geoms: bool,
    pub exclude_body: Option<usize>,
    pub cutoff: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frame {
    pub pos: [f64; 3],
    pub mat: [f64; 9],
}

impl Frame {
    pub fn point(&self, local: [f64; 3]) -> [f64; 3] {
        let turned = self.direction(local);

        [
            self.pos[0] + turned[0],
            self.pos[1] + turned[1],
            self.pos[2] + turned[2],
        ]
    }

    pub fn direction(&self, local: [f64; 3]) -> [f64; 3] {
        let m = &self.mat;

        [
            m[0] * local[0] + m[1] * local[1] + m[2] * local[2],
            m[3] * local[0] + m[4] * local[1] + m[5] * local[2],
            m[6] * local[0] + m[7] * local[1] + m[8] * local[2],
        ]
    }
}

impl Data {
    pub fn kinematics(&mut self, model: &Model) {
        unsafe { ffi::mj_kinematics(model.raw, self.raw) }
    }

    pub fn body_frame(&self, model: &Model, body: usize) -> Frame {
        assert!(body < model.nbody(), "body {body} is outside the model");

        let nbody = model.nbody();
        let pos = unsafe { std::slice::from_raw_parts(ffi::forge_xpos(self.raw), 3 * nbody) };
        let mat = unsafe { std::slice::from_raw_parts(ffi::forge_xmat(self.raw), 9 * nbody) };
        let mut frame = Frame {
            pos: [0.0; 3],
            mat: [0.0; 9],
        };

        frame.pos.copy_from_slice(&pos[3 * body..3 * body + 3]);
        frame.mat.copy_from_slice(&mat[9 * body..9 * body + 9]);
        frame
    }

    pub fn multi_ray(&mut self, model: &Model, rays: &Rays, dist: &mut [f64]) {
        assert_eq!(rays.dirs.len(), 3 * dist.len(), "one direction per distance");

        if dist.is_empty() {
            return;
        }

        let exclude = rays.exclude_body.map_or(-1, |b| b as c_int);

        unsafe {
            ffi::mj_multiRay(
                model.raw,
                self.raw,
                rays.origin.as_ptr(),
                rays.dirs.as_ptr(),
                rays.groups.as_ptr(),
                u8::from(rays.static_geoms),
                exclude,
                std::ptr::null_mut(),
                dist.as_mut_ptr(),
                std::ptr::null_mut(),
                dist.len() as c_int,
                rays.cutoff,
            )
        }
    }
}
