#[derive(Clone, Debug, PartialEq)]
pub struct Kernel {
    pub options: Options,
    pub nq: usize,
    pub nv: usize,
    pub nu: usize,
    pub qpos0: Vec<f64>,
    pub bodies: Vec<Body>,
    pub joints: Vec<Joint>,
    pub dofs: Vec<Dof>,
    pub geoms: Vec<Geom>,
    pub meshes: Vec<Mesh>,
    pub pairs: Vec<Pair>,
    pub actuators: Vec<Actuator>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Options {
    pub timestep: f64,
    pub gravity: [f64; 3],
    pub impratio: f64,
    pub tolerance: f64,
    pub ls_tolerance: f64,
    pub iterations: usize,
    pub ls_iterations: usize,
    pub warmstart: bool,
    pub refsafe: bool,
    pub clamp_ctrl: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SameFrame {
    None,
    Body,
    Inertia,
    BodyRot,
    InertiaRot,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Body {
    pub parent: usize,
    pub root: usize,
    pub weld: usize,
    pub pos: [f64; 3],
    pub quat: [f64; 4],
    pub ipos: [f64; 3],
    pub iquat: [f64; 4],
    pub mass: f64,
    pub subtree_mass: f64,
    pub inertia: [f64; 3],
    pub invweight: [f64; 2],
    pub inertial_frame: SameFrame,
    pub joints: Vec<usize>,
    pub dofadr: usize,
    pub dofnum: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JointKind {
    Free,
    Ball,
    Slide,
    Hinge,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Joint {
    pub kind: JointKind,
    pub body: usize,
    pub qposadr: usize,
    pub dofadr: usize,
    pub axis: [f64; 3],
    pub pos: [f64; 3],
    pub limit: Option<Limit>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Limit {
    pub range: [f64; 2],
    pub margin: f64,
    pub solref: [f64; 2],
    pub solimp: [f64; 5],
}

#[derive(Clone, Debug, PartialEq)]
pub struct Dof {
    pub body: usize,
    pub joint: usize,
    pub parent: Option<usize>,
    pub armature: f64,
    pub damping: f64,
    pub invweight: f64,
    pub friction: Option<Friction>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Friction {
    pub loss: f64,
    pub solref: [f64; 2],
    pub solimp: [f64; 5],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shape {
    Plane,
    Sphere,
    Capsule,
    Box,
    Cylinder,
    Mesh(usize),
}

#[derive(Clone, Debug, PartialEq)]
pub struct Geom {
    pub shape: Shape,
    pub body: usize,
    pub pos: [f64; 3],
    pub quat: [f64; 4],
    pub frame: SameFrame,
    pub size: [f64; 3],
}

#[derive(Clone, Debug, PartialEq)]
pub struct Mesh {
    pub vertices: Vec<[f32; 3]>,
    pub faces: Vec<Face>,
    pub vertex_faces: Vec<Vec<usize>>,
    pub climb: Option<Climb>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Face {
    pub normal: [f64; 3],
    pub vertices: Vec<usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Climb {
    pub vertex: Vec<usize>,
    pub neighbours: Vec<Vec<usize>>,
    pub extrema: [usize; 27],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Collider {
    PlaneConvex,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Pair {
    pub collider: Collider,
    pub geoms: [usize; 2],
    pub condim: usize,
    pub friction: [f64; 5],
    pub solref: [f64; 2],
    pub solimp: [f64; 5],
    pub margin: f64,
    pub gap: f64,
    pub max_contacts: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Interp {
    Hold,
    Linear,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Delay {
    pub seconds: f64,
    pub samples: usize,
    pub interp: Interp,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Actuator {
    pub dof: usize,
    pub qposadr: usize,
    pub gear: f64,
    pub gain: f64,
    pub bias: [f64; 3],
    pub ctrl_range: Option<[f64; 2]>,
    pub force_range: Option<[f64; 2]>,
    pub delay: Option<Delay>,
}

impl Kernel {
    pub fn ancestors(&self, dof: usize) -> Vec<usize> {
        let mut chain = vec![dof];
        let mut current = self.dofs[dof].parent;

        while let Some(d) = current {
            chain.push(d);
            current = self.dofs[d].parent;
        }

        chain.reverse();
        chain
    }

    pub fn body_chain(&self, body: usize) -> Vec<usize> {
        let weld = self.bodies[body].weld;
        let b = &self.bodies[weld];

        if b.dofnum == 0 {
            return Vec::new();
        }

        self.ancestors(b.dofadr + b.dofnum - 1)
    }
}
