use std::path::PathBuf;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Parity,
    Identity,
    Bench,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Backend {
    Simd,
    Mujoco,
    Metal,
}

#[derive(Clone, Debug)]
pub struct Args {
    pub mode: Mode,
    pub backend: Backend,
    pub xml: PathBuf,
    pub steps: usize,
    pub envs: usize,
    pub seconds: f64,
    pub threads: Option<usize>,
}

const USAGE: &str = "Usage: forge-sim --xml <model.xml> [--steps N] [--backend simd|mujoco|metal] \
                     [--batch-identity] [--bench --envs N --seconds S] [--threads N]";

fn value<T: std::str::FromStr>(it: &mut impl Iterator<Item = String>, flag: &str) -> Result<T, String> {
    it.next()
        .and_then(|v| v.parse().ok())
        .ok_or_else(|| format!("{flag} needs a value. {USAGE}"))
}

impl Args {
    pub fn parse(raw: impl Iterator<Item = String>) -> Result<Self, String> {
        let mut it = raw;
        let mut args = Args {
            mode: Mode::Parity,
            backend: Backend::Simd,
            xml: PathBuf::new(),
            steps: 60,
            envs: 1024,
            seconds: 30.0,
            threads: None,
        };

        while let Some(flag) = it.next() {
            match flag.as_str() {
                "--xml" => args.xml = value::<String>(&mut it, "--xml")?.into(),
                "--steps" => args.steps = value(&mut it, "--steps")?,
                "--envs" => args.envs = value(&mut it, "--envs")?,
                "--seconds" => args.seconds = value(&mut it, "--seconds")?,
                "--threads" => args.threads = Some(value(&mut it, "--threads")?),
                "--batch-identity" => args.mode = Mode::Identity,
                "--bench" => args.mode = Mode::Bench,
                "--backend" => args.backend = backend(&value::<String>(&mut it, "--backend")?)?,
                other => return Err(format!("Unknown flag {other}. {USAGE}")),
            }
        }

        if args.xml.as_os_str().is_empty() {
            return Err(format!("--xml is required. {USAGE}"));
        }

        Ok(args)
    }
}

fn backend(name: &str) -> Result<Backend, String> {
    match name {
        "simd" => Ok(Backend::Simd),
        "mujoco" => Ok(Backend::Mujoco),
        "metal" => Ok(Backend::Metal),
        other => Err(format!("Unknown backend {other}: use simd, mujoco or metal")),
    }
}
