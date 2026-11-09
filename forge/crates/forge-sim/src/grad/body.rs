use super::coeffs::Coeffs;
use super::dual::Real;
use crate::params::MIN_VAL;
use crate::spatial::{add3, cross, inert_com, mul_mat_vec, mul_quat, quat2mat, rot_vec_quat, scl3, sub3};
use forge_ir::{JointKind, Kernel, SameFrame};

const IDENTITY: [f64; 9] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];

pub struct Kin<S> {
    pub xpos: Vec<[S; 3]>,
    pub xquat: Vec<[S; 4]>,
    pub xmat: Vec<[S; 9]>,
    pub xipos: Vec<[S; 3]>,
    pub ximat: Vec<[S; 9]>,
    pub xanchor: Vec<[S; 3]>,
    pub xaxis: Vec<[S; 3]>,
    pub subtree_com: Vec<[S; 3]>,
    pub cinert: Vec<[S; 10]>,
    pub cdof: Vec<[S; 6]>,
}

pub fn lift<S: Real, const K: usize>(x: &[f64; K]) -> [S; K] {
    x.map(S::c)
}

pub fn normalize4<S: Real>(q: &[S; 4]) -> [S; 4] {
    let norm = (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]).sqrt();

    if norm.re() < MIN_VAL {
        return lift(&[1.0, 0.0, 0.0, 0.0]);
    }

    q.map(|c| c / norm)
}

pub fn axis_angle<S: Real>(axis: &[S; 3], angle: S) -> [S; 4] {
    let (s, c) = (angle * 0.5).sin_cos();

    [c, axis[0] * s, axis[1] * s, axis[2] * s]
}

impl<S: Real> Kin<S> {
    fn new(k: &Kernel) -> Self {
        let (nb, nj) = (k.bodies.len(), k.joints.len());
        let z3 = [S::c(0.0); 3];

        Self {
            xpos: vec![z3; nb],
            xquat: vec![lift(&[1.0, 0.0, 0.0, 0.0]); nb],
            xmat: vec![lift(&IDENTITY); nb],
            xipos: vec![z3; nb],
            ximat: vec![lift(&IDENTITY); nb],
            xanchor: vec![z3; nj],
            xaxis: vec![z3; nj],
            subtree_com: vec![z3; nb],
            cinert: vec![[S::c(0.0); 10]; nb],
            cdof: vec![[S::c(0.0); 6]; k.nv],
        }
    }

    fn body_pose(&mut self, k: &Kernel, qpos: &[S], i: usize) -> ([S; 3], [S; 4]) {
        let body = &k.bodies[i];

        if body.joints.len() == 1 && k.joints[body.joints[0]].kind == JointKind::Free {
            let j = &k.joints[body.joints[0]];
            let a = j.qposadr;
            let pos = [qpos[a], qpos[a + 1], qpos[a + 2]];

            self.xanchor[body.joints[0]] = pos;
            self.xaxis[body.joints[0]] = lift(&j.axis);

            return (pos, normalize4(&[qpos[a + 3], qpos[a + 4], qpos[a + 5], qpos[a + 6]]));
        }

        let p = body.parent;
        let (mut pos, mut quat) = if p != 0 {
            (
                add3(&mul_mat_vec(&self.xmat[p], &lift(&body.pos)), &self.xpos[p]),
                mul_quat(&self.xquat[p], &lift(&body.quat)),
            )
        } else {
            (lift(&body.pos), lift(&body.quat))
        };

        for &jid in &body.joints {
            let j = &k.joints[jid];
            let (axis, jpos) = (lift(&j.axis), lift(&j.pos));
            let q = qpos[j.qposadr] - S::c(k.qpos0[j.qposadr]);
            let xaxis = rot_vec_quat(&axis, &quat);
            let xanchor = add3(&rot_vec_quat(&jpos, &quat), &pos);

            if j.kind == JointKind::Slide {
                pos = add3(&pos, &scl3(&xaxis, q));
            } else {
                quat = mul_quat(&quat, &axis_angle(&axis, q));
                pos = sub3(&xanchor, &rot_vec_quat(&jpos, &quat));
            }

            self.xanchor[jid] = xanchor;
            self.xaxis[jid] = xaxis;
        }

        (pos, normalize4(&quat))
    }

    fn inertial_frame(&self, i: usize, body: &forge_ir::Body) -> ([S; 3], [S; 9]) {
        let (xmat, xpos) = (self.xmat[i], self.xpos[i]);
        let pos = match body.inertial_frame {
            SameFrame::Body => xpos,
            _ => add3(&mul_mat_vec(&xmat, &lift(&body.ipos)), &xpos),
        };
        let mat = match body.inertial_frame {
            SameFrame::None => quat2mat(&mul_quat(&self.xquat[i], &lift(&body.iquat))),
            _ => xmat,
        };

        (pos, mat)
    }

    fn subtree(&mut self, k: &Kernel, mass: &[S]) {
        let nb = k.bodies.len();

        for i in 0..nb {
            self.subtree_com[i] = scl3(&self.xipos[i], mass[i]);
        }

        for i in (1..nb).rev() {
            let p = k.bodies[i].parent;

            self.subtree_com[p] = add3(&self.subtree_com[p], &self.subtree_com[i]);
        }

        for i in 0..nb {
            let m = k.bodies[i].subtree_mass;

            self.subtree_com[i] = if m < MIN_VAL {
                self.xipos[i]
            } else {
                scl3(&self.subtree_com[i], S::c(1.0 / m))
            };
        }
    }

    fn motion_dofs(&mut self, k: &Kernel, i: usize) {
        let root = self.subtree_com[k.bodies[i].root];
        let xmat = self.xmat[i];
        let zero = S::c(0.0);
        let one = S::c(1.0);

        for &jid in &k.bodies[i].joints {
            let j = &k.joints[jid];
            let da = j.dofadr;
            let offset = sub3(&root, &self.xanchor[jid]);
            let angular = |axis: [S; 3]| {
                let c = cross(&axis, &offset);

                [axis[0], axis[1], axis[2], c[0], c[1], c[2]]
            };

            match j.kind {
                JointKind::Free => {
                    for t in 0..3 {
                        let mut row = [zero; 6];

                        row[3 + t] = one;
                        self.cdof[da + t] = row;
                    }

                    for r in 0..3 {
                        self.cdof[da + 3 + r] = angular([xmat[r], xmat[r + 3], xmat[r + 6]]);
                    }
                }
                JointKind::Slide => {
                    let a = self.xaxis[jid];

                    self.cdof[da] = [zero, zero, zero, a[0], a[1], a[2]];
                }
                _ => self.cdof[da] = angular(self.xaxis[jid]),
            }
        }
    }
}

pub fn kinematics<S: Real>(k: &Kernel, qpos: &[S], c: &Coeffs<S>) -> Kin<S> {
    let mut kin = Kin::new(k);
    let nb = k.bodies.len();

    for i in 1..nb {
        let (pos, quat) = kin.body_pose(k, qpos, i);

        kin.xquat[i] = quat;
        kin.xpos[i] = pos;
        kin.xmat[i] = quat2mat(&quat);
    }

    for i in 1..nb {
        let (p, m) = kin.inertial_frame(i, &k.bodies[i]);

        kin.xipos[i] = p;
        kin.ximat[i] = m;
    }

    kin.subtree(k, &c.mass);

    for i in 1..nb {
        let body = &k.bodies[i];
        let offset = sub3(&kin.xipos[i], &kin.subtree_com[body.root]);

        kin.cinert[i] = inert_com(&lift(&body.inertia), &kin.ximat[i], &offset, c.mass[i]);
    }

    for i in 1..nb {
        kin.motion_dofs(k, i);
    }

    kin
}
