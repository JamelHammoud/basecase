#[cfg(feature = "onnx")]
pub mod onnx;

use crate::control::Inputs;
use crate::intent::MAX_OBSERVATIONS;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

const POLL: Duration = Duration::from_micros(500);

pub trait Policy: Send {
    fn act(&mut self, observation: &[f32], action: &mut Vec<f32>) -> Result<(), String>;
}

pub struct PolicyWorker {
    stop: Arc<AtomicBool>,
    consumed: Arc<AtomicU64>,
    _handle: JoinHandle<()>,
}

impl PolicyWorker {
    pub fn spawn(mut policy: Box<dyn Policy>, inputs: &Inputs) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let consumed = Arc::new(AtomicU64::new(0));
        let observations = inputs.observations.clone();
        let actions = inputs.policy_actions.clone();
        let thread_stop = stop.clone();
        let thread_consumed = consumed.clone();
        let handle = std::thread::spawn(move || {
            let mut last = 0;
            let mut observation = [0.0f32; MAX_OBSERVATIONS];
            let mut action = Vec::new();

            while !thread_stop.load(Ordering::SeqCst) {
                let fresh = observations
                    .read(&mut observation)
                    .filter(|snapshot| snapshot.version != last);

                if let Some(snapshot) = fresh {
                    last = snapshot.version;
                    thread_consumed.fetch_add(1, Ordering::SeqCst);

                    if policy.act(&observation[..snapshot.count], &mut action).is_ok() {
                        actions.publish(&action);
                    }
                }

                std::thread::sleep(POLL);
            }
        });

        Self {
            stop,
            consumed,
            _handle: handle,
        }
    }

    pub fn consumed(&self) -> u64 {
        self.consumed.load(Ordering::SeqCst)
    }
}

impl Drop for PolicyWorker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

pub struct HoldStill {
    joints: usize,
}

impl HoldStill {
    pub fn new(joints: usize) -> Self {
        Self { joints }
    }
}

impl Policy for HoldStill {
    fn act(&mut self, observation: &[f32], action: &mut Vec<f32>) -> Result<(), String> {
        action.clear();
        action.extend(observation.iter().step_by(2).take(self.joints));

        Ok(())
    }
}
