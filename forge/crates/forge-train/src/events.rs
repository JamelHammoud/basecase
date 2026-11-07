use serde_json::{json, Value};
use std::io::Write;

#[derive(Clone, Copy, Debug, Default)]
pub struct Phases {
    pub physics: f64,
    pub observe: f64,
    pub reward: f64,
    pub inference: f64,
    pub gradient: f64,
}

fn round4(value: f64) -> f64 {
    (value * 1e4).round() / 1e4
}

impl Phases {
    pub fn to_json(self) -> Value {
        json!({
            "physics": round4(self.physics),
            "observe": round4(self.observe),
            "reward": round4(self.reward),
            "inference": round4(self.inference),
            "gradient": round4(self.gradient),
        })
    }
}

pub fn emit(event: &Value) {
    let line = event.to_string();
    let mut out = std::io::stdout().lock();

    if writeln!(out, "{line}").is_err() {
        std::process::exit(1);
    }

    let _ = out.flush();
}

pub fn status(message: &str) {
    emit(&json!({ "type": "status", "message": message }));
}

pub fn emit_check() {
    let cpus = std::thread::available_parallelism().map_or(1, |c| c.get());

    emit(&json!({
        "type": "check",
        "mujoco": forge_mujoco::version(),
        "forge": env!("CARGO_PKG_VERSION"),
        "cpus": cpus,
    }));
}
