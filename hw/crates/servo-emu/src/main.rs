use servo_emu::bus::{BusOptions, ServoBus};
use servo_emu::cli::{parse, CliOptions};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let options = match parse(&args) {
        Ok(options) => options,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    };

    if !options.pty {
        eprintln!("Nothing to serve: pass --pty, or use the in-process transport from Rust.");
        std::process::exit(2);
    }

    let bus = ServoBus::new(
        options.family,
        &options.ids,
        BusOptions {
            seed: options.seed,
            fault: options.fault,
            ..BusOptions::default()
        },
    );

    run(bus, &options);
}

#[cfg(unix)]
fn run(bus: ServoBus, _options: &CliOptions) {
    use servo_emu::pty::{parent_has_gone, PtyPort};
    use servo_emu::serve::Server;
    use servo_wire::{Clock, SystemClock};
    use std::io::Write;

    let mut port = match PtyPort::open() {
        Ok(port) => port,
        Err(error) => {
            eprintln!("Could not open a PTY: {error}");
            std::process::exit(1);
        }
    };
    let clock = SystemClock::new();
    let parent = nix::unistd::getppid();
    let mut server = Server::new(bus);
    let mut next_parent_check = 0;

    println!("{{\"pty\":\"{}\"}}", port.path());
    std::io::stdout().flush().ok();

    while server.turn(&mut port, &clock).is_ok() {
        let now = clock.now_micros();

        if now >= next_parent_check {
            next_parent_check = now + 500_000;

            if parent_has_gone(parent) {
                break;
            }
        }
    }
}

#[cfg(not(unix))]
fn run(_bus: ServoBus, _options: &CliOptions) {
    eprintln!("Windows has no PTY. Use the in-process transport with 16 ms of latency.");
    std::process::exit(2);
}
