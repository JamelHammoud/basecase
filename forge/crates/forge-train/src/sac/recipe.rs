use crate::sac::critic::{Mix, Support};

#[derive(Clone, Debug)]
pub struct Recipe {
    pub actor_hidden: Vec<usize>,
    pub critic_hidden: Vec<usize>,
    pub support: Support,
    pub mix: Mix,
    pub project_weights: bool,
    pub scale_rewards: bool,
    pub repeat_noise: bool,
    pub gamma: f32,
    pub tau: f32,
    pub batch: usize,
    pub updates: usize,
    pub horizon: usize,
    pub actor_every: usize,
    pub learn_rate: f32,
    pub learn_rate_end: f32,
    pub decay_updates: usize,
    pub beta2: f32,
    pub weight_decay: f32,
    pub grad_clip: f64,
    pub alpha_init: f32,
    pub alpha_learn_rate: f32,
    pub log_std_init: f32,
    pub target_entropy_per_action: f32,
    pub log_std_range: (f32, f32),
    pub replay_capacity: usize,
    pub learning_starts: usize,
}

const FLASH_STD_TARGET: f32 = 0.15;

fn gaussian_entropy(std: f32) -> f32 {
    0.5 * (2.0 * std::f32::consts::PI * std::f32::consts::E * std * std).ln()
}

impl Recipe {
    pub fn fast() -> Self {
        Self {
            actor_hidden: vec![256, 128, 64],
            critic_hidden: vec![256, 256],
            support: Support {
                low: -5.0,
                high: 20.0,
                atoms: 101,
            },
            mix: Mix::Average,
            project_weights: false,
            scale_rewards: false,
            repeat_noise: false,
            gamma: 0.97,
            tau: 0.1,
            batch: 1024,
            updates: 2,
            horizon: 1,
            actor_every: 1,
            learn_rate: 3e-4,
            learn_rate_end: 3e-4,
            decay_updates: 1,
            beta2: 0.95,
            weight_decay: 1e-3,
            grad_clip: 0.0,
            alpha_init: 1e-3,
            alpha_learn_rate: 3e-3,
            log_std_init: -1.0,
            target_entropy_per_action: 0.0,
            log_std_range: (-5.0, 0.0),
            replay_capacity: 1 << 18,
            learning_starts: 4096,
        }
    }

    pub fn flash() -> Self {
        Self {
            actor_hidden: vec![128, 128],
            critic_hidden: vec![256, 256],
            support: Support {
                low: -5.0,
                high: 5.0,
                atoms: 101,
            },
            mix: Mix::Lower,
            project_weights: true,
            scale_rewards: true,
            repeat_noise: true,
            tau: 0.01,
            actor_every: 2,
            learn_rate_end: 1.5e-4,
            decay_updates: 100_000,
            beta2: 0.999,
            weight_decay: 0.0,
            alpha_init: 1e-2,
            target_entropy_per_action: gaussian_entropy(FLASH_STD_TARGET),
            log_std_range: (-5.0, 2.0),
            ..Self::fast()
        }
    }

    pub fn learn_rate_at(&self, update: usize) -> f32 {
        let progress = (update as f32 / self.decay_updates.max(1) as f32).min(1.0);
        let cosine = 0.5 * (1.0 + (std::f32::consts::PI * progress).cos());

        self.learn_rate_end + (self.learn_rate - self.learn_rate_end) * cosine
    }
}
