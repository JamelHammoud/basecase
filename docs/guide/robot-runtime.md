# Robot runtime

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 8k. Robot runtime

The daemon that owns motor writes, the servo emulators and the fault tests, in `hw/` (a Cargo workspace). Nothing here has moved a real motor. Everything is proven against emulated servos, which is a model, not hardware.

- **One write handle.** Only the safety layer can write to a motor.
- **Motors stay locked.** Real serial transport is compiled out of default builds until the Stage 8 session (§0k), because this code has never moved a motor.
- **`hw/emu/ledger.yaml` records where each emulated behaviour came from:** datasheet, client-derived, community or assumed.

### Crates

| Crate | Job |
|---|---|
| `servo-wire` | Feetech SCS/STS and Dynamixel 2.0 framing, checksums, CRC, byte stuffing, the `ByteTransport` seam and the `Clock` (system or virtual) |
| `plant-bam` | Per-joint physics: BAM model M6 friction and the voltage-controlled motor with the published STS3215 7.4 V and XL330 fits, plus supply sag, winding heat, backlash and 4096-count encoders. Hidden per-unit parameters come from a seed |
| `servo-emu` | Byte-level firmware for the STS3215 (model 777) and XL330-M288 (model 1200): register maps, EEPROM and RAM, protections, return delay, status packets, sync read and write, broadcast, ping, the Dynamixel bus watchdog. Library plus the `servo-emu` binary |
| `faultbox` | Seeded fault schedules wrapped around the in-process bus, a wire tap, and an independent decoder of every write on the wire |
| `robot-daemon` | The 50 Hz control loop, safety layer, mode ladder, intent slots, policy worker and the JSON-lines interface. Library plus the `robot-daemon` binary |
| `transport-real` | The only crate that may name `serialport`. Not a default workspace member and not in the default dependency tree |

`npm test` doesn't build `hw/`. The gate (`node verify/gatekeeper.mjs s5-emu-daemon`) runs `cargo test --release`, the SDK conformance script and the fault matrix.

### Motor lock

- Default builds can't open a serial port. `robot-daemon --port <path>` exits with "Real motors are locked in this build" unless it was built with the `unlock-real-motors` feature, which is the only path to `transport-real`.
- The daemon never opens a device path itself. Its only default transport is the in-process emulator (`--emulated`).
- The gate fails if `serialport` appears in `cargo tree -e normal`, or `serialport::` appears in any `.rs` file outside `transport-real`. Turning the feature on is a Stage 8 decision, made by a maintainer with a power cut in reach.

### Control interface

The app spawns `robot-daemon --family feetech|dynamixel --ids 1,2,3 --emulated [--latency-ms 16] [--class arm|legged] [--artefacts <dir>]` and talks JSON lines over stdin and stdout. There's no network port. The artefacts folder holds `calibration.json` and `policy.onnx` (the policy runs only in builds with the `onnx` feature, loaded at start).

In, one object per line:

| `cmd` | Fields | Effect |
|---|---|---|
| `enter` | `mode`: `look`, `set_up`, `test`, `rehearse`, `first_run`, `policy`, `longer_runs` | Climb one rung, or drop to Look. The daemon checks the artefacts itself; the UI can't skip a rung |
| `intent` | `joints`: radians, one per calibrated joint; `null` becomes not-a-number and stops the robot | Latest wins. Also counts as a heartbeat |
| `heartbeat` | | Must arrive at least every 100 ms while motors run |
| `stop` | | Arm: hold. Legged: walk to the stand pose, then hold |
| `fall` | | Lower torque to 10% and hold |
| `release` | | Switch every motor off and return to Look. The only write a stopped robot accepts |
| `clear_fault` | | Only in Look |
| `recheck` | | Re-read the artefacts now |

Out: `{"event":"status",...}` every 100 ms (mode, run state, sealed, fault latched, and per joint id, position, temperature, volts, torque, reply), plus `fault` (with `code` and a plain `message`), `mode`, `stopped`, `completed` and `refused` events. When stdin closes, the robot stops within 100 ms and the daemon exits once nothing moves. If the daemon itself dies, show `daemon_lost_message`: Dynamixel servos stop on their bus watchdog within 100 ms; Feetech servos have none and hold their last goal.

### Runtime tiers and intent slots

- The loop runs every 20 ms. It reads each slot once a tick and never waits on a client. A slot is a seqlock of atomics (`intent.rs`): a writer that stalls mid-write only makes the reader skip that tick.
- A coordinator gets an `IntentWriter`, which can only publish intents and heartbeats. Policy actions use their own slot from `First run` up; Test and Rehearse read the coordinator slot.
- No new intent for 100 ms stops the robot (`intent_stale` or `policy_stale`), and so does no heartbeat for 100 ms (`client_lost`).
- The policy runs on its own thread. A hung or slow policy can't stretch a tick, and a policy that outputs a value that isn't a number stops the robot.

### Safety layer

- `safety::ReadBus` can only ping and read. Write encoding (`safety/encode.rs`) and `ReadBus::send` are private to the safety module. A `SafetyLayer` needs an `ArmGrant`, which only the ladder issues. `compile_fail.md` holds doctests that fail to compile if any of this leaks.
- Every write is a broadcast sync write, so it never gets a reply that could be mistaken for telemetry.
- Goals are integer counts. `guard::next_goal` clamps to the calibrated range, moves at most one step per tick (`min(0.02 rad, speed cap × 20 ms)`), and won't lead the measured position by more than 0.25 rad. Not-a-number never reaches a goal.
- **Soft start:** read positions, write the torque limit at 5%, the goal at the present position, the speed cap, and the Dynamixel bus watchdog (100 ms); then enable torque and ramp it over 1 s. A joint outside its calibrated range refuses to start.
- **Stale replies:** each tick's telemetry read asks for a length that cycles through four values, so a late reply to an earlier request is rejected and counted as late, never used as present. Without this, 40 ms of latency fed 40 ms-old positions to the controller.
- **Seal:** after a stop finishes, the layer is sealed and every write returns `Sealed`. Leaving a sealed layer means dropping it (`release` or Look), and climbing again builds a new one.
- **Hold only what's powered.** Some Feetech firmware switches torque on when a goal is written (the emulator models this), so a hold never writes a goal to a motor that reports torque off.

### Caps (hard-coded in `caps.rs`)

| | Test, Rehearse, First run | Policy | Longer runs |
|---|---|---|---|
| Torque | 30% | 60% | 60% |
| Speed | 0.5 rad/s | 2 rad/s | 2 rad/s |
| Step per tick | 0.02 rad | 0.05 rad | 0.05 rad |
| Run length | 30 s | 5 min | none |

All tiers stop a motor at 50 °C, keep the supply inside 6.0 to 8.4 V (Feetech) or 3.7 to 6.0 V (Dynamixel), and stop on a 100 ms watchdog.

### Mode ladder

Look (read-only bus), Set up (servos checked: each answers with the right model and no ID is shared; motors off), Test (needs calibration and known firmware; earns `tested` after 5 s with every joint moved), Rehearse (needs a policy; motors off, intents run through the guard without writing; earns `rehearsed` after 10 s), First run, Policy, Longer runs.

- Each `enter` re-reads the calibration and policy files, hashes them with the servos' firmware versions, and checks the target's requirements. Evidence is earned only by finishing a stage; it can't be set.
- A calibration, policy or firmware change clears the evidence it invalidates, drops anything above First run back to First run, and holds.
- A fault latches. Nothing climbs until the robot is back in Look and `clear_fault` is sent.
- `hw/spec/ladder.tla` is the TLA+ spec. TLC isn't installed here, so `tests/ladder_model.rs` reads the spec's `Requires`, `Clears`, `Earns`, `Observed` and `Earned` tables, checks the Rust table matches, and walks every reachable state (about 1,300 states and 46,000 transitions) checking the spec's invariants. That search found a real bug: evidence could once be set directly.

### Faults and stops

| Fault | Stop |
|---|---|
| No reply, garbled replies, wrong ID, late replies, duplicate ID, adapter unplugged | Seal at once: no more writes on an unreliable bus |
| Overheat, stall, wrong direction, servo overload flag | Switch that motor off (confirmed by reading it back, up to 5 tries), hold the rest |
| Supply voltage, servo restarted, bus watchdog tripped, joint out of range | Switch every motor off |
| Lost app, stale or not-a-number intents or policy | Arm holds; legged robot stands still |
| Reported fall | Torque down to 10%, hold |

Each fault has a beginner-readable message in `fault.rs`. The twelve gate tests (`fault_*` in `crates/robot-daemon/tests/faults_*.rs`) check the safe state, its time limit, no writes after it, and the message. Comm faults seal in 58 ms (three ticks), and a lost app or policy in about 100 ms.

Known limits: a calibration with the wrong sign moves the joint the wrong way while its encoder agrees, so only a person or a camera can catch it (Stage 8 step 4). Two servos sharing an ID and sitting at exactly the same position answer identically and go unnoticed until they differ. Gravity-loaded joints that sag during the 5% soft start trip `wrong_direction`.

### Emulator

- `servo-emu --family feetech|dynamixel --ids 1,2,3 --pty [--seed N] [--fault bad-checksum|wrong-model|silent|wrong-id|truncated]` prints `{"pty":"/dev/ttysNNN"}` and serves until killed or its parent exits. The PTY is put in raw mode before the path is printed.
- Windows has no PTY: the PTY module is behind `cfg(unix)` and the binary says so. The Windows path is the in-process transport with 16 ms of injected latency (`InProcessBus`, `WINDOWS_LATENCY_US`), which the fault and end-to-end tests cover.
- **macOS PTYs reject 1 Mbaud.** macOS has no `B1000000`, so pyserial sets custom rates with the `IOSSIOSPEED` ioctl, which only real serial drivers accept, so `setBaudRate(1000000)` fails on a PTY. On macOS the gate runs `verify/hw/conformance.py` through `verify/hw/pty_baud.py`, which turns only that ioctl into a no-op on PTYs and leaves the SDKs untouched. On Linux, PTYs accept it and the gate runs the script directly; `sh hw/emu/linux-gate.sh` runs Gatekeeper's `s5-emu-daemon` in a Linux container (Docker), with Linux build output kept in a volume so it never mixes with `hw/target`.
- **Build output and `npm run check`:** Prettier reads only the root `.gitignore`, so `hw/target/` (which the gate builds) needs `hw/target` in the root `.prettierignore`, or `npm run check` fails on cargo's fingerprint JSON.
- **Ledger:** `datasheet` is the maker's manual, `client-derived` is read from client library source (scservo_sdk, DynamixelSDK, rustypot, LeRobot), `community` is published third-party measurement (BAM), and `assumed` was chosen here and is unchecked. Stage 8 step 2 dumps real registers and resolves every `assumed` entry. A new emulated behaviour gets a ledger entry in the same change.

### Proof

- `cargo test --release --manifest-path hw/Cargo.toml` runs unit tests, the emulator firmware tests, the fault matrix, the binary end-to-end test, the ladder model, and `no_unsafe_write`. That last one is a 256-case proptest whose checker decodes every frame on the wire and fails on a goal outside calibration, a jump larger than one step (other than a hold at the measured position), a torque or speed limit above the cap, torque switched on without a soft start, or any write after a seal. It carries two canaries: the checker must see real motion and must catch a planted jump.
- Loom: `RUSTFLAGS="--cfg loom" cargo test --release --manifest-path hw/Cargo.toml -p robot-daemon --test loom_intent --target-dir hw/target/loom`.
- Kani (`cargo install --locked kani-verifier && cargo kani setup`): `cargo kani --manifest-path hw/Cargo.toml -p servo-wire` proves both frame scanners never panic and never consume past their input, and that a single flipped byte never passes the Feetech checksum. `-p robot-daemon` proves the goal guard stays in bounds and moves at most one step, malformed rules never move a goal, torque requests never exceed their cap, and holds stay in bounds.
- Mutation testing: `cargo mutants --dir hw -p robot-daemon -f crates/robot-daemon/src/safety/guard.rs` (repeat `-f` for `layer.rs`, `encode.rs` and `bus.rs`). Every viable mutant in the safety module must be caught; `hw/.cargo/mutants.toml` skips the `cfg(kani)` proofs, which `cargo test` never compiles.
- Tests that mix the virtual clock with real threads (the policy worker) wait for the worker to act, within limits that hold under heavy load, and never assert a tight wall-clock bound. The end-to-end binary test accepts `intent_stale` as well as `client_lost`: a test thread starved past 100 ms stops the robot before the app closes, which is the same safe stop.
- The daemon's write encoder is checked against bytes captured from scservo_sdk and DynamixelSDK. The Python DynamixelSDK 4.1.0 never byte-stuffs what it sends (see the ledger).

### The daemon in the app (interface)

Stage 5b is judged by `s5b-daemon-app` (§0k); its tests in `verify/hw/` are the contract.

- **Bundling:** `npm run build:daemon` stages the release `robot-daemon` (`robot-daemon.exe` on Windows) into `hw/dist/` (build output, not committed); electron-builder copies `hw/dist` to `<resources>/hw`. The packaged app spawns only that file; from source it uses `hw/dist`. `BASECASE_ROBOT_DAEMON=<path>` overrides the binary, for tests.
- **Hello:** the daemon's first stdout line is `{"event":"hello","version","family","emulated":true,"real_transport":false,"lost_message"}`; `lost_message` is `daemon_lost_message(family)`, so the app has the words before it needs them.
- **IPC** (all `handle` channels through `trustedIpc`; preload names in brackets): `robot:connect` (`robotConnect(spec)`) with exactly `{ family: 'feetech' | 'dynamixel', ids: number[] (1–253, at most 32), class: 'arm' | 'legged', emulated: true }` → `{ ok: true }` or `{ ok: false, message }`; anything else (a `port`, `emulated` not true, extra keys, bad ids) is refused in plain words and starts nothing. `robot:command` (`robotCommand(cmd)`) forwards only the documented commands. `robot:disconnect` (`robotDisconnect()`) closes stdin and the daemon exits. Events reach the page on `robot:event`.
- **Spawn:** argv is `--family <f> --ids <ids> --class <c> --emulated --artefacts <dir>`, never `--port`. For an emulated robot the app writes `calibration.json` itself (every id at 2048 counts), so Set up → Test climbs with no hardware steps.
- **Heartbeat:** while motors run, the app sends a heartbeat or an intent at least every 100 ms (median gap 60 ms or less), and the daemon never stops the robot with `client_lost` or `intent_stale` while the app is healthy.
- **Driving:** in Test and above, the live sim's joint targets (a Case try, a Routine run, Drive) stream as `intent` lines at 20 Hz or more, in joint order with ids 1…n over the scene's movable joints; when nothing drives, intents hold still.
- **Operate view** in the rail (`aria-label="Operate"`): Connect Emulated Robot (Feetech by default, `class` legged when a joint's limb is a leg); `[data-testid="robot-mode"]` with `data-mode` from the latest status; one `[data-robot-rung="<mode>"]` control per rung, only the next rung enabled, each sending `enter`; `[data-robot-joint="<id>"]` with `data-position` from the latest status. It reflects whatever connection the main process holds.
- **Messages:** every `fault` and `refused` message appears on screen in the daemon's words, and when the daemon exits without being asked, `lost_message` appears. Raw codes are never the only thing shown.

### Parked

Setup flows (IDs one servo at a time, the torque-off mirror, calibration capture, the plain failure guide, support bundle), signed Mac and Windows bundles, Pi and arm64 builds, rustypot and LeRobot's bus as further conformance clients, bulk read and write, indirect addresses, operating modes other than position, and persisting ladder evidence across restarts (a restart climbs again).
