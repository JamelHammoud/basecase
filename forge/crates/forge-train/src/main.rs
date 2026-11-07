use forge_train::{events, trainer};
use std::path::PathBuf;
use std::process::ExitCode;

fn job_folder(args: &[String]) -> Result<PathBuf, String> {
    let flag = args
        .iter()
        .position(|a| a == "--job")
        .ok_or("Usage: forge-train --job <folder>")?;
    let folder = args.get(flag + 1).ok_or("Usage: forge-train --job <folder>")?;

    Ok(PathBuf::from(folder))
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if args.iter().any(|a| a == "--check") {
        events::emit_check();

        return Ok(());
    }

    trainer::train(&job_folder(&args)?)
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");

            ExitCode::FAILURE
        }
    }
}
