use crate::algorithm::Algorithm;
use crate::deployed::Deployed;
use crate::events::emit;
use crate::export::{write_policy, Trained};
use crate::gates::Keep;
use crate::normalizer::Normalizer;
use crate::platform::lower_thread_priority;
use crate::robot::Robot;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::thread::{Scope, ScopedJoinHandle};

pub const KEPT: usize = 12;
const FOLDER: &str = "snapshots";

pub fn thin(order: &[usize]) -> Option<usize> {
    if order.len() <= KEPT {
        return None;
    }

    (1..order.len() - 1).min_by_key(|&i| (order[i + 1] - order[i - 1], i))
}

struct Written {
    order: usize,
    iteration: usize,
}

#[derive(Default)]
struct Ledger {
    written: usize,
    kept: Vec<Written>,
}

pub struct Snapshots<'a> {
    folder: PathBuf,
    robot: &'a Robot,
    ledger: Mutex<Ledger>,
}

fn relative(iteration: usize) -> String {
    format!("{FOLDER}/{iteration}.json")
}

impl<'a> Snapshots<'a> {
    pub fn new(folder: &Path, robot: &'a Robot) -> Self {
        Self {
            folder: folder.to_path_buf(),
            robot,
            ledger: Mutex::new(Ledger::default()),
        }
    }

    fn write(&self, policy: &Deployed, norm: &Normalizer, (iteration, steps): (usize, u64)) -> Result<String, String> {
        let file = relative(iteration);
        let dir = self.folder.join(FOLDER);
        let run = Trained {
            job: &self.robot.job,
            mujoco: &self.robot.mujoco,
            policy,
            norm,
        };

        fs::create_dir_all(&dir).map_err(|e| format!("Couldn't make {}: {e}", dir.display()))?;
        write_policy(&self.folder.join(&file), &run, steps)?;

        let mut ledger = self.ledger.lock().map_err(|_| "A snapshot write panicked".to_owned())?;

        ledger.written += 1;

        let order = ledger.written;

        ledger.kept.push(Written { order, iteration });

        let orders: Vec<usize> = ledger.kept.iter().map(|w| w.order).collect();

        if let Some(drop) = thin(&orders) {
            let gone = ledger.kept.remove(drop);
            let _ = fs::remove_file(self.folder.join(relative(gone.iteration)));
        }

        emit(&json!({ "type": "snapshot", "iteration": iteration, "steps": steps, "file": file }));

        Ok(file)
    }
}

impl Keep for Snapshots<'_> {
    fn keep(&self, policy: &Deployed, norm: &Normalizer, at: (usize, u64)) -> Result<String, String> {
        self.write(policy, norm, at)
    }
}

pub struct Timed<'scope> {
    every: Option<f64>,
    next: f64,
    pending: Option<ScopedJoinHandle<'scope, Result<String, String>>>,
}

pub struct Moment {
    pub iteration: usize,
    pub steps: u64,
    pub elapsed: f64,
    pub gate_starts: bool,
}

impl<'scope> Timed<'scope> {
    pub fn new(every: Option<f64>) -> Self {
        Self {
            every,
            next: every.unwrap_or(f64::INFINITY),
            pending: None,
        }
    }

    fn collect(&mut self, wait: bool) -> Result<(), String> {
        let Some(handle) = self.pending.take_if(|h| wait || h.is_finished()) else {
            return Ok(());
        };

        handle
            .join()
            .map_err(|_| "A snapshot write panicked".to_owned())?
            .map(drop)
    }

    pub fn tick<'env>(
        &mut self,
        scope: &'scope Scope<'scope, 'env>,
        snapshots: &'env Snapshots<'env>,
        algo: &dyn Algorithm,
        now: Moment,
    ) -> Result<(), String> {
        self.collect(false)?;

        let Some(every) = self
            .every
            .filter(|_| now.elapsed >= self.next && self.pending.is_none())
        else {
            return Ok(());
        };

        self.next = (now.elapsed / every).floor() * every + every;

        if now.gate_starts {
            return Ok(());
        }

        let policy = algo.deployed().as_exported();
        let norm = algo.norm().clone();

        self.pending = Some(scope.spawn(move || {
            lower_thread_priority();
            snapshots.write(&policy, &norm, (now.iteration, now.steps))
        }));

        Ok(())
    }

    pub fn finish(mut self) -> Result<(), String> {
        self.collect(true)
    }
}

#[cfg(test)]
mod tests {
    use super::{thin, KEPT};

    fn keep_after(writes: usize) -> Vec<usize> {
        let mut kept = Vec::new();

        for order in 1..=writes {
            kept.push(order);

            if let Some(drop) = thin(&kept) {
                kept.remove(drop);
            }
        }

        kept
    }

    #[test]
    fn keeps_every_snapshot_up_to_twelve() {
        assert_eq!(keep_after(12), (1..=12).collect::<Vec<_>>());
    }

    #[test]
    fn the_thirteenth_drops_the_earliest_interior_tie() {
        assert_eq!(thin(&(1..=13).collect::<Vec<_>>()), Some(1));
        assert_eq!(keep_after(14), vec![1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    }

    #[test]
    fn forty_writes_keep_twelve_with_the_first_and_newest() {
        let kept = keep_after(40);

        assert_eq!(kept.len(), KEPT);
        assert_eq!(kept.first(), Some(&1));
        assert_eq!(kept.last(), Some(&40));
        assert_eq!(kept, vec![1, 5, 9, 13, 17, 21, 24, 27, 30, 33, 36, 40]);
    }

    #[test]
    fn never_drops_the_first_or_newest() {
        for writes in 13..200 {
            let kept = keep_after(writes);

            assert_eq!((kept.len(), kept[0], kept[KEPT - 1]), (KEPT, 1, writes));
        }
    }
}
