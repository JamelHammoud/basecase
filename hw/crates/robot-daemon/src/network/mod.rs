pub mod enrollment;
pub mod interfaces;
pub mod pair_client;
mod pairing;
pub mod server;

use hmac::{Hmac, Mac};
pub use pairing::{auth_mac, random_hex, Pairing};
use sha2::Sha256;
use std::io::{BufRead, BufReader, Error, ErrorKind};
use std::net::IpAddr;
use std::net::TcpStream;
use std::time::{Duration, Instant};
use subtle::ConstantTimeEq;

pub fn private_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(ip) => ip.is_private() || ip.is_loopback() || ip.is_link_local(),
        IpAddr::V6(ip) => ip.to_ipv4_mapped().map_or_else(
            || ip.is_loopback() || (ip.segments()[0] & 0xfe00 == 0xfc00) || (ip.segments()[0] & 0xffc0 == 0xfe80),
            |v4| private_address(IpAddr::V4(v4)),
        ),
    }
}

pub fn bounded_line(reader: &mut impl BufRead, limit: usize) -> std::io::Result<String> {
    bounded_read(reader, limit, |_| Ok(()))
}

pub fn socket_line(reader: &mut BufReader<TcpStream>, limit: usize, idle: Duration) -> std::io::Result<String> {
    let socket = reader.get_ref().try_clone()?;

    bounded_read(reader, limit, |remaining| {
        socket.set_read_timeout(Some(remaining.min(idle)))
    })
}

fn bounded_read(
    reader: &mut impl BufRead,
    limit: usize,
    prepare: impl Fn(Duration) -> std::io::Result<()>,
) -> std::io::Result<String> {
    let mut bytes = Vec::with_capacity(limit.min(4096));
    let started = Instant::now();

    loop {
        let remaining = Duration::from_secs(5)
            .checked_sub(started.elapsed())
            .filter(|time| !time.is_zero())
            .ok_or_else(|| Error::new(ErrorKind::TimedOut, "The robot command took too long."))?;
        prepare(remaining)?;

        let available = reader.fill_buf()?;

        if available.is_empty() {
            return Err(Error::new(ErrorKind::UnexpectedEof, "The robot connection closed."));
        }

        let length = available.iter().position(|byte| *byte == b'\n').map(|index| index + 1);
        let count = length.unwrap_or(available.len());

        if count > limit.saturating_sub(bytes.len()) {
            return Err(Error::new(ErrorKind::InvalidData, "The robot command is too large."));
        }

        bytes.extend_from_slice(&available[..count]);
        reader.consume(count);

        if length.is_some() {
            bytes.pop();

            return String::from_utf8(bytes)
                .map_err(|_| Error::new(ErrorKind::InvalidData, "The robot command needs UTF-8."));
        }
    }
}

pub fn hmac(key: &[u8; 32], message: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("A 32-byte key is a valid HMAC key");
    mac.update(message.as_bytes());

    mac.finalize()
        .into_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn session_mac(key: &[u8; 32], nonce: &str, sequence: u64, body: &str) -> String {
    hmac(key, &format!("{nonce}:{sequence}:{body}"))
}

pub fn equal_secret(left: &str, right: &str) -> bool {
    left.as_bytes().ct_eq(right.as_bytes()).into()
}

pub fn verify_mac(key: &[u8; 32], nonce: &str, sequence: u64, body: &str, mac: &str) -> bool {
    equal_secret(&session_mac(key, nonce, sequence, body), mac)
}
