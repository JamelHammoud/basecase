pub const NAMES: [&str; 6] = [
    "reward per step",
    "falls per step",
    "forward speed",
    "upright",
    "joint speed",
    "action size",
];

#[derive(Clone, Copy, Debug)]
pub struct Statistic {
    pub name: &'static str,
    pub mean: f64,
    pub error: f64,
}

pub struct Tally {
    nact: usize,
    sums: Vec<[f64; 6]>,
    steps: Vec<f64>,
}

pub struct Step<'a> {
    pub obs: &'a [f32],
    pub action: &'a [f32],
    pub reward: f32,
    pub fell: bool,
}

impl Tally {
    pub fn new(robots: usize, nact: usize) -> Self {
        Self {
            nact,
            sums: vec![[0.0; 6]; robots],
            steps: vec![0.0; robots],
        }
    }

    pub fn add(&mut self, robot: usize, step: &Step) {
        let n = self.nact;
        let obs = step.obs;
        let mean_abs = |values: &[f32]| values.iter().map(|v| f64::from(v.abs())).sum::<f64>() / n.max(1) as f64;
        let values = [
            f64::from(step.reward),
            f64::from(u8::from(step.fell)),
            -f64::from(obs[7]),
            -f64::from(obs[2]),
            mean_abs(&obs[12 + n..12 + 2 * n]),
            mean_abs(step.action),
        ];

        self.sums[robot].iter_mut().zip(values).for_each(|(s, v)| *s += v);
        self.steps[robot] += 1.0;
    }

    pub fn summary(&self) -> Vec<Statistic> {
        let robots = self.sums.len() as f64;

        NAMES
            .iter()
            .enumerate()
            .map(|(k, name)| {
                let means: Vec<f64> = self
                    .sums
                    .iter()
                    .zip(&self.steps)
                    .map(|(s, n)| s[k] / n.max(1.0))
                    .collect();
                let mean = means.iter().sum::<f64>() / robots;
                let var = means.iter().map(|m| (m - mean).powi(2)).sum::<f64>() / (robots - 1.0).max(1.0);

                Statistic {
                    name,
                    mean,
                    error: (var / robots).sqrt(),
                }
            })
            .collect()
    }
}
