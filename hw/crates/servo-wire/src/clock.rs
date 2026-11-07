use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

pub trait Clock: Send + Sync {
    fn now_micros(&self) -> u64;

    fn wait_until(&self, micros: u64);
}

#[derive(Clone, Default)]
pub struct VirtualClock {
    micros: Arc<AtomicU64>,
}

impl VirtualClock {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn advance_to(&self, micros: u64) {
        self.micros.fetch_max(micros, Ordering::SeqCst);
    }

    pub fn advance_by(&self, micros: u64) {
        self.micros.fetch_add(micros, Ordering::SeqCst);
    }
}

impl Clock for VirtualClock {
    fn now_micros(&self) -> u64 {
        self.micros.load(Ordering::SeqCst)
    }

    fn wait_until(&self, micros: u64) {
        self.advance_to(micros);
    }
}

pub struct SystemClock {
    start: Instant,
}

impl SystemClock {
    pub fn new() -> Self {
        Self { start: Instant::now() }
    }
}

impl Default for SystemClock {
    fn default() -> Self {
        Self::new()
    }
}

impl Clock for SystemClock {
    fn now_micros(&self) -> u64 {
        u64::try_from(self.start.elapsed().as_micros()).unwrap_or(u64::MAX)
    }

    fn wait_until(&self, micros: u64) {
        let now = self.now_micros();

        if micros > now {
            std::thread::sleep(std::time::Duration::from_micros(micros - now));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn virtual_clock_never_goes_backwards() {
        let clock = VirtualClock::new();

        clock.advance_to(500);
        clock.advance_to(100);
        assert_eq!(clock.now_micros(), 500);
        clock.advance_by(10);
        assert_eq!(clock.now_micros(), 510);
    }
}
