use crate::kernel::{Actuator, Delay, Interp, Joint, JointKind};
use crate::names::Names;
use crate::read::{vec2, Reader};
use crate::refuse::nonzero;

const GAIN_WIDTH: usize = 10;
const BIAS_WIDTH: usize = 10;

struct Table<'a> {
    trntype: &'a [i32],
    trnid: &'a [i32],
    dyntype: &'a [i32],
    gaintype: &'a [i32],
    biastype: &'a [i32],
    ctrlnum: &'a [i32],
    outnum: &'a [i32],
    plugin: &'a [i32],
    gainprm: &'a [f64],
    biasprm: &'a [f64],
    gear: &'a [f64],
    damping: &'a [f64],
    dampingpoly: &'a [f64],
    armature: &'a [f64],
    ctrllimited: &'a [u8],
    ctrlrange: &'a [f64],
    forcelimited: &'a [u8],
    forcerange: &'a [f64],
    history: &'a [i32],
    delay: &'a [f64],
}

impl<'a> Table<'a> {
    fn read(r: &Reader<'a>) -> Result<Self, String> {
        Ok(Self {
            trntype: r.i32s("actuator_trntype")?,
            trnid: r.i32s("actuator_trnid")?,
            dyntype: r.i32s("actuator_dyntype")?,
            gaintype: r.i32s("actuator_gaintype")?,
            biastype: r.i32s("actuator_biastype")?,
            ctrlnum: r.i32s("actuator_ctrlnum")?,
            outnum: r.i32s("actuator_outnum")?,
            plugin: r.i32s("actuator_plugin")?,
            gainprm: r.f64s("actuator_gainprm")?,
            biasprm: r.f64s("actuator_biasprm")?,
            gear: r.f64s("actuator_gear")?,
            damping: r.f64s("actuator_damping")?,
            dampingpoly: r.f64s("actuator_dampingpoly")?,
            armature: r.f64s("actuator_armature")?,
            ctrllimited: r.u8s("actuator_ctrllimited")?,
            ctrlrange: r.f64s("actuator_ctrlrange")?,
            forcelimited: r.u8s("actuator_forcelimited")?,
            forcerange: r.f64s("actuator_forcerange")?,
            history: r.i32s("actuator_history")?,
            delay: r.f64s("actuator_delay")?,
        })
    }

    fn problems(&self, i: usize, joints: &[Joint]) -> Vec<&'static str> {
        let mut out = Vec::new();
        let on_joint = matches!(self.trntype[i], 0 | 1)
            && joints
                .get(self.trnid[2 * i] as usize)
                .is_some_and(|j| matches!(j.kind, JointKind::Hinge | JointKind::Slide));

        if !on_joint {
            out.push("drives something other than a hinge or slide joint");
        }

        if self.dyntype[i] != 0 {
            out.push("has activation dynamics");
        }

        if self.gaintype[i] != 0 || !matches!(self.biastype[i], 0 | 1) {
            out.push("isn't a position, velocity or motor actuator");
        }

        if self.ctrlnum[i] != 1 || self.outnum[i] != 1 || self.plugin[i] >= 0 {
            out.push("has more than one input or output");
        }

        if self.damping[i] != 0.0 || self.armature[i] != 0.0 || nonzero(&self.dampingpoly[2 * i..2 * i + 2]) {
            out.push("adds damping or armature to its joint");
        }

        if self.history[2 * i] > 0 && self.history[2 * i + 1] > 1 {
            out.push("interpolates its delay with a spline");
        }

        out
    }

    fn lower(&self, i: usize, joints: &[Joint]) -> Actuator {
        let joint = &joints[self.trnid[2 * i] as usize];
        let samples = self.history[2 * i].max(0) as usize;
        let bias = &self.biasprm[BIAS_WIDTH * i..BIAS_WIDTH * i + 3];

        Actuator {
            dof: joint.dofadr,
            qposadr: joint.qposadr,
            gear: self.gear[6 * i],
            gain: self.gainprm[GAIN_WIDTH * i],
            bias: if self.biastype[i] == 1 {
                [bias[0], bias[1], bias[2]]
            } else {
                [0.0; 3]
            },
            ctrl_range: (self.ctrllimited[i] != 0).then(|| vec2(self.ctrlrange, i)),
            force_range: (self.forcelimited[i] != 0).then(|| vec2(self.forcerange, i)),
            delay: (samples > 0).then(|| Delay {
                seconds: self.delay[i],
                samples,
                interp: if self.history[2 * i + 1] == 0 {
                    Interp::Hold
                } else {
                    Interp::Linear
                },
            }),
        }
    }
}

pub fn actuators(
    r: &Reader,
    names: &Names,
    joints: &[Joint],
    reasons: &mut Vec<String>,
) -> Result<Vec<Actuator>, String> {
    let n = r.size("nu")?;
    let table = Table::read(r)?;
    let mut out = Vec::with_capacity(n);

    for i in 0..n {
        let problems = table.problems(i, joints);

        if problems.is_empty() {
            out.push(table.lower(i, joints));
        }

        for p in problems {
            reasons.push(format!("{} {p}", names.get("actuator", i)));
        }
    }

    Ok(out)
}
