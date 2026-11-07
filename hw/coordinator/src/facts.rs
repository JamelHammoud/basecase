use std::sync::atomic::{fence, AtomicI32, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;

pub const NO_SYMBOL: i32 = -1;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Fact {
    pub num: f64,
    pub sym: i32,
    pub stamp_ms: u64,
}

#[derive(Debug, Default)]
struct Mailbox {
    seq: AtomicU32,
    num: AtomicU64,
    sym: AtomicI32,
    stamp: AtomicU64,
}

impl Mailbox {
    fn publish(&self, fact: Fact) {
        let seq = self.seq.load(Ordering::Relaxed);

        self.seq.store(seq.wrapping_add(1), Ordering::Release);
        fence(Ordering::Release);
        self.num.store(fact.num.to_bits(), Ordering::Relaxed);
        self.sym.store(fact.sym, Ordering::Relaxed);
        self.stamp.store(fact.stamp_ms, Ordering::Relaxed);
        self.seq.store(seq.wrapping_add(2), Ordering::Release);
    }

    fn read(&self) -> Option<Fact> {
        let before = self.seq.load(Ordering::Acquire);

        if before == 0 || before % 2 == 1 {
            return None;
        }

        let fact = Fact {
            num: f64::from_bits(self.num.load(Ordering::Relaxed)),
            sym: self.sym.load(Ordering::Relaxed),
            stamp_ms: self.stamp.load(Ordering::Relaxed),
        };

        fence(Ordering::Acquire);

        (self.seq.load(Ordering::Relaxed) == before).then_some(fact)
    }
}

#[derive(Debug)]
pub struct FactBoard {
    boxes: Vec<Mailbox>,
}

impl FactBoard {
    fn new(count: usize) -> Self {
        Self {
            boxes: (0..count).map(|_| Mailbox::default()).collect(),
        }
    }

    pub fn publish(&self, fact: usize, value: Fact) -> bool {
        if !value.num.is_finite() {
            return false;
        }

        match self.boxes.get(fact) {
            Some(mailbox) => {
                mailbox.publish(value);

                true
            }
            None => false,
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct Held {
    num: f64,
    sym: i32,
    stamp_ms: u64,
    has: bool,
    fresh: bool,
    max_age_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FactView {
    pub num: f64,
    pub sym: i32,
    pub fresh: bool,
}

#[derive(Debug)]
pub struct FactStore {
    board: Arc<FactBoard>,
    held: Vec<Held>,
}

impl FactStore {
    pub fn new(max_age_ms: &[u32]) -> Self {
        Self {
            board: Arc::new(FactBoard::new(max_age_ms.len())),
            held: max_age_ms
                .iter()
                .map(|age| Held {
                    max_age_ms: u64::from(*age),
                    sym: NO_SYMBOL,
                    ..Held::default()
                })
                .collect(),
        }
    }

    pub fn board(&self) -> Arc<FactBoard> {
        Arc::clone(&self.board)
    }

    pub fn sync(&mut self) {
        for (held, mailbox) in self.held.iter_mut().zip(&self.board.boxes) {
            let Some(fact) = mailbox.read() else { continue };

            if !held.has || fact.stamp_ms >= held.stamp_ms {
                held.num = fact.num;
                held.sym = fact.sym;
                held.stamp_ms = fact.stamp_ms;
                held.has = true;
            }
        }
    }

    pub fn write(&mut self, index: usize, value: Fact) {
        if let Some(held) = self.held.get_mut(index) {
            held.num = value.num;
            held.sym = value.sym;
            held.stamp_ms = value.stamp_ms;
            held.has = true;
        }
    }

    pub fn clear(&mut self, index: usize) {
        if let Some(held) = self.held.get_mut(index) {
            held.has = false;
            held.fresh = false;
        }
    }

    pub fn view(&self, index: usize, now_ms: u64) -> FactView {
        match self.held.get(index) {
            Some(held) => FactView {
                num: held.num,
                sym: held.sym,
                fresh: is_fresh(held, now_ms),
            },
            None => FactView {
                num: 0.0,
                sym: NO_SYMBOL,
                fresh: false,
            },
        }
    }

    pub fn next_change(&mut self, from: usize, now_ms: u64) -> Option<(usize, bool)> {
        for (i, held) in self.held.iter_mut().enumerate().skip(from) {
            let fresh = is_fresh(held, now_ms);

            if fresh != held.fresh {
                held.fresh = fresh;

                return Some((i, fresh));
            }
        }

        None
    }
}

fn is_fresh(held: &Held, now_ms: u64) -> bool {
    held.has && now_ms.saturating_sub(held.stamp_ms) <= held.max_age_ms
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(num: f64, stamp_ms: u64) -> Fact {
        Fact {
            num,
            sym: NO_SYMBOL,
            stamp_ms,
        }
    }

    #[test]
    fn keeps_only_the_latest_value_in_the_mailbox() {
        let mut store = FactStore::new(&[1000]);
        let board = store.board();

        board.publish(0, fact(1.0, 10));
        board.publish(0, fact(2.0, 20));
        store.sync();

        assert_eq!(store.view(0, 20).num, 2.0);
    }

    #[test]
    fn drops_values_older_than_what_it_holds() {
        let mut store = FactStore::new(&[1000]);
        let board = store.board();

        board.publish(0, fact(2.0, 20));
        store.sync();
        board.publish(0, fact(1.0, 10));
        store.sync();

        assert_eq!(store.view(0, 20).num, 2.0);
    }

    #[test]
    fn goes_stale_past_its_age_and_refuses_bad_numbers() {
        let mut store = FactStore::new(&[100]);
        let board = store.board();

        assert!(!board.publish(0, fact(f64::NAN, 0)));
        assert!(!board.publish(9, fact(1.0, 0)));
        assert!(board.publish(0, fact(1.0, 0)));
        store.sync();

        assert!(store.view(0, 100).fresh);
        assert!(!store.view(0, 101).fresh);
    }
}
