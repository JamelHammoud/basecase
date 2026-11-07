# Forge

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 8g. Forge

Forge is Basecase's native trainer and batched physics, in `forge/`. It replaces Python for training, so nobody needs a terminal, uv or PyTorch to teach a robot.

- **C MuJoCo stays the compiler and oracle.** Forge links stock `libmujoco` to compile the generated MJCF and to check its own results. We never fork MuJoCo's C code. Forge's own engine is a reimplementation of MuJoCo's formulation for the subset Basecase generates.
- **Same events as the Python trainer.** Forge prints the same JSON lines on stdout, so `electron/trainer.mjs` barely changes.
- **Anything outside the subset routes to C MuJoCo, never silently.** The feature matrix refuses what it can't simulate exactly.
- **Speed claims use one number:** time-to-skill from `verify/`, not steps per second.

### Crates

| Crate | What it is |
|---|---|
| `forge-mujoco` | Our minimal FFI to stock `libmujoco`: `Model`, `Data` and the `mjb_*` batch API (`Batch`). A small C shim (`src/shim.c`) reads struct fields, so Rust never mirrors MuJoCo's struct layouts |
| `forge-train` | The `forge-train` binary: PPO (default), FastSAC and FlashSAC on C MuJoCo batch, the drop-in for `electron/trainer/train.py` |
| `forge-id` | System identification: finite-difference Gauss-Newton (Levenberg-Marquardt) on C MuJoCo batch |
| `forge-reward` | RewardLang parser and CPU interpreter, plus `handwritten::{stand, walk}`, the rewards `train.py` uses |

### Building

- `cargo build --release --manifest-path forge/Cargo.toml` from the repo root; `npm run check` never runs cargo, so it stays seconds-fast. The gates run `cargo test --release`.
- **MuJoCo comes from DeepMind's release.** `forge-mujoco/build/` downloads the pinned release (3.17.0, the same version as the Python env and `@mujoco/mujoco`) into the gitignored `forge/vendor/` on first build: the macOS `.dmg` framework, the Windows `.zip` or the Linux `.tar.gz`, with `curl`, `hdiutil` and `tar` (all built into macOS and Windows 10+). `FORGE_MUJOCO_DIR` points at an unpacked copy instead, for offline builds or a shared copy between worktrees. `FORGE_CHECK_ONLY=1` skips the download and the C shim, for `cargo check --target` on another OS.
- **Every crate that links MuJoCo carries a two-line `build.rs`** that adds the vendored folder to the binary's rpath (`DEP_MUJOCO_LIB_DIR`); on Windows `forge-train`'s copies `mujoco.dll` beside the binary. Packaging will ship `mujoco.framework` beside `forge-train` (`@executable_path` is already on the rpath).
- **Rust style matches §0 in spirit:** no comments, files under 400 lines, functions under about 120, `cargo fmt` (`forge/rustfmt.toml`, 120 columns) and `cargo clippy --all-targets -- -D warnings` clean.
- Benches: `cargo run --release -p forge-mujoco --example physics_bench -- <model.xml>` (batch stepping by thread count) and `cargo run --release -p forge-train --example learner_bench` (one PPO minibatch, per layer; add any argument for the portable kernels).

### forge-train

- **CLI:** `forge-train --job <dir>` reads `<dir>/model.xml` and `<dir>/job.json` with the same fields as `train.py` (`task`, `minutes`, `command`, `root`, `joints`, `defaultPose`, `ctrlDefault`, `initialJoints`, `rootOffset`, `actionScale`, `controlDt`, and optional `seed`, `maxIterations`, `gateEvery`, `evalSeeds`, `gateSpeed`, `envs`; `threads` caps the physics threads; `algo` is `ppo` (the default), `fastsac` or `flashsac`). `forge-train --check` prints the MuJoCo version and CPU count. `forge-train --adam-vector <file>` writes the learner's Adam test vector (below).
- **Events:** the same `status`, `progress` (with `phases`: physics, observe, reward, inference, gradient), `gate` and one `done` (`policy`, `steps`, `stopped`, `eval`, `gate`). The budget counts active time only (a gap over 30 s between iterations counts as 30 s). It stops on SIGTERM or SIGINT, or on a `stop` file in the job folder (Windows has no signals), then still saves and evaluates; `stopped` is true for either.
- **Outputs:** `policy.json` in the `src/sim/policy.ts` format (weights rounded to 7 decimals like `train.py`), `policy.onnx` written by our own protobuf encoder (`src/onnx.rs`: input `obs`, output `action`, the normalizer baked in, opset 17), and `policy-check.json` with 16 raw observations and the clipped mean actions, which `verify/` replays through the app's `act()` and ONNX.
- **Same environment as `train.py`:** observation, action, reward (`forge_reward::handwritten`), termination, resets, shoves and domain randomization match it line for line. A clean run with the same actions gives bit-identical observations and rewards to `train.py`'s `Envs`. Random streams differ (per-environment xoshiro streams), so runs are comparable, not identical; a seed replays exactly.
- **Same PPO:** orthogonal init, ELU 256-128-64 actor and critic, `log_std` starting at −0.7, GAE (γ 0.99, λ 0.95), clipped surrogate (0.2), value loss 0.5, entropy 0.004, 5 epochs × 4 minibatches of a 24-step rollout, gradient norm clipped to 1, Adam with the rsl_rl adaptive learning rate (KL target 0.01). Gradients are hand-derived (`mlp.rs`, `heads.rs`) and checked against finite differences in tests.
- **Physics is MuJoCo's own batch API** (`mjb_makeBatch` with one `mjData` per thread, not per robot), with friction, link masses and servo gains expanded per robot (`mjb_expand`). Each robot's state row keeps its warm-start, and results are bit-identical at any thread count. This answers the memory-contention finding (32 concurrent 0.9 MB `mjData` cost 3× their work): there are only as many `mjData` as threads, so `<size memory>` doesn't need trimming.
- **The learner:** on macOS, matrix products go to Accelerate's `cblas_sgemm`, which runs on the M-series matrix unit and measured 20× a NEON core (640 vs 30 GMAC/s on the 384 × 256 × 128 layer); the actor and critic run on two threads at once. Elsewhere `kernels/rows.rs` is portable, cache-friendly row kernels (FMA on aarch64, AVX2 + FMA detected at runtime on x86-64) split across a spin-then-park thread pool (`pool.rs`). `FORGE_PORTABLE_MATH=1` forces the portable path on a Mac. ELU uses a vectorizable polynomial `exp`; exported actions use the exact `expm1`.
- **Measured on the M5 Pro** (quad-servo, 64 robots, 60 iterations, `train.py` was about 21–25K steps/s): 84K steps/s on a quiet machine, 44–48K under heavy load from other sessions (the F1 gate measured 43.7K at a load average of 23). The portable learner, forced on a Mac, ran at 24–26K under that load. Per iteration: physics about 10 ms, gradient about 7 ms, inference about 1.3 ms.
- **Delayed servos start primed.** Catalog servos carry MuJoCo's native actuator `delay` (§8d); an empty control history makes every reset kick the robot. `settle()` fills each delayed actuator's history with `ctrlDefault` (`Data::hold_delayed_controls`, `mj_initCtrlHistory` with `nsample` samples one timestep apart ending now) once before the settling second and again after the clock is reset to 0, as `train.py`'s `hold_delayed_controls` does. Batch rows hold `mjSTATE_INTEGRATION`, which includes the history, so every episode reset restores it. `forge-id` primes its start row with the experiment's first control. `tests/delayed_servo.rs` checks that a robot reset from the start row moves exactly like one without delay, and that an unprimed history would kick it.
- **Gate checks run beside training.** When `gateEvery` is due, the policy and normalizer are copied and checked on 32 clean robots on a scoped thread with at most 6 physics threads, while training goes on. The `gate` event carries the iteration and steps of the copy it checked, so time-to-skill reads the `progress` line of that moment; training stops once a passing result comes back. `train.py` checks in line, so its gate time counts against it.
- **Physics threads tune themselves** (`threads.rs`) unless `threads` is set: every 240 control steps one trial of 24 steps runs on a neighbouring thread count (all cores, ¾, ½, ⅓, ¼), and the count moves when the trial is 3% faster. `Batch::rethread` rebuilds the MuJoCo batch with the state rows and per-robot model fields, so a run is identical at any thread count (tested). On a loaded machine fewer threads win by 2× (quad-servo, 64 robots, load 47: 1.9 ms per control step on 10 threads, 4.1 ms on 18).
- **The policy view** (`deployed.rs`): export, ONNX, gates and the final checks take a `Deployed` actor (an ELU MLP, its weights and a `squash`), so every learner exports the same `policy.json`. Off-policy actors are tanh-squashed: `policy.json` then carries `"squash": "tanh"`, which the app's `act()` applies before clipping, and the ONNX graph gains a `Tanh` node.
- **Platform code is isolated** in `platform.rs` (signals, macOS thread QoS), `kernels/accelerate.rs` and the MuJoCo fetch.

### forge-id

- `identify(model, specs, data, options)` fits `ParamSpec`s (armature, damping, frictionloss per DOF, position-servo stiffness per actuator, body mass) to recorded joint positions. Parameters move in log space within `[low, high]`; each iteration runs the nominal and ± steps of every parameter as one MuJoCo batch with per-simulation model fields and `mj_setConst`.
- **It flags what it can't identify.** The relative standard deviation of each parameter comes from the Gauss-Newton normal matrix (residuals scaled by the sensor noise, inflated when the fit is worse than the noise). Above `max_relative_std` (2%), or tied to a null direction, the parameter is flagged and keeps its preset value; it is never reported as measured.
- The test plants servo parameters 15–25% off on a hoisted two-joint arm, records 12 s of multisine excitation through a 4096-count encoder, and recovers all eight within 1.3%. An idle joint's damping and armature are flagged.

### forge-reward and RewardLang

- **RewardLang is a Python subset that is parsed, never executed.** A program is `def` functions only; `reward(state)` is the entry and returns a number. Statements are assignments to plain names and one final `return`.
- **Pure and bounded:** the state is read-only (`state.gravity`, `angvel`, `linvel`, `command`, `z`, `z0`, `control_dt`, `joint_pos`, `joint_vel`, `action`, `last_action`, `bodies` with `pos`, `vel`, `z`); the only iteration is `sum`/`mean`/`min`/`max` over `state.bodies`; a function may call only functions defined above it, so there is no recursion. Imports, loops, `if` blocks, lambdas, lists, `__` names and unknown names are refused with a line number.
- **Total operators:** `/` only by a nonzero number or a provably positive value (`max(x, 0.05)`, `exp(...)`), otherwise `safe_div(a, b)` (0 when `b` is 0); powers are whole numbers 0–8; `exp` caps its argument at 80, `log` and `sqrt` clamp at their domain. Also `abs`, `tanh`, `sin`, `cos`, `square`, `min`, `max`, `clamp`, `dot`, `norm`, conditionals (`a if c else b`), `and`, `or`, `not`.
- **Per-term logs:** `term("name", x)` records each term. A term that comes out NaN or infinite is set to 0 and blamed by name, so one broken term never poisons the total.
- `forge_reward::programs::{stand, walk}` are `train.py`'s rewards in RewardLang; tests check them against the hand-written ones on 500 states, including falls.

### Canaries in cargo tests

A canary test (`canary_*`) runs a planted fault through the same check as the real test and must fail. It does its work only when its full name is the test filter, so plain `cargo test` passes and `cargo test -p <crate> canary_<name>` exits non-zero, which is what the gate wants.

### In the app

- `electron/trainer.mjs` runs Forge when it finds `forge-train` (the packaged `Resources/forge/`, or `forge/target/release/` in a checkout), and falls back to `train.py` otherwise. `BASECASE_TRAINER=python` forces Python. With Forge, `status()` reports ready with no `trainer-env`, so nobody installs Python.
- `npm run build:forge` builds the trainer and stages it in the gitignored `forge/dist/` (`tools/forge/stage.mjs`). On macOS it copies `libmujoco.3.17.0.dylib` beside the binary and points the binary at it with `install_name_tool`, because DeepMind's `mujoco.framework` has no root binary and codesign refuses it as a bundle. electron-builder ships `forge/dist/` as `Resources/forge/` and signs both files; Windows ships `forge-train.exe` and `mujoco.dll`, signed through `signExts`. CI builds Forge before packaging (`check.yml`, `release.yml`).
