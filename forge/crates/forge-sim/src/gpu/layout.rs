use super::actuators::history_len;
use super::sink::Sink;
use crate::plan::Plan;

#[derive(Clone, Debug, Default)]
pub struct Layout {
    pub fields: Vec<(&'static str, usize, usize)>,
    pub reals: usize,
    pub nstate: usize,
    pub ints: Vec<(&'static str, usize, usize)>,
    pub nints: usize,
    pub maxchain: usize,
    pub shared: bool,
}

pub const HESSIAN_DF: bool = false;
const SHARED_BYTES: usize = 32 * 1024;

pub fn hessian_bytes(plan: &Plan) -> usize {
    let width = if HESSIAN_DF { 8 } else { 4 };

    super::BLOCK * (plan.nm + 2 * plan.kernel.nv) * width
}

impl Layout {
    fn take(&mut self, name: &'static str, len: usize) {
        self.fields.push((name, self.reals, len));
        self.reals += len;
    }

    fn take_int(&mut self, name: &'static str, len: usize) {
        self.ints.push((name, self.nints, len));
        self.nints += len;
    }

    pub fn at(&self, name: &str) -> (usize, usize) {
        self.fields
            .iter()
            .find(|f| f.0 == name)
            .map(|f| (f.1, f.2))
            .unwrap_or((0, 0))
    }

    fn state(&mut self, plan: &Plan) {
        let k = &plan.kernel;

        for (name, len) in [
            ("QPOS", k.nq),
            ("QVEL", k.nv),
            ("CTRL", k.nu),
            ("WARM", k.nv),
            ("TIME", 1),
            ("HIST", history_len(plan)),
            ("TMASS", plan.nbody),
            ("TFRIC", k.geoms.len()),
            ("TGAIN", k.nu),
            ("TBIAS", 3 * k.nu),
        ] {
            self.take(name, len);
        }

        self.nstate = self.reals;
    }

    fn kinematics(&mut self, plan: &Plan) {
        let (nb, nj, ng, nv) = (
            plan.nbody,
            plan.kernel.joints.len(),
            plan.kernel.geoms.len(),
            plan.kernel.nv,
        );

        for (name, len) in [
            ("XPOS", 3 * nb),
            ("XQUAT", 4 * nb),
            ("XMAT", 9 * nb),
            ("XIPOS", 3 * nb),
            ("XIMAT", 9 * nb),
            ("XANCHOR", 3 * nj),
            ("XAXIS", 3 * nj),
            ("GXPOS", 3 * ng),
            ("GXMAT", 9 * ng),
            ("SUBCOM", 3 * nb),
            ("CINERT", 10 * nb),
            ("CRB", 10 * nb),
            ("CDOF", 6 * nv),
            ("CVEL", 6 * nb),
            ("CDOFDOT", 6 * nv),
            ("CACC", 6 * nb),
            ("CFRC", 6 * nb),
            ("MM", plan.nm),
        ] {
            self.take(name, len);
        }
    }

    fn vectors(&mut self, plan: &Plan) {
        let (nv, nu) = (plan.kernel.nv, plan.kernel.nu);

        for name in [
            "QBIAS", "QPASSIVE", "QACT", "QSMOOTH", "QACCS", "QACC", "QCON", "MA", "MV", "GRAD", "MGRAD", "DIR", "TMP",
            "IACC", "DERIV", "MX", "RES", "RHS",
        ] {
            self.take(name, nv);
        }

        self.take("ACTF", nu);
        self.take("CTRLE", nu);
    }

    fn contacts(&mut self, slots: usize) {
        self.take("CDIST", slots);

        for name in ["CPOS", "CTAN", "CNOR"] {
            self.take(name, 3 * slots);
        }

        self.take_int("CSLOT", slots);
    }

    fn rows(&mut self, plan: &Plan) {
        let nr = plan.nrows;

        self.take("SCRJ", 3 * self.maxchain);

        if !self.shared {
            self.take("HF", plan.nm + 2 * plan.kernel.nv);
        }

        self.take("RJAC", nr * plan.kernel.nv);
        self.take("RJC", nr * self.maxchain);

        for name in ["RR", "RD", "RAREF", "JAREF", "JV", "FORCE", "QUADR"] {
            self.take(name, nr);
        }

        self.take("QUAD", 3 * nr);
        self.take("FRC", plan.friction.len());
        self.contacts(plan.contacts.len());
        self.take_int("RCHAIN", nr);
        self.take_int("FRZ", plan.friction.len());
    }

    pub fn new(plan: &Plan) -> Self {
        Self::sized(plan, SHARED_BYTES)
    }

    pub fn sized(plan: &Plan, shared_bytes: usize) -> Self {
        let mut l = Layout {
            maxchain: plan.chains.iter().map(|c| c.dofs.len()).max().unwrap_or(1).max(1),
            shared: hessian_bytes(plan) <= shared_bytes,
            ..Layout::default()
        };

        l.state(plan);
        l.kinematics(plan);
        l.vectors(plan);
        l.rows(plan);
        l
    }

    pub fn emit(&self, e: &mut impl Sink) {
        for (name, at, _) in self.fields.iter().chain(&self.ints) {
            e.define(name, at);
        }

        e.define("NSTATE", self.nstate);
        e.define("NREALS", self.reals);
        e.define("NINTS", self.nints.max(1));
        e.define("BLOCK", super::BLOCK);
        e.define("MAXCHAIN", self.maxchain);
        e.define("H_DF", i32::from(HESSIAN_DF));
        e.define("H_SHARED", i32::from(self.shared));
    }
}
