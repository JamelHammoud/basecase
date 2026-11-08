use super::emit::{idx, opt, Emitter};
use crate::params::Imp;
use crate::plan::Plan;
use forge_ir::{Collider, FrictionMix, JointKind, SameFrame, Shape};

fn frame(f: SameFrame) -> i64 {
    match f {
        SameFrame::None => 0,
        SameFrame::Body => 1,
        SameFrame::Inertia => 2,
        SameFrame::BodyRot => 3,
        SameFrame::InertiaRot => 4,
    }
}

fn kind(k: JointKind) -> i64 {
    match k {
        JointKind::Free => 0,
        JointKind::Ball => 1,
        JointKind::Slide => 2,
        JointKind::Hinge => 3,
    }
}

fn flat3<'a>(items: impl Iterator<Item = &'a [f64; 3]>) -> Vec<f64> {
    items.flat_map(|v| v.iter().copied()).collect()
}

fn flat4<'a>(items: impl Iterator<Item = &'a [f64; 4]>) -> Vec<f64> {
    items.flat_map(|v| v.iter().copied()).collect()
}

fn bodies(e: &mut Emitter, plan: &Plan) {
    let b = &plan.kernel.bodies;
    let joints = &plan.kernel.joints;
    let mut adr = Vec::new();
    let mut list = Vec::new();

    for body in b {
        adr.push(idx(list.len()));
        list.extend(body.joints.iter().map(|&j| idx(j)));
    }

    e.ints("BODY_PARENT", b.iter().map(|x| idx(x.parent)));
    e.ints("BODY_ROOT", b.iter().map(|x| idx(x.root)));
    e.ints("BODY_IFRAME", b.iter().map(|x| frame(x.inertial_frame)));
    e.ints("BODY_JNT_ADR", adr);
    e.ints("BODY_JNT_NUM", b.iter().map(|x| idx(x.joints.len())));
    e.ints("BODY_JNT", list);
    e.ints(
        "BODY_FREE",
        b.iter()
            .map(|x| i64::from(x.joints.len() == 1 && joints[x.joints[0]].kind == JointKind::Free)),
    );
    e.ints("BODY_DOFADR", b.iter().map(|x| idx(x.dofadr)));
    e.ints("BODY_DOFNUM", b.iter().map(|x| idx(x.dofnum)));
    e.reals("BODY_POS", flat3(b.iter().map(|x| &x.pos)));
    e.reals("BODY_QUAT", flat4(b.iter().map(|x| &x.quat)));
    e.reals("BODY_IPOS", flat3(b.iter().map(|x| &x.ipos)));
    e.reals("BODY_IQUAT", flat4(b.iter().map(|x| &x.iquat)));
    e.reals("BODY_SUBTREE_MASS", b.iter().map(|x| x.subtree_mass));
    e.reals("BODY_INERTIA", flat3(b.iter().map(|x| &x.inertia)));
}

fn joints_dofs_geoms(e: &mut Emitter, plan: &Plan) {
    let k = &plan.kernel;

    e.ints("JNT_KIND", k.joints.iter().map(|j| kind(j.kind)));
    e.ints("JNT_QPOSADR", k.joints.iter().map(|j| idx(j.qposadr)));
    e.ints("JNT_DOFADR", k.joints.iter().map(|j| idx(j.dofadr)));
    e.reals("JNT_AXIS", flat3(k.joints.iter().map(|j| &j.axis)));
    e.reals("JNT_POS", flat3(k.joints.iter().map(|j| &j.pos)));
    e.reals("QPOS0", k.qpos0.iter().copied());
    e.ints("DOF_BODY", k.dofs.iter().map(|d| idx(d.body)));
    e.ints("DOF_JNT", k.dofs.iter().map(|d| idx(d.joint)));
    e.ints("DOF_PARENT", k.dofs.iter().map(|d| opt(d.parent)));
    e.reals("DOF_ARMATURE", k.dofs.iter().map(|d| d.armature));
    e.reals("DOF_DAMPING", k.dofs.iter().map(|d| d.damping));
    e.ints("GEOM_BODY", k.geoms.iter().map(|g| idx(g.body)));
    e.ints("GEOM_FRAME", k.geoms.iter().map(|g| frame(g.frame)));
    e.ints(
        "GEOM_MESH",
        k.geoms.iter().map(|g| match g.shape {
            Shape::Mesh(m) => idx(m),
            _ => -1,
        }),
    );
    e.reals("GEOM_POS", flat3(k.geoms.iter().map(|g| &g.pos)));
    e.reals("GEOM_QUAT", flat4(k.geoms.iter().map(|g| &g.quat)));
    e.reals("GEOM_SIZE", flat3(k.geoms.iter().map(|g| &g.size)));
}

fn matrix(e: &mut Emitter, plan: &Plan) {
    let nv = plan.kernel.nv;
    let (adr, nnz, col) = (&plan.m_adr, &plan.m_nnz, &plan.m_col);
    let mut ops = vec![0];
    let (mut upd_adr, mut target, mut len) = (Vec::new(), Vec::new(), Vec::new());

    for k in (0..nv).rev() {
        for a in (adr[k]..adr[k] + nnz[k] - 1).rev() {
            let i = col[a];

            upd_adr.push(idx(a));
            target.push(idx(adr[i]));
            len.push(idx(nnz[i]));
        }

        ops.push(idx(upd_adr.len()));
    }

    e.ints("M_ADR", adr.iter().map(|&v| idx(v)));
    e.ints("M_NNZ", nnz.iter().map(|&v| idx(v)));
    e.ints("M_COL", col.iter().map(|&v| idx(v)));
    columns(e, plan);
    e.ints("FACT_OP", ops);
    e.ints("UPD_ADR", upd_adr);
    e.ints("UPD_TARGET", target);
    e.ints("UPD_LEN", len);
}

fn columns(e: &mut Emitter, plan: &Plan) {
    let nv = plan.kernel.nv;
    let mut adr = vec![0];
    let (mut ent, mut row) = (Vec::new(), Vec::new());

    for j in 0..nv {
        for i in j + 1..nv {
            let below = plan.m_adr[i]..plan.diag(i);

            if let Some(a) = below.clone().find(|&a| plan.m_col[a] == j) {
                ent.push(idx(a));
                row.push(idx(i));
            }
        }

        adr.push(idx(ent.len()));
    }

    e.ints("COL_ADR", adr);
    e.ints("COL_ENT", ent);
    e.ints("COL_ROW", row);
}

#[derive(Default)]
struct MeshTables {
    vadr: Vec<i64>,
    vnum: Vec<i64>,
    fnum: Vec<i64>,
    vert: Vec<f32>,
    face_vadr: Vec<i64>,
    face_vnum: Vec<i64>,
    face_v: Vec<i64>,
    face_normal: Vec<f64>,
    vf_adr: Vec<i64>,
    vf_num: Vec<i64>,
    vf: Vec<i64>,
    climb_adr: Vec<i64>,
    climb_vertex: Vec<i64>,
    climb_nadr: Vec<i64>,
    climb_nnum: Vec<i64>,
    climb_nb: Vec<i64>,
    climb_extrema: Vec<i64>,
}

impl MeshTables {
    fn add(&mut self, m: &forge_ir::Mesh) {
        let face0 = self.face_vadr.len();

        self.vadr.push(idx(self.vert.len() / 3));
        self.vnum.push(idx(m.vertices.len()));
        self.fnum.push(idx(m.faces.len()));
        self.vert.extend(m.vertices.iter().flatten());

        for f in &m.faces {
            self.face_vadr.push(idx(self.face_v.len()));
            self.face_vnum.push(idx(f.vertices.len()));
            self.face_v.extend(f.vertices.iter().map(|&v| idx(v)));
            self.face_normal.extend(f.normal);
        }

        for v in 0..m.vertices.len() {
            let faces = m.vertex_faces.get(v).map_or(&[][..], |f| &f[..]);

            self.vf_adr.push(idx(self.vf.len()));
            self.vf_num.push(idx(faces.len()));
            self.vf.extend(faces.iter().map(|&f| idx(face0 + f)));
        }

        self.add_climb(m);
    }

    fn add_climb(&mut self, m: &forge_ir::Mesh) {
        let Some(climb) = &m.climb else {
            self.climb_adr.push(-1);
            self.climb_extrema.extend([0; 27]);
            return;
        };

        self.climb_adr.push(idx(self.climb_vertex.len()));
        self.climb_vertex.extend(climb.vertex.iter().map(|&v| idx(v)));

        for n in &climb.neighbours {
            self.climb_nadr.push(idx(self.climb_nb.len()));
            self.climb_nnum.push(idx(n.len()));
            self.climb_nb.extend(n.iter().map(|&v| idx(v)));
        }

        self.climb_extrema.extend(climb.extrema.iter().map(|&v| idx(v)));
    }

    fn emit(self, e: &mut Emitter) {
        e.ints("MESH_VADR", self.vadr);
        e.ints("MESH_VNUM", self.vnum);
        e.ints("MESH_FNUM", self.fnum);
        e.floats("VERT", self.vert);
        e.ints("FACE_VADR", self.face_vadr);
        e.ints("FACE_VNUM", self.face_vnum);
        e.ints("FACE_V", self.face_v);
        e.reals("FACE_NORMAL", self.face_normal);
        e.ints("VF_ADR", self.vf_adr);
        e.ints("VF_NUM", self.vf_num);
        e.ints("VF", self.vf);
        e.ints("CLIMB_ADR", self.climb_adr);
        e.ints("CLIMB_VERTEX", self.climb_vertex);
        e.ints("CLIMB_NADR", self.climb_nadr);
        e.ints("CLIMB_NNUM", self.climb_nnum);
        e.ints("CLIMB_NB", self.climb_nb);
        e.ints("CLIMB_EXTREMA", self.climb_extrema);
    }
}

fn meshes(e: &mut Emitter, plan: &Plan) {
    let mut t = MeshTables::default();

    for m in &plan.kernel.meshes {
        t.add(m);
    }

    t.emit(e);
}

pub fn supported(imp: &Imp) -> bool {
    imp.flat() || imp.solimp[4] == 1.0 || imp.solimp[4] == 2.0
}

pub fn imps(plan: &Plan) -> Vec<&Imp> {
    plan.limits
        .iter()
        .map(|l| &l.imp)
        .chain(plan.contacts.iter().map(|s| &s.imp))
        .collect()
}

fn impedances(e: &mut Emitter, plan: &Plan) {
    let list = imps(plan);

    e.ints("IMP_FLAT", list.iter().map(|i| i64::from(i.flat())));
    e.ints("IMP_SQUARE", list.iter().map(|i| i64::from(i.solimp[4] == 2.0)));
    e.reals("IMP_SOLIMP", list.iter().flat_map(|i| i.solimp));
    e.reals("IMP_K", list.iter().map(|i| i.k));
    e.reals("IMP_BB", list.iter().map(|i| i.b));
    e.reals("IMP_MID", list.iter().map(|i| 0.5 * (i.solimp[0] + i.solimp[1])));
    e.reals("IMP_A", list.iter().map(|i| 1.0 / i.solimp[3]));
    e.reals("IMP_B2", list.iter().map(|i| 1.0 / (1.0 - i.solimp[3])));
}

fn rows(e: &mut Emitter, plan: &Plan) {
    let f = &plan.friction;
    let l = &plan.limits;

    e.ints("FRIC_DOF", f.iter().map(|r| idx(r.dof)));
    e.reals("FRIC_LOSS", f.iter().map(|r| r.loss));
    e.reals("FRIC_R", f.iter().map(|r| r.r));
    e.reals("FRIC_D", f.iter().map(|r| 1.0 / r.r));
    e.reals("FRIC_RF", f.iter().map(|r| r.r * r.loss));
    e.reals("FRIC_B", f.iter().map(|r| r.b));
    e.ints("LIM_QPOSADR", l.iter().map(|r| idx(r.qposadr)));
    e.ints("LIM_DOF", l.iter().map(|r| idx(r.dof)));
    e.ints("LIM_IMP", (0..l.len()).map(idx));
    e.floats("LIM_SIGN", l.iter().map(|r| r.sign as f32));
    e.reals("LIM_BOUND", l.iter().map(|r| r.bound));
    e.reals("LIM_MARGIN", l.iter().map(|r| r.margin));
    e.reals("LIM_DIAG", l.iter().map(|r| r.diag));
}

fn chains(e: &mut Emitter, plan: &Plan) {
    let mut adr = Vec::new();
    let mut dofs = Vec::new();
    let (mut term_adr, mut term_num) = (Vec::new(), Vec::new());
    let (mut term_dof, mut term_root, mut term_sign) = (Vec::new(), Vec::new(), Vec::new());
    let (mut hess_adr, mut hess) = (Vec::new(), Vec::new());

    for c in &plan.chains {
        adr.push(idx(dofs.len()));
        dofs.extend(c.dofs.iter().map(|&d| idx(d)));
        hess_adr.push(idx(hess.len()));
        hess.extend(c.hessian.iter().map(|&h| idx(h)));

        for terms in &c.terms {
            term_adr.push(idx(term_dof.len()));
            term_num.push(idx(terms.len()));
            term_dof.extend(terms.iter().map(|t| idx(t.dof)));
            term_root.extend(terms.iter().map(|t| idx(t.root)));
            term_sign.extend(terms.iter().map(|t| t.sign as f32));
        }
    }

    e.ints("CHAIN_ADR", adr);
    e.ints("CHAIN_LEN", plan.chains.iter().map(|c| idx(c.dofs.len())));
    e.ints("CHAIN_DOF", dofs);
    e.ints("TERM_ADR", term_adr);
    e.ints("TERM_NUM", term_num);
    e.ints("TERM_DOF", term_dof);
    e.ints("TERM_ROOT", term_root);
    e.floats("TERM_SIGN", term_sign);
    e.ints("HESS_ADR", hess_adr);
    e.ints("HESS", hess);
}

fn pairs(e: &mut Emitter, plan: &Plan) {
    let p = &plan.kernel.pairs;
    let s = &plan.contacts;
    let nlim = plan.limits.len();
    let mut slot0 = Vec::new();

    for (i, _) in p.iter().enumerate() {
        slot0.push(opt(s.iter().position(|c| c.pair == i)));
    }

    e.ints("PAIR_G1", p.iter().map(|x| idx(x.geoms[0])));
    e.ints("PAIR_G2", p.iter().map(|x| idx(x.geoms[1])));
    e.ints(
        "PAIR_MIX",
        p.iter().map(|x| match x.mix {
            FrictionMix::Max => 0,
            FrictionMix::First => 1,
            FrictionMix::Second => 2,
        }),
    );
    e.ints(
        "PAIR_COLLIDER",
        p.iter().map(|x| match x.collider {
            Collider::PlaneConvex => 0,
            Collider::PlaneSphere => 1,
            Collider::PlaneCapsule => 2,
            Collider::PlaneCylinder => 3,
            Collider::PlaneBox => 4,
        }),
    );
    e.reals("PAIR_REACH", p.iter().map(|x| x.margin + x.gap));
    e.ints("PAIR_SLOT0", slot0);
    e.ints("SLOT_PAIR", s.iter().map(|c| idx(c.pair)));
    e.ints("SLOT_CHAIN", s.iter().map(|c| idx(c.chain)));
    e.ints("SLOT_ROWS", s.iter().map(|c| idx(c.rows)));
    e.ints("SLOT_IMP", (0..s.len()).map(|i| idx(nlim + i)));
    e.reals("SLOT_TRAN", s.iter().map(|c| c.tran));
    e.reals("SLOT_RATIO", s.iter().map(|c| c.ratio));
    e.reals("SLOT_MARGIN", s.iter().map(|c| c.include_margin));
}

pub fn emit(e: &mut Emitter, plan: &Plan) {
    bodies(e, plan);
    joints_dofs_geoms(e, plan);
    matrix(e, plan);
    meshes(e, plan);
    impedances(e, plan);
    rows(e, plan);
    chains(e, plan);
    pairs(e, plan);
    super::actuators::emit(e, plan);
}
