use crate::read::Reader;
use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Refusal {
    pub reasons: Vec<String>,
}

impl fmt::Display for Refusal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Forge's engine can't simulate this model exactly: {}",
            self.reasons.join("; ")
        )
    }
}

impl std::error::Error for Refusal {}

impl Refusal {
    pub fn one(reason: impl Into<String>) -> Self {
        Self {
            reasons: vec![reason.into()],
        }
    }
}

const INTEGRATORS: [&str; 5] = ["Euler", "RK4", "implicit", "implicitfast", "discrete"];
const SOLVERS: [&str; 3] = ["PGS", "CG", "Newton"];

const REFUSED_DISABLE: [(u32, &str); 7] = [
    (0, "the constraint solver"),
    (2, "frictionloss"),
    (3, "joint limits"),
    (4, "contacts"),
    (6, "damping"),
    (7, "gravity"),
    (11, "actuation"),
];

const ENABLE_NAMES: [&str; 7] = [
    "contact override",
    "energy",
    "forward-inverse comparison",
    "discrete inverse dynamics",
    "sleeping",
    "exact constraint diagonals",
    "IPC flex contact",
];

const COUNTS: [(&str, &str); 11] = [
    ("neq", "equality constraints"),
    ("ntendon", "tendons"),
    ("nflex", "flexes"),
    ("nsensor", "sensors"),
    ("nplugin", "plugins"),
    ("nmocap", "mocap bodies"),
    ("npair", "explicit contact pairs"),
    ("nexclude", "contact exclusions"),
    ("na", "actuator activations"),
    ("ngravcomp", "gravity compensation"),
    ("nhfield", "height fields"),
];

pub fn options(r: &Reader, reasons: &mut Vec<String>) -> Result<(), String> {
    let integrator = r.flag("integrator")?;

    if integrator != 3 {
        let name = INTEGRATORS.get(integrator as usize).copied().unwrap_or("unknown");

        reasons.push(format!(
            "it uses the {name} integrator, and Forge runs implicitfast only"
        ));
    }

    let solver = r.flag("solver")?;

    if solver != 2 {
        let name = SOLVERS.get(solver as usize).copied().unwrap_or("unknown");

        reasons.push(format!("it uses the {name} solver, and Forge runs Newton only"));
    }

    if r.flag("cone")? != 0 {
        reasons.push("it uses elliptic friction cones, and Forge runs pyramidal cones only".into());
    }

    if r.flag("noslip_iterations")? > 0 {
        reasons.push("it runs the noslip solver".into());
    }

    if r.scalar("density")? > 0.0 || r.scalar("viscosity")? > 0.0 {
        reasons.push("it has fluid forces (density or viscosity)".into());
    }

    flags(r, reasons)
}

fn flags(r: &Reader, reasons: &mut Vec<String>) -> Result<(), String> {
    let disable = r.flag("disableflags")? as u32;
    let enable = r.flag("enableflags")? as u32;

    for (bit, name) in REFUSED_DISABLE {
        if disable & (1 << bit) != 0 {
            reasons.push(format!("it disables {name}"));
        }
    }

    for (bit, name) in ENABLE_NAMES.iter().enumerate() {
        if bit != 1 && enable & (1 << bit) != 0 {
            reasons.push(format!("it enables {name}"));
        }
    }

    if r.flag("disableactuator")? != 0 {
        reasons.push("it disables actuator groups".into());
    }

    Ok(())
}

pub fn counts(r: &Reader, reasons: &mut Vec<String>) -> Result<(), String> {
    for (field, what) in COUNTS {
        let n = r.size(field)?;

        if n > 0 {
            reasons.push(format!("it has {what} ({n})"));
        }
    }

    Ok(())
}

pub fn nonzero(values: &[f64]) -> bool {
    values.iter().any(|&v| v != 0.0)
}
