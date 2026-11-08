use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Options {
    pub plan: PathBuf,
    pub seconds: u64,
    pub workers: usize,
    pub hang: Option<String>,
    pub hang_seconds: u64,
}

pub fn parse(args: &[String]) -> Result<Options, String> {
    let mut plan = None;
    let mut seconds = 75;
    let mut workers = std::thread::available_parallelism().map_or(4, usize::from);
    let mut hang = None;
    let mut hang_seconds = 60;
    let mut rest = args.iter();

    while let Some(flag) = rest.next() {
        let value = rest.next().cloned().ok_or(format!("{flag} needs a value"))?;

        match flag.as_str() {
            "--plan" => plan = Some(PathBuf::from(value)),
            "--seconds" => seconds = number(&value)?,
            "--workers" => workers = usize::try_from(number(&value)?).map_err(|_| "Too many workers")?,
            "--hang" => hang = Some(value),
            "--hang-seconds" => hang_seconds = number(&value)?,
            other => return Err(format!("Unknown option {other}")),
        }
    }

    Ok(Options {
        plan: plan.ok_or("--plan is required")?,
        seconds,
        workers,
        hang,
        hang_seconds,
    })
}

fn number(value: &str) -> Result<u64, String> {
    value
        .parse::<u64>()
        .map_err(|_| format!("{value} isn't a whole number"))
}
