use crate::platform::raise_thread_priority;
use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;

const SPIN_ROUNDS: u32 = 4_000;
const NEXT_SHIFT: u32 = 20;
const EPOCH_SHIFT: u32 = 40;
const FIELD_MASK: u64 = (1 << NEXT_SHIFT) - 1;

type TaskPointer = *const (dyn Fn(usize) + Sync);

struct Shared {
    cursor: AtomicU64,
    completed: AtomicUsize,
    shutdown: AtomicBool,
    sleeping: Vec<AtomicBool>,
    task: UnsafeCell<Option<TaskPointer>>,
}

unsafe impl Send for Shared {}
unsafe impl Sync for Shared {}

impl Shared {
    fn claim(&self) -> Option<usize> {
        let mut current = self.cursor.load(Ordering::Acquire);

        loop {
            let next = (current >> NEXT_SHIFT) & FIELD_MASK;

            if next >= current & FIELD_MASK {
                return None;
            }

            let claimed = current + (1 << NEXT_SHIFT);

            match self
                .cursor
                .compare_exchange_weak(current, claimed, Ordering::AcqRel, Ordering::Acquire)
            {
                Ok(_) => return Some(next as usize),
                Err(seen) => current = seen,
            }
        }
    }

    fn work(&self) -> bool {
        let mut worked = false;

        while let Some(index) = self.claim() {
            let task = unsafe { (*self.task.get()).expect("a claimed index has a task") };

            unsafe { (*task)(index) };
            self.completed.fetch_add(1, Ordering::AcqRel);
            worked = true;
        }

        worked
    }

    fn has_work(&self) -> bool {
        let current = self.cursor.load(Ordering::Acquire);

        (current >> NEXT_SHIFT) & FIELD_MASK < current & FIELD_MASK
    }
}

pub struct Pool {
    shared: Arc<Shared>,
    threads: Vec<JoinHandle<()>>,
    running: AtomicBool,
}

fn worker_loop(shared: &Shared, worker: usize) {
    raise_thread_priority();

    let mut idle = 0;

    while !shared.shutdown.load(Ordering::Acquire) {
        if shared.work() {
            idle = 0;

            continue;
        }

        idle += 1;

        if idle < SPIN_ROUNDS {
            std::hint::spin_loop();

            continue;
        }

        shared.sleeping[worker].store(true, Ordering::SeqCst);

        if !shared.has_work() && !shared.shutdown.load(Ordering::Acquire) {
            std::thread::park();
        }

        shared.sleeping[worker].store(false, Ordering::SeqCst);
        idle = 0;
    }
}

impl Pool {
    pub fn new(threads: usize) -> Self {
        let threads = threads.max(1);
        let shared = Arc::new(Shared {
            cursor: AtomicU64::new(0),
            completed: AtomicUsize::new(0),
            shutdown: AtomicBool::new(false),
            sleeping: (0..threads).map(|_| AtomicBool::new(false)).collect(),
            task: UnsafeCell::new(None),
        });
        let spawned = (1..threads)
            .map(|worker| {
                let shared = shared.clone();

                std::thread::spawn(move || worker_loop(&shared, worker))
            })
            .collect();

        Self {
            shared,
            threads: spawned,
            running: AtomicBool::new(false),
        }
    }

    pub fn threads(&self) -> usize {
        self.threads.len() + 1
    }

    fn wake_workers(&self) {
        for (slot, handle) in self.threads.iter().enumerate() {
            if self.shared.sleeping[slot + 1].load(Ordering::SeqCst) {
                handle.thread().unpark();
            }
        }
    }

    pub fn run<F>(&self, count: usize, task: F)
    where
        F: Fn(usize) + Sync,
    {
        if count == 0 {
            return;
        }

        assert!((count as u64) < FIELD_MASK, "Too many tasks for one pool run");

        if count == 1 || self.threads.is_empty() {
            (0..count).for_each(task);

            return;
        }

        assert!(
            !self.running.swap(true, Ordering::AcqRel),
            "A pool runs one batch of tasks at a time"
        );

        let shared = &*self.shared;
        let erased: &(dyn Fn(usize) + Sync) = &task;
        let pointer: TaskPointer = unsafe { std::mem::transmute(erased) };
        let epoch = shared.cursor.load(Ordering::Relaxed) >> EPOCH_SHIFT;

        unsafe { *shared.task.get() = Some(pointer) };
        shared.completed.store(0, Ordering::Release);
        shared
            .cursor
            .store(((epoch + 1) << EPOCH_SHIFT) | count as u64, Ordering::SeqCst);
        self.wake_workers();
        shared.work();

        while shared.completed.load(Ordering::Acquire) < count {
            std::hint::spin_loop();
        }

        self.running.store(false, Ordering::Release);
    }
}

impl Drop for Pool {
    fn drop(&mut self) {
        self.shared.shutdown.store(true, Ordering::SeqCst);

        for handle in self.threads.drain(..) {
            handle.thread().unpark();
            handle.join().expect("a pool worker panicked");
        }
    }
}

#[derive(Clone, Copy)]
pub struct SharedSlice<T> {
    start: *mut T,
    len: usize,
}

unsafe impl<T: Send> Send for SharedSlice<T> {}
unsafe impl<T: Send> Sync for SharedSlice<T> {}

impl<T> SharedSlice<T> {
    pub fn new(items: &mut [T]) -> Self {
        Self {
            start: items.as_mut_ptr(),
            len: items.len(),
        }
    }

    #[allow(clippy::mut_from_ref)]
    pub(crate) unsafe fn range(&self, from: usize, to: usize) -> &mut [T] {
        assert!(from <= to && to <= self.len, "SharedSlice range out of bounds");

        unsafe { std::slice::from_raw_parts_mut(self.start.add(from), to - from) }
    }
}

#[cfg(test)]
mod tests {
    use super::{Pool, SharedSlice};

    #[test]
    fn every_task_runs_once_across_many_runs() {
        let pool = Pool::new(4);
        let mut counts = vec![0u32; 1000];

        for _ in 0..500 {
            let shared = SharedSlice::new(&mut counts);

            pool.run(1000, |i| unsafe { shared.range(i, i + 1)[0] += 1 });
        }

        assert!(counts.iter().all(|c| *c == 500));
    }

    #[test]
    fn workers_wake_after_sleeping() {
        let pool = Pool::new(3);
        let mut counts = vec![0u32; 16];

        for _ in 0..4 {
            std::thread::sleep(std::time::Duration::from_millis(5));

            let shared = SharedSlice::new(&mut counts);

            pool.run(16, |i| unsafe { shared.range(i, i + 1)[0] += 1 });
        }

        assert!(counts.iter().all(|c| *c == 4));
    }
}
