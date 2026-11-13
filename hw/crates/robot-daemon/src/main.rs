use robot_daemon::artefacts::DirectoryArtefacts;
use robot_daemon::calibration::RobotClass;
use robot_daemon::intent::IntentWriter;
use robot_daemon::protocol::refused_line;
use robot_daemon::protocol::{hello_line, parse_line, Routed};
use robot_daemon::runner::Runner;
use robot_daemon::transport::{open, NewServos, Target, NO_MORE_SERVOS};
use robot_daemon::{Command, Daemon, DaemonConfig};
use servo_wire::{Clock, Family, SystemClock};
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, sync_channel, Sender, SyncSender};
use std::sync::Arc;

struct Options {
    family: Family,
    ids: Vec<u8>,
    class: RobotClass,
    artefacts: PathBuf,
    target: Target,
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let options = parse(&args).unwrap_or_else(|message| {
        eprintln!("{message}");
        std::process::exit(2);
    });
    let clock: Arc<dyn Clock> = Arc::new(SystemClock::new());
    let opened = open(&options.target, options.family, &options.ids, clock.clone()).unwrap_or_else(|message| {
        eprintln!("{message}");
        std::process::exit(3);
    });
    let emulated = matches!(options.target, Target::Emulated { .. });

    say_hello(&hello_line(options.family, emulated));

    let config = DaemonConfig {
        family: options.family,
        ids: options.ids,
        class: options.class,
    };
    let mut daemon = Daemon::new(
        config,
        opened.transport,
        clock.clone(),
        Box::new(DirectoryArtefacts::new(options.artefacts.clone())),
    );
    let _policy = attach_policy(&mut daemon, &options.artefacts);
    let inputs = daemon.inputs();
    let writer = IntentWriter::new(inputs.intents.clone(), inputs.heartbeat.clone());
    let (command_tx, commands) = channel();
    let (lines, line_rx) = sync_channel::<String>(256);
    let client_gone = Arc::new(AtomicBool::new(false));

    spawn_reader(
        Reader {
            writer,
            commands: command_tx,
            lines: lines.clone(),
            new_servos: opened.new_servos,
        },
        client_gone.clone(),
    );
    std::thread::spawn(move || {
        let mut stdout = std::io::stdout();

        for line in line_rx {
            if writeln!(stdout, "{line}").and_then(|()| stdout.flush()).is_err() {
                break;
            }
        }
    });

    let runner = Runner {
        daemon,
        commands,
        lines,
        clock,
        client_gone,
    };
    let jitter = runner.run();

    eprintln!(
        "Stopped after {} ticks; worst lateness {} us.",
        jitter.ticks, jitter.worst_late_us
    );
}

#[cfg(feature = "onnx")]
fn attach_policy(daemon: &mut Daemon, artefacts: &std::path::Path) -> Option<robot_daemon::policy::PolicyWorker> {
    let bytes = std::fs::read(artefacts.join("policy.onnx")).ok()?;
    let policy = robot_daemon::policy::onnx::OnnxPolicy::load(&bytes)
        .map_err(|message| eprintln!("{message}"))
        .ok()?;
    let inputs = daemon.attach_policy();

    Some(robot_daemon::policy::PolicyWorker::spawn(Box::new(policy), &inputs))
}

#[cfg(not(feature = "onnx"))]
fn attach_policy(_daemon: &mut Daemon, _artefacts: &std::path::Path) -> Option<()> {
    None
}

fn say_hello(line: &str) {
    let mut stdout = std::io::stdout();

    let _ = writeln!(stdout, "{line}").and_then(|()| stdout.flush());
}

struct Reader {
    writer: IntentWriter,
    commands: Sender<Command>,
    lines: SyncSender<String>,
    new_servos: Option<NewServos>,
}

impl Reader {
    fn plug_in(&mut self) {
        let plugged = self
            .new_servos
            .as_mut()
            .map_or(Err(NO_MORE_SERVOS.to_string()), NewServos::plug_in);

        if let Err(message) = plugged {
            let _ = self.lines.try_send(refused_line(&message));
        }
    }
}

fn spawn_reader(mut reader: Reader, client_gone: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let stdin = std::io::stdin();

        for line in stdin.lock().lines().map_while(Result::ok) {
            match parse_line(&line) {
                Ok(Routed::Intent(values)) => {
                    reader.writer.write_intent(&values);
                }
                Ok(Routed::Heartbeat) => reader.writer.heartbeat(),
                Ok(Routed::PlugIn) => reader.plug_in(),
                Ok(Routed::Command(command)) => {
                    let _ = reader.commands.send(command);
                }
                Err(message) => eprintln!("{message}"),
            }
        }

        client_gone.store(true, Ordering::SeqCst);
    });
}

fn parse(args: &[String]) -> Result<Options, String> {
    let mut family = None;
    let mut ids = Vec::new();
    let mut class = RobotClass::Arm;
    let mut artefacts = PathBuf::from(".");
    let mut target = None;
    let mut latency_us = 0;
    let mut factory = false;
    let mut rest = args.iter();

    while let Some(flag) = rest.next() {
        let mut value = || rest.next().cloned().ok_or(format!("{flag} needs a value"));

        match flag.as_str() {
            "--family" => family = Some(parse_family(&value()?)?),
            "--ids" => ids = parse_ids(&value()?)?,
            "--class" => class = parse_class(&value()?)?,
            "--artefacts" => artefacts = PathBuf::from(value()?),
            "--latency-ms" => latency_us = value()?.parse::<u64>().map_err(|_| "Bad latency")? * 1000,
            "--emulated" => {
                target = Some(Target::Emulated {
                    latency_us: 0,
                    seed: 1,
                    factory: false,
                })
            }
            "--factory" => factory = true,
            "--port" => {
                target = Some(Target::SerialPort {
                    path: value()?,
                    baud: 1_000_000,
                })
            }
            other => return Err(format!("Unknown option {other}")),
        }
    }

    let target = match target.ok_or("Choose --emulated or --port")? {
        Target::Emulated { seed, .. } => Target::Emulated {
            latency_us,
            seed,
            factory,
        },
        _ if factory => Err("--factory needs --emulated")?,
        serial => serial,
    };

    Ok(Options {
        family: family.ok_or("--family is required: feetech or dynamixel")?,
        ids: if ids.is_empty() { Err("--ids is required")? } else { ids },
        class,
        artefacts,
        target,
    })
}

fn parse_family(value: &str) -> Result<Family, String> {
    match value {
        "feetech" => Ok(Family::Feetech),
        "dynamixel" => Ok(Family::Dynamixel),
        other => Err(format!("Unknown family {other}")),
    }
}

fn parse_class(value: &str) -> Result<RobotClass, String> {
    match value {
        "arm" => Ok(RobotClass::Arm),
        "legged" => Ok(RobotClass::Legged),
        other => Err(format!("Unknown robot class {other}")),
    }
}

fn parse_ids(value: &str) -> Result<Vec<u8>, String> {
    value
        .split(',')
        .map(|id| id.trim().parse::<u8>().map_err(|_| format!("Bad servo id {id}")))
        .collect()
}
