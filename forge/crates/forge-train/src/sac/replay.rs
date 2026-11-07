use crate::rng::Rng;

pub struct Replay {
    capacity: usize,
    nobs: usize,
    nact: usize,
    len: usize,
    next_slot: usize,
    obs: Vec<f32>,
    next_obs: Vec<f32>,
    actions: Vec<f32>,
    rewards: Vec<f32>,
    alive: Vec<f32>,
}

pub struct Transitions<'a> {
    pub obs: &'a [f32],
    pub next_obs: &'a [f32],
    pub actions: &'a [f32],
    pub rewards: &'a [f32],
    pub alive: &'a [f32],
}

pub struct Sample {
    pub obs: Vec<f32>,
    pub next_obs: Vec<f32>,
    pub actions: Vec<f32>,
    pub rewards: Vec<f32>,
    pub alive: Vec<f32>,
}

impl Sample {
    pub fn new(rows: usize, nobs: usize, nact: usize) -> Self {
        Self {
            obs: vec![0.0; rows * nobs],
            next_obs: vec![0.0; rows * nobs],
            actions: vec![0.0; rows * nact],
            rewards: vec![0.0; rows],
            alive: vec![0.0; rows],
        }
    }
}

impl Replay {
    pub fn new(capacity: usize, nobs: usize, nact: usize) -> Self {
        Self {
            capacity,
            nobs,
            nact,
            len: 0,
            next_slot: 0,
            obs: vec![0.0; capacity * nobs],
            next_obs: vec![0.0; capacity * nobs],
            actions: vec![0.0; capacity * nact],
            rewards: vec![0.0; capacity],
            alive: vec![0.0; capacity],
        }
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn push(&mut self, batch: Transitions) {
        let (nobs, nact) = (self.nobs, self.nact);

        for row in 0..batch.rewards.len() {
            let slot = self.next_slot;

            self.obs[slot * nobs..(slot + 1) * nobs].copy_from_slice(&batch.obs[row * nobs..(row + 1) * nobs]);
            self.next_obs[slot * nobs..(slot + 1) * nobs]
                .copy_from_slice(&batch.next_obs[row * nobs..(row + 1) * nobs]);
            self.actions[slot * nact..(slot + 1) * nact].copy_from_slice(&batch.actions[row * nact..(row + 1) * nact]);
            self.rewards[slot] = batch.rewards[row];
            self.alive[slot] = batch.alive[row];
            self.next_slot = (slot + 1) % self.capacity;
            self.len = (self.len + 1).min(self.capacity);
        }
    }

    pub fn sample(&self, rng: &mut Rng, out: &mut Sample) {
        let (nobs, nact) = (self.nobs, self.nact);

        for row in 0..out.rewards.len() {
            let slot = rng.below(self.len);

            out.obs[row * nobs..(row + 1) * nobs].copy_from_slice(&self.obs[slot * nobs..(slot + 1) * nobs]);
            out.next_obs[row * nobs..(row + 1) * nobs].copy_from_slice(&self.next_obs[slot * nobs..(slot + 1) * nobs]);
            out.actions[row * nact..(row + 1) * nact].copy_from_slice(&self.actions[slot * nact..(slot + 1) * nact]);
            out.rewards[row] = self.rewards[slot];
            out.alive[row] = self.alive[slot];
        }
    }
}
