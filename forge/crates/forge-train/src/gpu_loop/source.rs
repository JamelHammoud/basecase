use std::fmt::Write;

const GEMM: &str = include_str!("shaders/gemm.metal");
const ROLLOUT: &str = include_str!("shaders/rollout.metal");
const UPDATE: &str = include_str!("shaders/update.metal");

pub const CTRL_LEN: usize = 16;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ctrl {
    Lr = 0,
    Kl = 1,
    Norm = 2,
    StepRate = 3,
    Second = 4,
    Steps = 5,
    AdvMean = 6,
    AdvStd = 7,
    Scale = 8,
    Apply = 9,
}

const CTRL_NAMES: [(&str, Ctrl); 10] = [
    ("CTRL_LR", Ctrl::Lr),
    ("CTRL_KL", Ctrl::Kl),
    ("CTRL_NORM", Ctrl::Norm),
    ("CTRL_STEP_RATE", Ctrl::StepRate),
    ("CTRL_SECOND", Ctrl::Second),
    ("CTRL_STEPS", Ctrl::Steps),
    ("CTRL_ADV_MEAN", Ctrl::AdvMean),
    ("CTRL_ADV_STD", Ctrl::AdvStd),
    ("CTRL_SCALE", Ctrl::Scale),
    ("CTRL_APPLY", Ctrl::Apply),
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum K {
    GemmNn,
    GemmNt,
    GemmTn,
    Normalize,
    NormUpdate,
    Sample,
    Gae,
    Moments,
    Standardize,
    Gather,
    PolicyHead,
    ValueHead,
    HeadSums,
    SplitSum,
    GradSquares,
    AdamBegin,
    Adam,
    AdaptRate,
}

pub const NAMES: [&str; 18] = [
    "gemm_nn",
    "gemm_nt",
    "gemm_tn",
    "normalize",
    "norm_update",
    "sample",
    "gae",
    "moments",
    "standardize",
    "gather",
    "policy_head",
    "value_head",
    "head_sums",
    "split_sum",
    "grad_squares",
    "adam_begin",
    "adam",
    "adapt_rate",
];

pub struct Sizes {
    pub nobs: usize,
    pub nact: usize,
    pub log_std_at: usize,
    pub nparams: usize,
}

pub fn source(sizes: &Sizes) -> String {
    let mut out = String::from(GEMM);

    for (name, value) in [
        ("NOBS", sizes.nobs),
        ("NACT", sizes.nact),
        ("LOG_STD_AT", sizes.log_std_at),
        ("NPARAMS", sizes.nparams),
    ] {
        let _ = writeln!(out, "#define {name} {value}");
    }

    for (name, slot) in CTRL_NAMES {
        let _ = writeln!(out, "#define {name} {}", slot as usize);
    }

    out.push_str(forge_sim::metal::RNG);
    out.push_str(ROLLOUT);
    out.push_str(UPDATE);
    out
}
