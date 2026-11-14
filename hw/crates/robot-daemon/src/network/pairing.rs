use super::hmac;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Pairing {
    pub key: String,
    pub code: Option<String>,
}

pub fn random_hex() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| format!("The robot needs secure random bytes: {error}"))?;

    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub fn auth_mac(key: &[u8; 32], nonce: &str) -> String {
    hmac(key, &format!("basecase-robot-v1:{nonce}"))
}

impl Pairing {
    pub fn load(directory: &Path, requested_code: Option<&str>) -> Result<Self, String> {
        std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;
        let path = directory.join("pairing.json");

        if path.exists() {
            let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
            let pairing: Self = serde_json::from_slice(&bytes).map_err(|_| "The robot pairing file cannot be read.")?;
            pairing.key_bytes()?;

            if pairing
                .code
                .as_ref()
                .is_some_and(|code| code.len() != 6 || !code.bytes().all(|byte| byte.is_ascii_digit()))
            {
                return Err("The saved pairing code needs six digits.".into());
            }

            return Ok(pairing);
        }

        let key = random_hex()?;
        let number = u32::from_str_radix(&random_hex()?[..6], 16).map_err(|error| error.to_string())?;
        let code = requested_code
            .map(str::to_string)
            .unwrap_or_else(|| format!("{:06}", number % 1_000_000));

        if code.len() != 6 || !code.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err("The pairing code needs six digits.".into());
        }

        let pairing = Self {
            key,
            code: Some(code.clone()),
        };
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        secure_permissions(&mut options);
        let mut file = options.open(path).map_err(|error| error.to_string())?;
        file.write_all(&serde_json::to_vec(&pairing).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;

        eprintln!("Pairing code: {code}");

        Ok(pairing)
    }

    pub fn consume(&mut self, directory: &Path) -> Result<(), String> {
        let replacement = Self {
            key: self.key.clone(),
            code: None,
        };
        let temporary = directory.join(format!(".pairing-{}.incoming", random_hex()?));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        secure_permissions(&mut options);
        let mut file = options.open(&temporary).map_err(|error| error.to_string())?;
        file.write_all(&serde_json::to_vec(&replacement).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        std::fs::rename(temporary, directory.join("pairing.json")).map_err(|error| error.to_string())?;
        self.code = None;

        Ok(())
    }

    pub fn robot_id(&self) -> Result<String, String> {
        Ok(Sha256::digest(self.key_bytes()?)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect())
    }

    pub fn key_bytes(&self) -> Result<[u8; 32], String> {
        if self.key.len() != 64 || !self.key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("The robot pairing key needs 32 bytes.".into());
        }

        let mut key = [0u8; 32];

        for (index, byte) in key.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&self.key[index * 2..index * 2 + 2], 16).map_err(|error| error.to_string())?;
        }

        Ok(key)
    }
}

#[cfg(unix)]
fn secure_permissions(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;

    options.mode(0o600);
}

#[cfg(not(unix))]
fn secure_permissions(_options: &mut OpenOptions) {}
