mod cli;

use cli::{parse, Robot};
use robot_daemon::artefacts::DirectoryArtefacts;
use robot_daemon::g1::G1Daemon;
use robot_daemon::intent::IntentWriter;
use robot_daemon::protocol::{g1_hello_line, hello_line, parse_line, refused_line, ros2_hello_line, Routed};
use robot_daemon::ros2::{Ros2Daemon, Ros2Parts};
use robot_daemon::runner::{Controller, Runner};
use robot_daemon::transport::{open, open_g1, open_ros2, NewServos, Ros2Link, ServoRobot, Target, NO_MORE_SERVOS};
use robot_daemon::{Command, Daemon, DaemonConfig, Inputs};
use servo_wire::{Clock, SystemClock};
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, sync_channel, Sender, SyncSender};
use std::sync::Arc;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().is_some_and(|argument| argument == "--interface-for") {
        let address = args
            .get(1)
            .filter(|_| args.len() == 2)
            .unwrap_or_else(|| quit(2, "--interface-for needs the robot's private IP address."));
        let name =
            robot_daemon::network::interfaces::interface_for(address).unwrap_or_else(|message| quit(4, &message));
        println!("{name}");
        return;
    }

    if args.first().is_some_and(|argument| argument == "--pair-client") {
        let address = args
            .get(1)
            .filter(|_| args.len() == 2)
            .unwrap_or_else(|| quit(2, "--pair-client needs a private IP address and port."));
        robot_daemon::network::pair_client::run(address).unwrap_or_else(|message| quit(4, &message));
        return;
    }

    let mut options = parse(&args).unwrap_or_else(|message| quit(2, &message));
    let clock: Arc<dyn Clock> = Arc::new(SystemClock::new());
    let emulated = matches!(options.target, Target::Emulated { .. });
    if let Some(network) = &mut options.network {
        network.spec = options.robot.spec(emulated);
    }

    let artefacts = Box::new(DirectoryArtefacts::new(options.artefacts.clone()));

    match options.robot {
        Robot::G1 => {
            let transport = open_g1(&options.target).unwrap_or_else(|message| quit(3, &message));
            let daemon = G1Daemon::new(transport, clock.clone(), artefacts);

            dispatch(
                daemon.inputs(),
                daemon,
                clock,
                None,
                g1_hello_line(emulated),
                options.network,
            );
        }
        Robot::Ros2 { spec, topic } => {
            let link = Ros2Link {
                kind: spec.kind,
                topic: &topic,
                joints: &spec.joints,
            };
            let transport = open_ros2(&options.target, link).unwrap_or_else(|message| quit(3, &message));
            let daemon = Ros2Daemon::new(Ros2Parts {
                spec,
                transport,
                clock: clock.clone(),
                artefacts,
            });

            dispatch(
                daemon.inputs(),
                daemon,
                clock,
                None,
                ros2_hello_line(emulated),
                options.network,
            );
        }
        Robot::Servos {
            family,
            ids,
            class,
            units,
        } => {
            let robot = ServoRobot {
                family,
                ids: &ids,
                units: &units,
            };
            let opened = open(&options.target, robot, clock.clone()).unwrap_or_else(|message| quit(3, &message));
            let config = DaemonConfig { family, ids, class };
            let mut daemon = Daemon::new(config, opened.transport, clock.clone(), artefacts);
            let _policy = attach_policy(&mut daemon, &options.artefacts);

            dispatch(
                daemon.inputs(),
                daemon,
                clock,
                opened.new_servos,
                hello_line(family, emulated),
                options.network,
            );
        }
    }
}

fn dispatch<C: Controller + Send + 'static>(
    inputs: Inputs,
    daemon: C,
    clock: Arc<dyn Clock>,
    new_servos: Option<NewServos>,
    hello: String,
    network: Option<robot_daemon::network::server::NetworkOptions>,
) {
    if let Some(options) = network {
        robot_daemon::network::server::serve(inputs, daemon, clock, hello, options)
            .unwrap_or_else(|message| quit(4, &message));
        return;
    }

    say_hello(&hello);
    serve(inputs, daemon, clock, new_servos);
}

fn quit(code: i32, message: &str) -> ! {
    eprintln!("{message}");
    std::process::exit(code);
}

fn serve<C: Controller>(inputs: Inputs, daemon: C, clock: Arc<dyn Clock>, new_servos: Option<NewServos>) {
    let writer = IntentWriter::new(inputs.intents.clone(), inputs.heartbeat.clone());
    let (command_tx, commands) = channel();
    let (lines, line_rx) = sync_channel::<String>(256);
    let client_gone = Arc::new(AtomicBool::new(false));

    spawn_reader(
        Reader {
            writer,
            commands: command_tx,
            lines: lines.clone(),
            new_servos,
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
