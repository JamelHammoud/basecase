const RECENT_EPISODES: usize = 200;

pub struct Episodes {
    control_dt: f64,
    length: Vec<f64>,
    recent: Vec<f64>,
}

impl Episodes {
    pub fn new(count: usize, control_dt: f64) -> Self {
        Self {
            control_dt,
            length: vec![0.0; count],
            recent: Vec::new(),
        }
    }

    pub fn track(&mut self, fell: &[bool], timeout: &[bool]) {
        for (sim, length) in self.length.iter_mut().enumerate() {
            *length += 1.0;

            if fell[sim] || timeout[sim] {
                self.recent.push(*length * self.control_dt);
                *length = 0.0;
            }
        }
    }

    pub fn trim(&mut self) {
        let extra = self.recent.len().saturating_sub(RECENT_EPISODES);

        self.recent.drain(..extra);
    }

    pub fn mean_seconds(&self) -> f64 {
        if self.recent.is_empty() {
            return 0.0;
        }

        self.recent.iter().sum::<f64>() / self.recent.len() as f64
    }
}
