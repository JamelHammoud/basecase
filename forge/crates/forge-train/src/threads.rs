const EXPLORE_EVERY: usize = 240;
const TRIAL_STEPS: usize = 24;
const SETTLE_STEPS: usize = 2;
const MEMORY: f64 = 0.05;
const MARGIN: f64 = 0.97;
const SHARES: [usize; 5] = [12, 9, 6, 4, 3];

#[derive(Clone, Copy, Debug, PartialEq)]
enum Mode {
    Steady,
    Trial { index: usize, seconds: f64, steps: usize },
}

pub struct ThreadTuner {
    candidates: Vec<usize>,
    current: usize,
    steady_seconds: Option<f64>,
    since_trial: usize,
    upward: bool,
    mode: Mode,
}

impl ThreadTuner {
    pub fn new(most: usize) -> Self {
        let mut candidates: Vec<usize> = SHARES.iter().map(|share| (most * share / 12).max(1)).collect();

        candidates.dedup();

        Self {
            candidates,
            current: 0,
            steady_seconds: None,
            since_trial: 0,
            upward: false,
            mode: Mode::Steady,
        }
    }

    pub fn threads(&self) -> usize {
        match self.mode {
            Mode::Steady => self.candidates[self.current],
            Mode::Trial { index, .. } => self.candidates[index],
        }
    }

    fn neighbor(&mut self) -> Option<usize> {
        self.upward = !self.upward;

        let up = self.current.checked_sub(1);
        let down = Some(self.current + 1).filter(|i| *i < self.candidates.len());

        if self.upward {
            up.or(down)
        } else {
            down.or(up)
        }
    }

    fn steady(&mut self, seconds: f64) -> Option<usize> {
        let mean = self.steady_seconds.get_or_insert(seconds);

        *mean += MEMORY * (seconds - *mean);
        self.since_trial += 1;

        if self.since_trial < EXPLORE_EVERY {
            return None;
        }

        self.since_trial = 0;

        let index = self.neighbor()?;

        self.mode = Mode::Trial {
            index,
            seconds: 0.0,
            steps: 0,
        };

        Some(self.candidates[index])
    }

    fn trial(&mut self, index: usize, total: f64, steps: usize) -> Option<usize> {
        if steps < TRIAL_STEPS {
            self.mode = Mode::Trial {
                index,
                seconds: total,
                steps,
            };

            return None;
        }

        let trial_mean = total / (steps - SETTLE_STEPS) as f64;
        let steady = self.steady_seconds.unwrap_or(f64::INFINITY);

        self.mode = Mode::Steady;

        if trial_mean < MARGIN * steady {
            self.current = index;
            self.steady_seconds = Some(trial_mean);

            return None;
        }

        Some(self.candidates[self.current])
    }

    pub fn record(&mut self, seconds: f64) -> Option<usize> {
        match self.mode {
            Mode::Steady => self.steady(seconds),
            Mode::Trial {
                index,
                seconds: total,
                steps,
            } => {
                let counted = if steps >= SETTLE_STEPS { seconds } else { 0.0 };

                self.trial(index, total + counted, steps + 1)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ThreadTuner, EXPLORE_EVERY, TRIAL_STEPS};

    fn drive(tuner: &mut ThreadTuner, cost: impl Fn(usize) -> f64, steps: usize) {
        for _ in 0..steps {
            let seconds = cost(tuner.threads());

            tuner.record(seconds);
        }
    }

    #[test]
    fn settles_on_the_fastest_thread_count() {
        let mut tuner = ThreadTuner::new(18);
        let cost = |threads: usize| (threads as f64 - 9.0).abs() + 1.0;

        drive(&mut tuner, cost, 20 * (EXPLORE_EVERY + TRIAL_STEPS));

        assert_eq!(tuner.threads(), 9);
    }

    #[test]
    fn keeps_every_core_when_more_threads_are_faster() {
        let mut tuner = ThreadTuner::new(18);

        drive(
            &mut tuner,
            |threads| 20.0 / threads as f64,
            20 * (EXPLORE_EVERY + TRIAL_STEPS),
        );

        assert_eq!(tuner.threads(), 18);
    }
}
