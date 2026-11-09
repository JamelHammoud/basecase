use crate::options::{CommandRanges, TaskOptions};
use crate::rng::Rng;

pub struct Conditions {
    pub commands: Vec<[f64; 3]>,
    fixed: [f64; 3],
    ranges: Option<CommandRanges>,
    resample_at: Vec<i64>,
    delays: Vec<usize>,
    depth: usize,
    history: Vec<f64>,
    encoder: Vec<f64>,
    imu: Vec<[f64; 2]>,
    nact: usize,
    control_dt: f64,
    delay_range: [usize; 2],
    ramp: Option<f64>,
    ceiling: f64,
    encoder_bias: f64,
    imu_bias: f64,
}

pub fn delay_ceiling(range: [usize; 2], ramp: Option<f64>, progress: f64) -> f64 {
    let [low, high] = range.map(|d| d as f64);
    let share = ramp.map_or(1.0, |r| (progress / r).clamp(0.0, 1.0));

    low + (high - low) * share
}

pub struct Setup<'a> {
    pub options: &'a TaskOptions,
    pub command: [f64; 3],
    pub count: usize,
    pub nact: usize,
    pub control_dt: f64,
    pub randomized: bool,
}

fn rotate(g: [f64; 3], [roll, pitch]: [f64; 2]) -> [f64; 3] {
    let (sr, cr) = roll.sin_cos();
    let (sp, cp) = pitch.sin_cos();
    let rolled = [g[0], cr * g[1] - sr * g[2], sr * g[1] + cr * g[2]];

    [
        cp * rolled[0] + sp * rolled[2],
        rolled[1],
        -sp * rolled[0] + cp * rolled[2],
    ]
}

impl Conditions {
    pub fn new(setup: Setup) -> Self {
        let Setup {
            options,
            command,
            count,
            nact,
            control_dt,
            randomized,
        } = setup;
        let delay_range = if randomized { options.delay_steps } else { [0, 0] };
        let depth = delay_range[1] + 1;

        Self {
            commands: vec![command; count],
            fixed: command,
            ranges: options.commands.clone().filter(|_| randomized),
            resample_at: vec![i64::MAX; count],
            delays: vec![0; count],
            depth,
            history: vec![0.0; count * depth * nact],
            encoder: vec![0.0; count * nact],
            imu: vec![[0.0; 2]; count],
            nact,
            control_dt,
            delay_range,
            ramp: options.delay_ramp.filter(|_| randomized),
            ceiling: delay_range[1] as f64,
            encoder_bias: if randomized { options.encoder_bias } else { 0.0 },
            imu_bias: if randomized { options.imu_bias } else { 0.0 },
        }
    }

    fn draw_command(&mut self, sim: usize, rng: &mut Rng, steps_taken: i64) {
        let Some(ranges) = &self.ranges else {
            return;
        };
        let still = ranges.still_share > 0.0 && rng.unit() < ranges.still_share;
        let gap = rng.uniform(ranges.resample_s[0], ranges.resample_s[1]) / self.control_dt;

        self.commands[sim] = if still {
            [0.0; 3]
        } else {
            ranges.ranges.map(|[low, high]| rng.uniform(low, high))
        };
        self.resample_at[sim] = steps_taken + gap.max(1.0) as i64;
    }

    pub fn reset(&mut self, sim: usize, rng: &mut Rng) {
        self.commands[sim] = self.fixed;
        self.draw_command(sim, rng, 0);

        if self.delay_range[1] > 0 {
            self.delays[sim] = self.draw_delay(rng);
        }

        if self.encoder_bias > 0.0 {
            let bias = self.encoder_bias;

            self.encoder[sim * self.nact..(sim + 1) * self.nact]
                .iter_mut()
                .for_each(|b| *b = rng.uniform(-bias, bias));
        }

        if self.imu_bias > 0.0 {
            self.imu[sim] = [
                rng.uniform(-self.imu_bias, self.imu_bias),
                rng.uniform(-self.imu_bias, self.imu_bias),
            ];
        }

        let width = self.depth * self.nact;

        self.history[sim * width..(sim + 1) * width].fill(0.0);
    }

    fn draw_delay(&self, rng: &mut Rng) -> usize {
        let [low, high] = self.delay_range;

        if self.ramp.is_none() {
            return rng.range(low as i64, high as i64 + 1) as usize;
        }

        let reach = ((self.ceiling - low as f64 + 1.0) * rng.unit()) as usize;

        low + reach.min(high - low)
    }

    pub fn follow_progress(&mut self, progress: f64) {
        if self.ramp.is_some() {
            self.ceiling = delay_ceiling(self.delay_range, self.ramp, progress);
        }
    }

    pub fn tick(&mut self, sim: usize, rng: &mut Rng, steps_taken: i64) {
        if steps_taken >= self.resample_at[sim] {
            self.draw_command(sim, rng, steps_taken);
        }
    }

    pub fn delayed(&mut self, sim: usize, action: &[f64], out: &mut [f64]) {
        let n = self.nact;
        let width = self.depth * n;
        let ring = &mut self.history[sim * width..(sim + 1) * width];

        ring.copy_within(0..width - n, n);
        ring[..n].copy_from_slice(action);

        let late = self.delays[sim];

        out.copy_from_slice(&ring[late * n..(late + 1) * n]);
    }

    pub fn gravity(&self, sim: usize, g: [f64; 3]) -> [f64; 3] {
        if self.imu_bias > 0.0 {
            rotate(g, self.imu[sim])
        } else {
            g
        }
    }

    pub fn joint_bias(&self, sim: usize, joint: usize) -> f64 {
        self.encoder[sim * self.nact + joint]
    }
}

#[cfg(test)]
mod tests {
    use super::{rotate, Conditions, Setup};
    use crate::options::TaskOptions;
    use crate::rng::Rng;

    fn delayed_by(steps: usize) -> Conditions {
        let options = TaskOptions {
            delay_steps: [steps, steps],
            ..TaskOptions::default()
        };

        Conditions::new(Setup {
            options: &options,
            command: [0.0; 3],
            count: 1,
            nact: 1,
            control_dt: 0.02,
            randomized: true,
        })
    }

    #[test]
    fn a_delay_replays_older_actions() {
        let mut conditions = delayed_by(2);
        let mut rng = Rng::new(1, 0);
        let mut out = [0.0];

        conditions.reset(0, &mut rng);

        let seen: Vec<f64> = (1..=4)
            .map(|k| {
                conditions.delayed(0, &[k as f64], &mut out);

                out[0]
            })
            .collect();

        assert_eq!(seen, vec![0.0, 0.0, 1.0, 2.0]);
    }

    fn ramped(progress: f64) -> Vec<usize> {
        let options = TaskOptions {
            delay_steps: [0, 2],
            delay_ramp: Some(0.5),
            ..TaskOptions::default()
        };
        let mut conditions = Conditions::new(Setup {
            options: &options,
            command: [0.0; 3],
            count: 1,
            nact: 1,
            control_dt: 0.02,
            randomized: true,
        });
        let mut rng = Rng::new(3, 0);
        let mut seen = vec![0; 3];

        conditions.follow_progress(progress);

        for _ in 0..3000 {
            conditions.reset(0, &mut rng);
            seen[conditions.delays[0]] += 1;
        }

        seen
    }

    #[test]
    fn a_ramped_delay_widens_with_progress_and_then_holds() {
        assert_eq!(ramped(0.0), vec![3000, 0, 0]);
        assert!(ramped(0.25)[2] == 0 && ramped(0.25)[1] > 1000);
        assert!(ramped(0.5).iter().all(|n| (900..1100).contains(n)));
        assert_eq!(ramped(0.9), ramped(0.5));
        assert_eq!(super::delay_ceiling([0, 2], Some(0.5), 0.25), 1.0);
        assert_eq!(super::delay_ceiling([1, 2], None, 0.0), 2.0);
    }

    #[test]
    fn no_delay_passes_actions_through() {
        let mut conditions = delayed_by(0);
        let mut out = [0.0];

        conditions.delayed(0, &[0.7], &mut out);

        assert_eq!(out, [0.7]);
    }

    #[test]
    fn a_small_mount_bias_tilts_gravity_slightly() {
        let g = rotate([0.0, 0.0, -1.0], [0.05, 0.0]);

        assert!((g[1] - 0.05f64.sin()).abs() < 1e-12 && (g[2] + 0.05f64.cos()).abs() < 1e-12);
    }
}
