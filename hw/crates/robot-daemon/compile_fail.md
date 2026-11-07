# robot-daemon

The daemon that owns motor writes. These examples are compiled by `cargo test` and prove, at the type level, that
only the safety layer can write to a motor.

A read-only bus has no way to write:

```rust
fn look(bus: &mut robot_daemon::safety::ReadBus) {
    let _ = bus.ping(1, 1000);
}
```

```compile_fail
fn look(bus: &mut robot_daemon::safety::ReadBus) {
    let _ = bus.send(&[0xFF, 0xFF, 0xFE, 0x04, 0x03, 40, 1, 0xB9]);
}
```

A safety layer can only be built with a grant from the ladder:

```compile_fail
fn arm(bus: robot_daemon::safety::ReadBus) {
    let grant = robot_daemon::safety::ArmGrant::issue();
}
```

```compile_fail
fn arm(bus: robot_daemon::safety::ReadBus) {
    let grant = robot_daemon::safety::ArmGrant { _issued_by_ladder: () };
}
```

A safe goal can only come from the guard, which clamps it:

```rust
let bounds = robot_daemon::safety::CountBounds { min: 0, max: 4095 };
let goal = robot_daemon::safety::hold_at(2048, bounds);
assert!(goal.is_some());
```

```compile_fail
let goal = robot_daemon::safety::SafeGoal(5000);
```

Write encoding is private to the safety layer:

```compile_fail
use robot_daemon::safety::encode;
```
