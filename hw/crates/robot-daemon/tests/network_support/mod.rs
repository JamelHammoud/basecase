use robot_daemon::network::{auth_mac, equal_secret, hmac, pair_client, session_mac};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::net::{Shutdown, SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::time::{Duration, Instant};

pub struct Robot {
    child: Child,
    pub directory: PathBuf,
    pub address: SocketAddr,
    pub events: Receiver<Value>,
    pub count: usize,
}

impl Robot {
    pub fn start(family: &str, count: usize, class: &str) -> Self {
        Self::start_network(family, count, class, false)
    }

    pub fn start_on_interface(family: &str, count: usize, class: &str) -> Self {
        Self::start_network(family, count, class, true)
    }

    fn start_network(family: &str, count: usize, class: &str, interface: bool) -> Self {
        let directory = std::env::temp_dir().join(format!(
            "robot-network-{}-{}",
            std::process::id(),
            robot_daemon::network::random_hex().unwrap()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let ids: Vec<usize> = if family == "unitree-g1" {
            (13..=29).collect()
        } else {
            (1..=count).collect()
        };
        let joints: Vec<Value> = ids.iter().map(|id| json!({"id":id,"name":format!("joint_{id}"),"zero_counts":2048,"direction":1,"min_rad":-2.8,"max_rad":2.8})).collect();
        let calibration = json!({"joints":joints,"class":class,"stand_pose":vec![0.0;ids.len()]});
        std::fs::write(directory.join("calibration.json"), calibration.to_string()).unwrap();
        std::fs::write(directory.join("pairing-code.seed"), "123456").unwrap();
        let mut args = vec![
            "--family".to_string(),
            family.into(),
            "--emulated".into(),
            "--name".into(),
            format!("Test {family} {count}"),
            "--pairing-code-file".into(),
            directory.join("pairing-code.seed").display().to_string(),
            "--artefacts".into(),
            directory.display().to_string(),
        ];

        args.extend(match interface {
            true => vec![
                "--listen-interface".into(),
                robot_daemon::network::interfaces::interface_for("127.0.0.1").unwrap(),
                "--listen-port".into(),
                "0".into(),
            ],
            false => vec!["--listen".into(), "127.0.0.1:0".into()],
        });

        if family == "ros2" {
            args.extend([
                "--controller".into(),
                "forward_position".into(),
                "--joints".into(),
                ids.iter().map(|id| format!("joint_{id}")).collect::<Vec<_>>().join(","),
            ]);
        }

        if family == "feetech" || family == "dynamixel" {
            args.extend([
                "--ids".into(),
                ids.iter().map(ToString::to_string).collect::<Vec<_>>().join(","),
                "--class".into(),
                class.into(),
            ]);
        }

        let mut child = Command::new(env!("CARGO_BIN_EXE_robot-daemon"))
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .stdin(Stdio::null())
            .spawn()
            .unwrap();
        let stdout = child.stdout.take().unwrap();
        let (sender, events) = channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Ok(event) = serde_json::from_str(&line) {
                    let _ = sender.send(event);
                }
            }
        });
        let started = Instant::now();
        let address = loop {
            assert!(started.elapsed() < Duration::from_secs(10), "daemon never listened");
            let event: Value = events.recv_timeout(Duration::from_secs(5)).unwrap();

            if event["event"] == "listening" {
                break event["address"].as_str().unwrap().parse().unwrap();
            }
        };

        assert!(!directory.join("pairing-code.seed").exists());

        Self {
            child,
            directory,
            address,
            events,
            count: ids.len(),
        }
    }

    pub fn pair(&self) -> [u8; 32] {
        key_bytes(&pair_client::pair(self.address, "123456").unwrap())
    }

    pub fn key(&self) -> [u8; 32] {
        let pairing: Value =
            serde_json::from_slice(&std::fs::read(self.directory.join("pairing.json")).unwrap()).unwrap();

        key_bytes(pairing["key"].as_str().unwrap())
    }

    pub fn next(&self, predicate: impl Fn(&Value) -> bool, duration: Duration) -> Value {
        let started = Instant::now();

        loop {
            assert!(started.elapsed() < duration, "event timed out");
            let event = self
                .events
                .recv_timeout(duration.saturating_sub(started.elapsed()))
                .unwrap();

            if predicate(&event) {
                return event;
            }
        }
    }

    pub fn connect(&self, key: [u8; 32]) -> Link {
        Link::connect(self.address, key)
    }

    pub fn drive(&self, link: &mut Link) {
        link.send(json!({"cmd":"enter","mode":"set_up"}));
        link.send(json!({"cmd":"intent","joints":vec![0.0; self.count]}));
        link.send(json!({"cmd":"enter","mode":"test"}));
        let started = Instant::now();
        let mut running = false;
        let mut moved = false;

        while started.elapsed() < Duration::from_millis(1800) {
            link.send(json!({"cmd":"intent","joints":vec![0.08;self.count]}));
            std::thread::sleep(Duration::from_millis(20));

            for event in self.events.try_iter() {
                assert_ne!(event["event"], "fault", "unexpected fault: {event}");
                running |= event["event"] == "status" && event["run"] == "running";
                moved |= event["joints"].as_array().is_some_and(|joints| {
                    joints.iter().any(|joint| {
                        joint["position"]
                            .as_i64()
                            .is_some_and(|position| (position - 2048).abs() > 3)
                    })
                });
            }
        }

        assert!(running, "robot never reached Running");
        assert!(moved, "robot telemetry never changed position");
    }
}

impl Drop for Robot {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

pub fn key_bytes(hex: &str) -> [u8; 32] {
    std::array::from_fn(|index| u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16).unwrap())
}

pub struct Link {
    pub stream: TcpStream,
    reader: BufReader<TcpStream>,
    pub nonce: String,
    pub key: [u8; 32],
    sequence: u64,
    incoming: u64,
}

impl Link {
    pub fn challenge(address: SocketAddr) -> (TcpStream, BufReader<TcpStream>, Value) {
        let stream = TcpStream::connect_timeout(&address, Duration::from_secs(5)).unwrap();
        stream.set_read_timeout(Some(Duration::from_secs(6))).unwrap();
        stream.set_write_timeout(Some(Duration::from_secs(3))).unwrap();
        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        let challenge: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(challenge["event"], "challenge");

        (stream, reader, challenge)
    }

    pub fn connect(address: SocketAddr, key: [u8; 32]) -> Self {
        let (mut stream, reader, challenge) = Self::challenge(address);
        let nonce = challenge["nonce"].as_str().unwrap().to_string();
        writeln!(
            stream,
            "{}",
            json!({"cmd":"authenticate","proof":auth_mac(&key, &nonce)})
        )
        .unwrap();
        let mut link = Self {
            stream,
            reader,
            nonce,
            key,
            sequence: 1,
            incoming: 1,
        };
        let hello = link.event();
        assert_eq!(hello["event"], "hello");
        let identity: String = Sha256::digest(key).iter().map(|byte| format!("{byte:02x}")).collect();
        assert_eq!(hello["id"], identity);
        assert_eq!(hello["emulated"], true);
        assert_eq!(hello["real_transport"], false);
        assert!(hello["spec"].is_object());
        assert!(hello["calibration"].is_object());

        link
    }

    pub fn event(&mut self) -> Value {
        let mut line = String::new();
        self.reader.read_line(&mut line).unwrap();
        let envelope: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(envelope["seq"], self.incoming);
        let body = envelope["body"].as_str().unwrap();
        let mac = hmac(&self.key, &format!("{}:server:{}:{body}", self.nonce, self.incoming));
        assert!(equal_secret(&mac, envelope["mac"].as_str().unwrap()));
        self.incoming += 1;

        serde_json::from_str(body).unwrap()
    }

    pub fn envelope(&self, body: &Value) -> String {
        let body = body.to_string();

        json!({"seq":self.sequence,"mac":session_mac(&self.key,&self.nonce,self.sequence,&body),"body":body})
            .to_string()
    }

    pub fn send(&mut self, body: Value) {
        writeln!(self.stream, "{}", self.envelope(&body)).unwrap();
        self.sequence += 1;
    }

    pub fn close(&self) {
        self.stream.shutdown(Shutdown::Both).unwrap();
    }
}

impl Drop for Link {
    fn drop(&mut self) {
        let _ = self.stream.shutdown(Shutdown::Both);
    }
}
