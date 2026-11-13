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

The G1's network bus can read its state but can't publish an arm command:

```rust
fn look(bus: &mut robot_daemon::safety::G1Bus) {
    let _ = bus.poll();
}
```

```compile_fail
fn look(bus: &mut robot_daemon::safety::G1Bus) {
    let _ = bus.publish_arm_sdk(&[0x00, 0x01, 0x00, 0x00]);
}
```

A ROS 2 robot's bus reads its joint states but can't publish a command:

```rust
fn look(bus: &mut robot_daemon::safety::Ros2Bus) {
    let _ = bus.poll();
}
```

```compile_fail
fn look(bus: &mut robot_daemon::safety::Ros2Bus) {
    let _ = bus.publish(servo_wire::Topic::PositionCommands, &[0x00, 0x01, 0x00, 0x00]);
}
```

A safety layer, for servos, the G1's arm_sdk or a ROS 2 controller, can only be built with a grant from the ladder:

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

```compile_fail
fn arm(bus: robot_daemon::safety::G1Bus, caps: robot_daemon::caps::Caps) {
    let layer = robot_daemon::safety::ArmSdkLayer::new(bus, Vec::new(), caps, robot_daemon::safety::ArmGrant::issue());
}
```

```compile_fail
fn arm(bus: robot_daemon::safety::Ros2Bus, plan: robot_daemon::safety::Ros2Plan) {
    let layer = robot_daemon::safety::Ros2Layer::new(bus, plan, robot_daemon::safety::ArmGrant::issue());
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
