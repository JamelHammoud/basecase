use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct Meter {
    count: AtomicU64,
}

pub struct Windows {
    pub rates: Vec<f64>,
    pub mean: f64,
    pub min: f64,
}

impl Meter {
    pub fn add(&self, n: usize) {
        self.count.fetch_add(n as u64, Ordering::Relaxed);
    }

    pub fn total(&self) -> u64 {
        self.count.load(Ordering::Relaxed)
    }

    pub fn watch(&self, seconds: f64) -> Windows {
        let start = Instant::now();
        let first = self.count.load(Ordering::Relaxed);
        let mut last = (start, first);
        let mut rates = Vec::new();
        let window = Duration::from_secs(1);

        while start.elapsed().as_secs_f64() + 1e-9 < seconds {
            let remaining = Duration::from_secs_f64((seconds - start.elapsed().as_secs_f64()).max(0.0));

            std::thread::sleep(window.min(remaining));

            let now = (Instant::now(), self.count.load(Ordering::Relaxed));
            let dt = now.0.duration_since(last.0).as_secs_f64();

            if dt >= 0.5 {
                rates.push((now.1 - last.1) as f64 / dt);
            }

            last = now;
        }

        let total = (last.1 - first) as f64 / last.0.duration_since(start).as_secs_f64();
        let min = rates.iter().copied().fold(f64::INFINITY, f64::min);

        Windows {
            rates,
            mean: total,
            min: if min.is_finite() { min } else { total },
        }
    }
}
