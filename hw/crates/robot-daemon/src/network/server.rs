use super::{auth_mac, equal_secret, hmac, private_address, random_hex, session_mac, socket_line, Pairing};
use crate::intent::IntentWriter;
use crate::ladder::Mode;
use crate::protocol::{event_line, parse_line, Routed};
use crate::runner::Controller;
use crate::{Command, Inputs};
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use servo_wire::Clock;
use std::io::{BufReader, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::mpsc::{sync_channel, Receiver, SyncSender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub struct NetworkOptions {
    pub address: SocketAddr,
    pub name: String,
    pub pairing_code: Option<String>,
    pub artefacts: PathBuf,
    pub spec: Value,
}

struct Output {
    client: Mutex<Option<SyncSender<String>>>,
    diagnostics: SyncSender<String>,
}

type Sink = Arc<Output>;
enum Request {
    Command(Command),
    Reset(SyncSender<()>),
}

pub fn serve<C: Controller + Send + 'static>(
    inputs: Inputs,
    daemon: C,
    clock: Arc<dyn Clock>,
    hello: String,
    options: NetworkOptions,
) -> Result<(), String> {
    if !private_address(options.address.ip()) {
        return Err("Choose a private network address for --listen.".into());
    }

    let mut pairing = Pairing::load(&options.artefacts, options.pairing_code.as_deref())?;
    let listener =
        TcpListener::bind(options.address).map_err(|error| format!("The robot listener could not start: {error}"))?;
    let address = listener.local_addr().map_err(|error| error.to_string())?;
    let _advertisement = advertise(&options, address, &pairing)?;
    let (diagnostics, diagnostic_lines) = sync_channel::<String>(256);
    std::thread::spawn(move || {
        let mut stdout = std::io::stdout();

        for line in diagnostic_lines {
            if writeln!(stdout, "{line}").and_then(|()| stdout.flush()).is_err() {
                break;
            }
        }
    });
    let sink = Arc::new(Output {
        client: Mutex::new(None),
        diagnostics,
    });
    let (requests, receiver) = sync_channel(64);
    let output = sink.clone();
    let writer = IntentWriter::new(inputs.intents.clone(), inputs.heartbeat.clone());

    let run_clock = clock.clone();
    std::thread::spawn(move || run(daemon, run_clock, receiver, output));
    println!(
        "{}",
        json!({"event":"listening","address":address.to_string(),"name":options.name,"family":options.spec["family"]})
    );
    let mut attempts = Vec::new();

    for connection in listener.incoming() {
        let Ok(stream) = connection else { continue };
        let allowed = stream.peer_addr().is_ok_and(|peer| private_address(peer.ip()));

        if !allowed {
            let _ = stream.shutdown(Shutdown::Both);
            continue;
        }

        let mut session = Session {
            stream,
            pairing: &mut pairing,
            requests: &requests,
            writer: &writer,
            sink: &sink,
            options: &options,
            hello: &hello,
            attempts: &mut attempts,
            clock: clock.as_ref(),
        };

        if let Err(message) = session.serve() {
            eprintln!("{message}");
        }

        *sink.client.lock().map_err(|_| "The robot output channel stopped.")? = None;
    }

    Ok(())
}

fn run<C: Controller>(mut daemon: C, clock: Arc<dyn Clock>, requests: Receiver<Request>, sink: Sink) {
    let mut tick = 0u64;
    let mut next = clock.now_micros();
    let mut reset = None;

    loop {
        for request in requests.try_iter().take(64) {
            match request {
                Request::Command(command) => daemon.command(command),
                Request::Reset(reply) => reset = Some(reply),
            }
        }

        daemon.tick();

        if daemon.is_quiet() && reset.is_some() {
            daemon.command(Command::Enter(Mode::Look));
            daemon.command(Command::ClearFault);
            daemon.take_events();

            if let Some(reply) = reset.take() {
                let _ = reply.try_send(());
            }
        }

        for event in daemon.take_events() {
            let line = event_line(&event);
            emit(&sink, line);
        }

        if tick.is_multiple_of(5) {
            emit(&sink, daemon.status_line());
        }

        tick += 1;
        next += crate::caps::TICK_US;
        clock.wait_until(next);
    }
}

fn emit(sink: &Sink, line: String) {
    let _ = sink.diagnostics.try_send(line.clone());
    let Ok(current) = sink.client.lock() else { return };

    if let Some(output) = current.as_ref() {
        let _ = output.try_send(line);
    }
}

struct Session<'a> {
    stream: TcpStream,
    pairing: &'a mut Pairing,
    requests: &'a SyncSender<Request>,
    writer: &'a IntentWriter,
    sink: &'a Sink,
    options: &'a NetworkOptions,
    hello: &'a str,
    attempts: &'a mut Vec<Instant>,
    clock: &'a dyn Clock,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    seq: u64,
    body: String,
    mac: String,
}

impl Session<'_> {
    fn serve(&mut self) -> Result<(), String> {
        self.stream.set_nodelay(true).map_err(io_error)?;
        self.stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .map_err(io_error)?;
        self.stream
            .set_write_timeout(Some(Duration::from_millis(100)))
            .map_err(io_error)?;
        let nonce = random_hex()?;
        let key = self.pairing.key_bytes()?;
        let exchange = self.pairing.code.as_deref().map(super::enrollment::Exchange::server);
        write_line(
            &mut self.stream,
            &json!({"event":"challenge","nonce":nonce,"paired":self.pairing.code.is_none(),"pairing_message":exchange.as_ref().map(|value|value.message.as_str())}).to_string(),
        )?;
        let mut reader = BufReader::new(self.stream.try_clone().map_err(io_error)?);
        let line = socket_line(&mut reader, 4096, Duration::from_secs(5)).map_err(io_error)?;
        let auth: Value =
            serde_json::from_str(&line).map_err(|_| "The robot needs a pairing or authentication command.")?;

        if auth["cmd"] == "pair" {
            return self.pair(
                &auth,
                &nonce,
                exchange.ok_or("This robot is already paired. Connect with its saved key.")?,
            );
        }

        let expected = auth_mac(&key, &nonce);

        if auth["cmd"] != "authenticate"
            || !auth["proof"]
                .as_str()
                .is_some_and(|proof| equal_secret(proof, &expected))
        {
            return Err("Pair this computer with the robot before connecting.".into());
        }

        if self.pairing.code.is_some() {
            self.pairing.consume(&self.options.artefacts)?;
        }

        let (reply, reset) = sync_channel(1);
        self.requests
            .try_send(Request::Reset(reply))
            .map_err(|_| "The robot command queue is full.")?;
        reset
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| "Wait for the robot to finish stopping before reconnecting.")?;
        let mut hello: Value = serde_json::from_str(self.hello).map_err(|_| "The robot greeting could not be read.")?;
        hello["spec"] = self.options.spec.clone();
        hello["name"] = json!(self.options.name);
        hello["id"] = json!(self.pairing.robot_id()?);
        hello["calibration"] = std::fs::read(self.options.artefacts.join("calibration.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .unwrap_or(Value::Null);
        write_signed(&mut self.stream, &key, &nonce, 1, &hello.to_string())?;
        let (events, receiver) = sync_channel::<String>(256);
        *self
            .sink
            .client
            .lock()
            .map_err(|_| "The robot output channel stopped.")? = Some(events);
        let mut output = self.stream.try_clone().map_err(io_error)?;
        let output_nonce = nonce.clone();

        std::thread::spawn(move || {
            for (index, body) in receiver.iter().enumerate() {
                if write_signed(&mut output, &key, &output_nonce, index as u64 + 2, &body).is_err() {
                    let _ = output.shutdown(Shutdown::Both);
                    break;
                }
            }
        });
        self.stream
            .set_read_timeout(Some(Duration::from_secs(1)))
            .map_err(io_error)?;
        let outcome = self.commands(&mut reader, &key, &nonce);
        let _ = self.stream.shutdown(Shutdown::Both);
        emit(
            self.sink,
            json!({"event":"client_disconnected","at_us":self.clock.now_micros()}).to_string(),
        );

        outcome
    }

    fn pair(&mut self, auth: &Value, nonce: &str, exchange: super::enrollment::Exchange) -> Result<(), String> {
        self.attempts
            .retain(|attempt| attempt.elapsed() < Duration::from_secs(60));

        if self.attempts.len() >= 5 {
            return Err("Wait one minute before trying another pairing code.".into());
        }

        self.attempts.push(Instant::now());

        let client_message = auth["message"]
            .as_str()
            .ok_or("The pairing request needs an exchange message.")?;
        let transcript = super::enrollment::transcript(nonce, &exchange.message, client_message);
        let key = exchange.finish(client_message, nonce)?;
        let proof = auth["proof"].as_str().ok_or("The pairing request needs a proof.")?;

        if !equal_secret(proof, &hmac(&key, &transcript)) {
            return Err("Check the six-digit code shown on the robot computer.".into());
        }

        let encrypted = super::enrollment::encrypt(&key, &transcript, &self.pairing.key_bytes()?)?;
        write_line(&mut self.stream, &encrypted.to_string())
    }

    fn commands(&mut self, reader: &mut BufReader<TcpStream>, key: &[u8; 32], nonce: &str) -> Result<(), String> {
        let mut sequence = 1u64;

        loop {
            let line = socket_line(reader, 23 * 1024 * 1024, Duration::from_secs(1)).map_err(io_error)?;
            let envelope: Envelope =
                serde_json::from_str(&line).map_err(|_| "The robot command needs authentication.")?;

            if envelope.seq != sequence
                || !equal_secret(&session_mac(key, nonce, sequence, &envelope.body), &envelope.mac)
            {
                return Err("The robot command could not be authenticated. Reconnect to continue.".into());
            }

            sequence = sequence
                .checked_add(1)
                .ok_or("Reconnect to continue sending commands.")?;
            let value: Value =
                serde_json::from_str(&envelope.body).map_err(|_| "The robot command could not be read.")?;

            if value["cmd"] == "put_artefact" {
                self.put_artefact(&value)?;
                continue;
            }

            match parse_line(&envelope.body)? {
                Routed::Intent(joints) => {
                    self.writer.write_intent(&joints);
                }
                Routed::Heartbeat => self.writer.heartbeat(),
                Routed::Command(command) => self
                    .requests
                    .try_send(Request::Command(command))
                    .map_err(|_| "The robot command queue is full.")?,
                Routed::PlugIn => return Err("Plug in emulated servos through the local connection.".into()),
            }
        }
    }

    fn put_artefact(&self, value: &Value) -> Result<(), String> {
        let name = value["name"].as_str().ok_or("Name the robot artefact.")?;
        let limit: usize = match name {
            "calibration.json" => 65536,
            "policy.onnx" => 16 * 1024 * 1024,
            _ => return Err("Choose calibration.json or policy.onnx.".into()),
        };
        let path = self.options.artefacts.join(name);

        if value["data"].is_null() && name == "policy.onnx" {
            match std::fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.to_string()),
            }

            emit(self.sink, json!({"event":"artefact","name":name}).to_string());

            return Ok(());
        }

        let data = value["data"].as_str().ok_or("The robot artefact needs base64 data.")?;

        if data.len() > limit.div_ceil(3) * 4 {
            return Err("The robot artefact is too large.".into());
        }

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data)
            .map_err(|_| "The robot artefact needs base64 data.")?;

        if bytes.len() > limit {
            return Err("The robot artefact is too large.".into());
        }

        if name == "calibration.json" {
            crate::calibration::Calibration::parse(&bytes)
                .map_err(|_| "Check the robot calibration before sending it.")?;
        }

        let temporary = self.options.artefacts.join(format!(".{name}.incoming"));
        std::fs::write(&temporary, bytes).map_err(io_error)?;
        replace_file(&temporary, &path)?;
        emit(self.sink, json!({"event":"artefact","name":name}).to_string());

        Ok(())
    }
}

fn replace_file(source: &std::path::Path, destination: &std::path::Path) -> Result<(), String> {
    std::fs::rename(source, destination).map_err(io_error)
}

fn io_error(error: std::io::Error) -> String {
    error.to_string()
}

fn write_line(stream: &mut TcpStream, line: &str) -> Result<(), String> {
    writeln!(stream, "{line}").map_err(io_error)
}

fn write_signed(stream: &mut TcpStream, key: &[u8; 32], nonce: &str, sequence: u64, body: &str) -> Result<(), String> {
    let mac = hmac(key, &format!("{nonce}:server:{sequence}:{body}"));

    write_line(stream, &json!({"seq":sequence,"body":body,"mac":mac}).to_string())
}

fn advertise(
    options: &NetworkOptions,
    address: SocketAddr,
    pairing: &Pairing,
) -> Result<mdns_sd::ServiceDaemon, String> {
    let daemon = mdns_sd::ServiceDaemon::new().map_err(|error| error.to_string())?;
    daemon
        .disable_interface(mdns_sd::IfKind::All)
        .map_err(|error| error.to_string())?;
    daemon
        .enable_interface(mdns_sd::IfKind::Addr(address.ip()))
        .map_err(|error| error.to_string())?;
    let family = options.spec["family"].as_str().unwrap_or("unknown");
    let id = pairing.robot_id()?;
    let properties = [("name", options.name.as_str()), ("family", family), ("id", id.as_str())];
    let host = format!("basecase-{}.local.", &random_hex()?[..12]);
    let service = mdns_sd::ServiceInfo::new(
        "_basecase-robot._tcp.local.",
        &options.name,
        &host,
        address.ip(),
        address.port(),
        &properties[..],
    )
    .map_err(|error| error.to_string())?;
    daemon.register(service).map_err(|error| error.to_string())?;

    Ok(daemon)
}
