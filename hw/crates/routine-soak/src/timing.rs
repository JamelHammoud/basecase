use std::time::{Duration, Instant};

const SPIN: Duration = Duration::from_micros(1500);

pub fn sleep_until(target: Instant) {
    let now = Instant::now();

    if target > now + SPIN {
        std::thread::sleep(target - now - SPIN);
    }

    while Instant::now() < target {
        std::hint::spin_loop();
    }
}

pub fn millis(since: Instant) -> u64 {
    u64::try_from(since.elapsed().as_millis()).unwrap_or(u64::MAX)
}

pub fn percentile(sorted: &[u64], share: f64) -> u64 {
    if sorted.is_empty() {
        return 0;
    }

    let last = sorted.len() - 1;
    let rank = (share * last as f64).ceil() as usize;

    sorted.get(rank.min(last)).copied().unwrap_or_default()
}
