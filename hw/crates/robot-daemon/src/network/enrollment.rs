use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use hkdf::Hkdf;
use serde_json::{json, Value};
use sha2::Sha256;
use spake2::{Ed25519Group, Identity, Password, Spake2};

pub struct Exchange {
    state: Spake2<Ed25519Group>,
    pub message: String,
}

impl Exchange {
    pub fn server(code: &str) -> Self {
        let (state, message) = Spake2::<Ed25519Group>::start_b(
            &Password::new(code.as_bytes()),
            &Identity::new(b"basecase-client"),
            &Identity::new(b"basecase-robot"),
        );

        Self {
            state,
            message: STANDARD.encode(message),
        }
    }

    pub fn client(code: &str) -> Self {
        let (state, message) = Spake2::<Ed25519Group>::start_a(
            &Password::new(code.as_bytes()),
            &Identity::new(b"basecase-client"),
            &Identity::new(b"basecase-robot"),
        );

        Self {
            state,
            message: STANDARD.encode(message),
        }
    }

    pub fn finish(self, peer: &str, nonce: &str) -> Result<[u8; 32], String> {
        let message = STANDARD.decode(peer).map_err(|_| "The pairing message needs base64.")?;
        let shared = self
            .state
            .finish(&message)
            .map_err(|_| "The pairing exchange could not be completed.")?;
        let salt = decode_hex(nonce)?;
        let mut key = [0u8; 32];
        Hkdf::<Sha256>::new(Some(&salt), &shared)
            .expand(b"basecase-robot-pair-v1", &mut key)
            .map_err(|_| "The pairing key could not be derived.")?;

        Ok(key)
    }
}

pub fn transcript(nonce: &str, server: &str, client: &str) -> String {
    format!("basecase-robot-pair-v1:{nonce}:{server}:{client}")
}

fn decode_hex(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() != 64 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("The pairing nonce needs 32 bytes.".into());
    }

    (0..32)
        .map(|index| u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16).map_err(|error| error.to_string()))
        .collect()
}

pub fn encrypt(key: &[u8; 32], transcript: &str, bytes: &[u8]) -> Result<Value, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "The pairing key needs 32 bytes.")?;
    let mut iv = [0u8; 12];
    getrandom::fill(&mut iv).map_err(|error| error.to_string())?;
    let data = cipher
        .encrypt(
            Nonce::from_slice(&iv),
            Payload {
                msg: bytes,
                aad: transcript.as_bytes(),
            },
        )
        .map_err(|_| "The pairing key could not be encrypted.")?;
    let proof = super::hmac(key, &format!("{transcript}:server"));

    Ok(json!({"event":"paired","iv":STANDARD.encode(iv),"data":STANDARD.encode(data),"proof":proof}))
}

pub fn decrypt(key: &[u8; 32], transcript: &str, reply: &Value) -> Result<[u8; 32], String> {
    let proof = reply["proof"]
        .as_str()
        .ok_or("The robot pairing response needs a proof.")?;

    if !super::equal_secret(proof, &super::hmac(key, &format!("{transcript}:server"))) {
        return Err("Check the pairing code and robot address before trying again.".into());
    }

    let iv = STANDARD
        .decode(reply["iv"].as_str().unwrap_or(""))
        .map_err(|_| "The pairing nonce needs base64.")?;
    let data = STANDARD
        .decode(reply["data"].as_str().unwrap_or(""))
        .map_err(|_| "The pairing data needs base64.")?;

    if iv.len() != 12 || data.len() != 48 {
        return Err("The encrypted pairing key has the wrong length.".into());
    }

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "The pairing key needs 32 bytes.")?;
    let bytes = cipher
        .decrypt(
            Nonce::from_slice(&iv),
            Payload {
                msg: &data,
                aad: transcript.as_bytes(),
            },
        )
        .map_err(|_| "The robot pairing response could not be authenticated.")?;

    bytes
        .try_into()
        .map_err(|_| "The robot pairing key needs 32 bytes.".into())
}
