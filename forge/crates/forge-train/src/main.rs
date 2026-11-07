use forge_train::{adam_vector, events, trainer};
use std::path::PathBuf;
use std::process::ExitCode;

const USAGE: &str = "Usage: forge-train --job <folder> | --adam-vector <file> | --check";

fn flag_value(args: &[String], flag: &str) -> Option<Result<PathBuf, String>> {
    let at = args.iter().position(|a| a == flag)?;

    Some(args.get(at + 1).map(PathBuf::from).ok_or_else(|| USAGE.to_owned()))
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if args.iter().any(|a| a == "--check") {
        events::emit_check();

        return Ok(());
    }

    if let Some(file) = flag_value(&args, "--adam-vector") {
        return adam_vector::write_adam_vector(&file?);
    }

    trainer::train(&flag_value(&args, "--job").ok_or(USAGE)??)
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
