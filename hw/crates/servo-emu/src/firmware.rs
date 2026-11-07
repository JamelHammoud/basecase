use plant_bam::Plant;
use servo_wire::Frame;

pub trait Firmware: Send {
    fn id(&self) -> u8;

    fn respond(&mut self, frame: &Frame, now_us: u64) -> Option<Vec<u8>>;

    fn sync_read_reply(&mut self, address: u16, length: u16, now_us: u64) -> Vec<u8>;

    fn sync_write(&mut self, address: u16, data: &[u8], now_us: u64);

    fn step(&mut self, dt_s: f64, bus_volts: f64, now_us: u64);

    fn current_amps(&self) -> f64;

    fn return_delay_us(&self) -> u64;

    fn power_cycle(&mut self, now_us: u64);

    fn plant_mut(&mut self) -> &mut Plant;

    fn plant(&self) -> &Plant;

    fn torque_enabled(&self) -> bool;

    fn set_firmware_version(&mut self, version: u8);

    fn register(&self, address: u16) -> u8;
}

pub struct TargetSmoother {
    value: Option<f64>,
}

impl TargetSmoother {
    pub fn new() -> Self {
        Self { value: None }
    }

    pub fn reset(&mut self) {
        self.value = None;
    }

    pub fn next(&mut self, goal: f64, present: f64, max_step: f64) -> f64 {
        let previous = self.value.unwrap_or(present);
        let next = goal.clamp(previous - max_step, previous + max_step);

        self.value = Some(next);

        next
    }
}

impl Default for TargetSmoother {
    fn default() -> Self {
        Self::new()
    }
}

pub struct DelayedGoal {
    active: i32,
    pending: Option<(u64, i32)>,
}

impl DelayedGoal {
    pub fn new(value: i32) -> Self {
        Self {
            active: value,
            pending: None,
        }
    }

    pub fn write(&mut self, value: i32, effective_at_us: u64) {
        self.pending = Some((effective_at_us, value));
    }

    pub fn set_now(&mut self, value: i32) {
        self.active = value;
        self.pending = None;
    }

    pub fn value_at(&mut self, now_us: u64) -> i32 {
        if let Some((at, value)) = self.pending {
            if now_us >= at {
                self.active = value;
                self.pending = None;
            }
        }

        self.active
    }
}

pub struct SustainTimer {
    elapsed_s: f64,
}

impl SustainTimer {
    pub fn new() -> Self {
        Self { elapsed_s: 0.0 }
    }

    pub fn update(&mut self, active: bool, dt_s: f64) -> f64 {
        self.elapsed_s = if active { self.elapsed_s + dt_s } else { 0.0 };

        self.elapsed_s
    }

    pub fn reset(&mut self) {
        self.elapsed_s = 0.0;
    }
}

impl Default for SustainTimer {
    fn default() -> Self {
        Self::new()
    }
}

pub fn counts_to_rad(counts: f64) -> f64 {
    counts * std::f64::consts::TAU / 4096.0
}

pub fn rad_to_counts(rad: f64) -> f64 {
    rad * 4096.0 / std::f64::consts::TAU
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoother_starts_at_present_and_is_rate_limited() {
        let mut smoother = TargetSmoother::new();

        assert_eq!(smoother.next(10.0, 1.0, 0.5), 1.5);
        assert_eq!(smoother.next(10.0, 5.0, 0.5), 2.0);
        smoother.reset();
        assert_eq!(smoother.next(10.0, 5.0, 0.5), 5.5);
    }

    #[test]
    fn delayed_goal_takes_effect_only_once_due() {
        let mut goal = DelayedGoal::new(100);

        goal.write(200, 50);
        assert_eq!(goal.value_at(49), 100);
        assert_eq!(goal.value_at(50), 200);
    }

    #[test]
    fn sustain_timer_resets_when_condition_clears() {
        let mut timer = SustainTimer::new();

        assert_eq!(timer.update(true, 1.0), 1.0);
        assert_eq!(timer.update(true, 1.0), 2.0);
        assert_eq!(timer.update(false, 1.0), 0.0);
    }
}
