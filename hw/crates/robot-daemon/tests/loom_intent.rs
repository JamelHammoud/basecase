#![cfg(loom)]

use loom::sync::Arc;
use loom::thread;
use robot_daemon::intent::IntentSlot;
use robot_daemon::watchdog::{Freshness, Watchdog};

#[test]
fn a_reader_never_sees_a_torn_intent() {
    loom::model(|| {
        let slot: Arc<IntentSlot<2>> = Arc::new(IntentSlot::new());
        let writer = slot.clone();
        let handle = thread::spawn(move || {
            writer.publish(&[1.0, 1.0]);
            writer.publish(&[2.0, 2.0]);
        });
        let mut values = [0.0f32; 2];

        if let Some(snapshot) = slot.read(&mut values) {
            assert_eq!(snapshot.count, 2);
            assert_eq!(values[0], values[1], "torn read: {values:?}");
            assert!(values[0] == f32::from(snapshot.version as u8));
        }

        handle.join().unwrap();
    });
}

#[test]
fn two_writers_never_interleave_inside_one_intent() {
    loom::model(|| {
        let slot: Arc<IntentSlot<2>> = Arc::new(IntentSlot::new());
        let first = slot.clone();
        let second = slot.clone();
        let a = thread::spawn(move || {
            first.publish(&[1.0, 1.0]);
        });
        let b = thread::spawn(move || {
            second.publish(&[2.0, 2.0]);
        });

        a.join().unwrap();
        b.join().unwrap();

        let mut values = [0.0f32; 2];

        if let Some(snapshot) = slot.read(&mut values) {
            assert_eq!(values[0], values[1]);
            assert!(snapshot.version >= 1);
        }
    });
}

#[test]
fn a_reader_never_waits_on_a_stalled_writer() {
    loom::model(|| {
        let slot: Arc<IntentSlot<1>> = Arc::new(IntentSlot::new());
        let writer = slot.clone();
        let handle = thread::spawn(move || {
            writer.publish(&[3.0]);
        });
        let mut values = [0.0f32; 1];
        let mut watchdog = Watchdog::new(100);

        watchdog.arm(0, 0);

        let snapshot = slot.read(&mut values);
        let freshness = watchdog.observe(slot.version(), 50);

        assert_eq!(freshness, Freshness::Fresh);

        if snapshot.is_some() {
            assert_eq!(values[0], 3.0);
        }

        handle.join().unwrap();
    });
}
