use crate::kernel::{Body, Dof, Friction, Joint, JointKind, Limit, SameFrame};
use crate::names::Names;
use crate::read::{index, vec2, vec3, vec4, vec5, Reader};
use crate::refuse::nonzero;

pub fn same_frame(code: u8) -> SameFrame {
    match code {
        1 => SameFrame::Body,
        2 => SameFrame::Inertia,
        3 => SameFrame::BodyRot,
        4 => SameFrame::InertiaRot,
        _ => SameFrame::None,
    }
}

pub fn bodies(r: &Reader) -> Result<Vec<Body>, String> {
    let n = r.size("nbody")?;
    let parent = r.i32s("body_parentid")?;
    let root = r.i32s("body_rootid")?;
    let weld = r.i32s("body_weldid")?;
    let jntnum = r.i32s("body_jntnum")?;
    let jntadr = r.i32s("body_jntadr")?;
    let dofnum = r.i32s("body_dofnum")?;
    let dofadr = r.i32s("body_dofadr")?;
    let (pos, quat) = (r.f64s("body_pos")?, r.f64s("body_quat")?);
    let (ipos, iquat) = (r.f64s("body_ipos")?, r.f64s("body_iquat")?);
    let (mass, subtree) = (r.f64s("body_mass")?, r.f64s("body_subtreemass")?);
    let (inertia, invweight) = (r.f64s("body_inertia")?, r.f64s("body_invweight0")?);
    let sameframe = r.u8s("body_sameframe")?;

    Ok((0..n)
        .map(|i| Body {
            parent: index(parent[i]).unwrap_or(0),
            root: index(root[i]).unwrap_or(0),
            weld: index(weld[i]).unwrap_or(0),
            pos: vec3(pos, i),
            quat: vec4(quat, i),
            ipos: vec3(ipos, i),
            iquat: vec4(iquat, i),
            mass: mass[i],
            subtree_mass: subtree[i],
            inertia: vec3(inertia, i),
            invweight: vec2(invweight, i),
            inertial_frame: same_frame(sameframe[i]),
            joints: (0..jntnum[i].max(0) as usize).map(|k| jntadr[i] as usize + k).collect(),
            dofadr: index(dofadr[i]).unwrap_or(0),
            dofnum: dofnum[i].max(0) as usize,
        })
        .collect())
}

fn joint_kind(code: i32) -> JointKind {
    match code {
        0 => JointKind::Free,
        2 => JointKind::Slide,
        3 => JointKind::Hinge,
        _ => JointKind::Ball,
    }
}

pub fn joints(r: &Reader, names: &Names, reasons: &mut Vec<String>) -> Result<Vec<Joint>, String> {
    let n = r.size("njnt")?;
    let kind = r.i32s("jnt_type")?;
    let (qposadr, dofadr, body) = (r.i32s("jnt_qposadr")?, r.i32s("jnt_dofadr")?, r.i32s("jnt_bodyid")?);
    let (limited, actfrc) = (r.u8s("jnt_limited")?, r.u8s("jnt_actfrclimited")?);
    let (solref, solimp) = (r.f64s("jnt_solref")?, r.f64s("jnt_solimp")?);
    let (pos, axis, range) = (r.f64s("jnt_pos")?, r.f64s("jnt_axis")?, r.f64s("jnt_range")?);
    let (stiffness, poly, margin) = (
        r.f64s("jnt_stiffness")?,
        r.f64s("jnt_stiffnesspoly")?,
        r.f64s("jnt_margin")?,
    );
    let mut out = Vec::with_capacity(n);

    for i in 0..n {
        let k = joint_kind(kind[i]);

        if k == JointKind::Ball {
            reasons.push(format!("{} is a ball joint", names.get("jnt", i)));
        }

        if stiffness[i] != 0.0 || nonzero(&poly[2 * i..2 * i + 2]) {
            reasons.push(format!("{} has a spring", names.get("jnt", i)));
        }

        if actfrc[i] != 0 {
            reasons.push(format!("{} limits actuator force at the joint", names.get("jnt", i)));
        }

        out.push(Joint {
            kind: k,
            body: body[i] as usize,
            qposadr: qposadr[i] as usize,
            dofadr: dofadr[i] as usize,
            axis: vec3(axis, i),
            pos: vec3(pos, i),
            limit: (limited[i] != 0 && k != JointKind::Free).then(|| Limit {
                range: vec2(range, i),
                margin: margin[i],
                solref: vec2(solref, i),
                solimp: vec5(solimp, i),
            }),
        });
    }

    Ok(out)
}

pub fn dofs(r: &Reader, names: &Names, reasons: &mut Vec<String>) -> Result<Vec<Dof>, String> {
    let n = r.size("nv")?;
    let (body, joint, parent) = (r.i32s("dof_bodyid")?, r.i32s("dof_jntid")?, r.i32s("dof_parentid")?);
    let simple = r.i32s("dof_simplenum")?;
    let (solref, solimp) = (r.f64s("dof_solref")?, r.f64s("dof_solimp")?);
    let (loss, armature, damping) = (
        r.f64s("dof_frictionloss")?,
        r.f64s("dof_armature")?,
        r.f64s("dof_damping")?,
    );
    let (poly, invweight) = (r.f64s("dof_dampingpoly")?, r.f64s("dof_invweight0")?);
    let mut out = Vec::with_capacity(n);

    for i in 0..n {
        if nonzero(&poly[2 * i..2 * i + 2]) {
            reasons.push(format!(
                "{} has polynomial damping",
                names.get("jnt", joint[i] as usize)
            ));
        }

        if simple[i] > 0 {
            reasons.push(format!(
                "{} has a constant diagonal inertia, which MuJoCo treats as a simple body",
                names.get("body", body[i] as usize)
            ));
        }

        out.push(Dof {
            body: body[i] as usize,
            joint: joint[i] as usize,
            parent: index(parent[i]),
            armature: armature[i],
            damping: damping[i],
            invweight: invweight[i],
            friction: (loss[i] != 0.0).then(|| Friction {
                loss: loss[i],
                solref: vec2(solref, i),
                solimp: vec5(solimp, i),
            }),
        });
    }

    Ok(out)
}

pub fn standalone_free_bodies(r: &Reader, names: &Names, joints: &[Joint], reasons: &mut Vec<String>) {
    let (Ok(tree), Ok(tree_dofnum)) = (r.i32s("dof_treeid"), r.i32s("tree_dofnum")) else {
        return;
    };

    for j in joints.iter().filter(|j| j.kind == JointKind::Free) {
        let t = tree[j.dofadr] as usize;

        if tree_dofnum[t] == 6 {
            reasons.push(format!(
                "{} is a free body with no jointed children, which MuJoCo integrates with its gyroscopic solve",
                names.get("body", j.body)
            ));
        }
    }
}
