mod args;
mod bench;
mod drive;
mod identity;
mod meter;
mod metal_runs;
mod parity;
mod reference;

use args::{Args, Mode};
use std::process::ExitCode;

fn run(args: &Args) -> Result<serde_json::Value, String> {
    match args.mode {
        Mode::Parity => parity::run(args),
        Mode::Identity => identity::run(args),
        Mode::Bench => bench::run(args),
    }
}

fn main() -> ExitCode {
    let args = match Args::parse(std::env::args().skip(1)) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(2);
        }
    };

    match run(&args) {
        Ok(value) => {
            println!("{value}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}
