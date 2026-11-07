use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub trait ArtefactSource: Send {
    fn calibration(&self) -> Option<Vec<u8>>;

    fn policy(&self) -> Option<Vec<u8>>;
}

pub struct DirectoryArtefacts {
    dir: PathBuf,
}

impl DirectoryArtefacts {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }
}

impl ArtefactSource for DirectoryArtefacts {
    fn calibration(&self) -> Option<Vec<u8>> {
        std::fs::read(self.dir.join("calibration.json")).ok()
    }

    fn policy(&self) -> Option<Vec<u8>> {
        std::fs::read(self.dir.join("policy.onnx")).ok()
    }
}

type CalibrationAndPolicy = (Option<Vec<u8>>, Option<Vec<u8>>);

#[derive(Clone, Default)]
pub struct MemoryArtefacts {
    files: Arc<Mutex<CalibrationAndPolicy>>,
}

impl MemoryArtefacts {
    pub fn new(calibration: Option<Vec<u8>>, policy: Option<Vec<u8>>) -> Self {
        Self {
            files: Arc::new(Mutex::new((calibration, policy))),
        }
    }

    pub fn set_calibration(&self, bytes: Option<Vec<u8>>) {
        if let Ok(mut files) = self.files.lock() {
            files.0 = bytes;
        }
    }

    pub fn set_policy(&self, bytes: Option<Vec<u8>>) {
        if let Ok(mut files) = self.files.lock() {
            files.1 = bytes;
        }
    }
}

impl ArtefactSource for MemoryArtefacts {
    fn calibration(&self) -> Option<Vec<u8>> {
        self.files.lock().ok().and_then(|files| files.0.clone())
    }

    fn policy(&self) -> Option<Vec<u8>> {
        self.files.lock().ok().and_then(|files| files.1.clone())
    }
}
