#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Freshness {
    Fresh,
    Stale,
}

#[derive(Debug, Clone)]
pub struct Watchdog {
    limit_us: u64,
    last_value: Option<u64>,
    last_change_us: u64,
}

impl Watchdog {
    pub fn new(limit_us: u64) -> Self {
        Self {
            limit_us,
            last_value: None,
            last_change_us: 0,
        }
    }

    pub fn arm(&mut self, value: u64, now_us: u64) {
        self.last_value = Some(value);
        self.last_change_us = now_us;
    }

    pub fn observe(&mut self, value: u64, now_us: u64) -> Freshness {
        if self.last_value != Some(value) {
            self.last_value = Some(value);
            self.last_change_us = now_us;
        }

        if now_us.saturating_sub(self.last_change_us) > self.limit_us {
            Freshness::Stale
        } else {
            Freshness::Fresh
        }
    }

    pub fn age_us(&self, now_us: u64) -> u64 {
        now_us.saturating_sub(self.last_change_us)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn goes_stale_only_after_the_limit_without_change() {
        let mut watchdog = Watchdog::new(100);

        watchdog.arm(0, 0);
        assert_eq!(watchdog.observe(0, 100), Freshness::Fresh);
        assert_eq!(watchdog.observe(0, 101), Freshness::Stale);
        assert_eq!(watchdog.observe(1, 150), Freshness::Fresh);
        assert_eq!(watchdog.observe(1, 251), Freshness::Stale);
    }

    #[test]
    fn arming_restarts_the_count() {
        let mut watchdog = Watchdog::new(100);

        watchdog.arm(5, 1000);
        assert_eq!(watchdog.observe(5, 1050), Freshness::Fresh);
        assert_eq!(watchdog.age_us(1050), 50);
    }
}
