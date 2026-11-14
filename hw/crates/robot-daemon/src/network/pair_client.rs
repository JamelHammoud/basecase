use super::enrollment::{decrypt, transcript, Exchange};
use super::{bounded_line, hmac, private_address, socket_line};
use serde_json::{json, Value};
use std::io::{BufReader, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

pub fn pair(address: SocketAddr, code: &str) -> Result<String, String> {
    if !private_address(address.ip()) {
        return Err("Choose a private network address for the robot.".into());
    }

    if code.len() != 6 || !code.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("Enter the six-digit code shown on the robot computer.".into());
    }

    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(5)).map_err(|error| error.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| error.to_string())?;
    let mut reader = BufReader::new(stream.try_clone().map_err(|error| error.to_string())?);
    let challenge: Value = serde_json::from_str(
        &socket_line(&mut reader, 4096, Duration::from_secs(5)).map_err(|error| error.to_string())?,
    )
    .map_err(|_| "The robot pairing challenge couldn't be read.")?;
    let nonce = challenge["nonce"]
        .as_str()
        .ok_or("The robot pairing challenge needs a nonce.")?;
    let message = challenge["pairing_message"]
        .as_str()
        .ok_or("This robot is already paired. Connect with its saved key.")?;
    let exchange = Exchange::client(code);
    let client_message = exchange.message.clone();
    let key = exchange.finish(message, nonce)?;
    let transcript = transcript(nonce, message, &client_message);
    let request = json!({"cmd":"pair","message":client_message,"proof":hmac(&key, &transcript)});
    writeln!(stream, "{request}").map_err(|error| error.to_string())?;
    let response: Value = serde_json::from_str(
        &socket_line(&mut reader, 4096, Duration::from_secs(5))
            .map_err(|_| "Pairing failed. Check the code shown on the robot computer.")?,
    )
    .map_err(|_| "The robot pairing response couldn't be read.")?;
    let key = decrypt(&key, &transcript, &response)?;

    Ok(key.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub fn run(address: &str) -> Result<(), String> {
    let address: SocketAddr = address
        .parse()
        .map_err(|_| "Choose the robot's private IP address and port.")?;
    let stdin = std::io::stdin();
    let line =
        bounded_line(&mut stdin.lock(), 128).map_err(|_| "Send the pairing code through stdin as one JSON line.")?;
    let request: Value = serde_json::from_str(&line).map_err(|_| "The pairing code command couldn't be read.")?;
    let code = request["code"].as_str().ok_or("Enter the robot pairing code.")?;
    let key = pair(address, code)?;

    println!("{}", json!({"event":"paired","key":key}));

    Ok(())
}
