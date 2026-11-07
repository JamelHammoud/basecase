# Skills

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 8i. Skills

Train any robot to do anything you ask. The pipeline is Intent Compiler, TaskContract, Feasibility Gate, Method Router, Solver Race, Arena, SkillCard. The core lives in `src/skills/` and `forge/crates/contract`; the gate is `s3-contract` (§0k).

- **The contract judges, the reward only teaches.** Reward authors can't edit a contract, so a hacked reward can't fake success.
- **A Skill is bound to what it was proved on:** contract hash, compiled-physics hash, actuator hash, observation and action schema, and Arena evidence.
- **Moving a Skill to another design warm-starts training and never carries "verified".**

### Task contract (`forge/crates/contract`, `src/skills/contract.ts`)

One Rust crate, built native (Forge) and to WASM (the app), so both judge with the same code. `evaluateContract(contract, trace)` resolves to `{ passed, margin, worstAt, failed }` and rejects (throws) on anything it refuses; `contractSignals(contract)` checks a contract without a trace and lists the signals it reads.

- **Shape:** `{ version: 1, success: Formula, failures: [{ label, formula }] }`. Formula: `all`, `any`, `always { window, state }`, `eventually { window, state }`, `hold_for { seconds, state, within }`, `sequence`. State: `all`, `any`, `not`, `atom { expr, cmp, value, scale }`. Expr: `signal`, `abs`, `delta`, `dist [[a,b,c],[d,e,f]]`, `angle [[a,b,c],[d,e,f]]` (each name is a signal). Window: `'whole'`, `{ from, to }` or `{ last }`, in seconds. Every object has exactly its fields; unknown or extra keys are refused.
- **Trace:** `{ dt, signals: { name: number[] } }`, every signal the same length, at least two samples. Sample `i` is at `i × dt`. `null` (what `JSON.stringify` writes for NaN and ±Infinity) reads as NaN.
- **Margins:** an atom is `(x − value) / scale`, negated for `<` and `<=` (strict and non-strict give the same number). `all` and `always` take the minimum, `any` and `eventually` the maximum, `hold_for` the best placement's minimum over the dwell (`ceil(seconds / dt)` samples, sliding minimum), and `sequence` the minimum over its steps. A step of a sequence starts at the tick where the previous step first held: `eventually` at its first positive tick, `always` at its window end, `hold_for` at the end of its first full dwell, `all` at the latest of its parts, `any` at the earliest. A step that never holds ends the sequence there.
- **`delta` is the change since the first sample** (`x[t] − x[0]`), not per tick, so it means the same at any timestep (Arena runs half the timestep). `angle` is in radians, from a deterministic atan, so native and WASM agree to the bit; a zero vector has no angle (NaN).
- **Pass:** `passed` is a success margin above 0 and no failure fired; a failure fires when its own margin is above 0. `margin` and `worstAt` are the success formula's (the tick that set it). Exactly 0 never passes.
- **Fails closed.** `not` is pushed down to the atoms (De Morgan), so a NaN or overflowed value is always the adverse value: −∞ in the success formula, +∞ in a failure formula (a NaN can never pass a success, and always fires a failure). An empty window, or one shorter than a dwell, is adverse the same way.
- **Refused, never passed:** unknown signals; more than 64 levels of nesting or 4096 nodes (formula, state and expression nodes together); JSON nested over 256; any parameter that isn't a finite number (scale above 0, `hold_for` seconds above 0, windows that start at or after 0 and end after they start, `last` at or above 0); empty `all`, `any` or `sequence`; another version; a success that looks only at the final state (`{ last: 0 }`, statically, and on each trace any window that covers only the last sample, through `all` and `sequence` when every part does, and `any` when one does). Failures may look only at the end.
- **Cost is linear** in trace length per node: each temporal node evaluates its state series once, and `hold_for` uses a monotonic deque.
- **The WASM:** plain `extern "C"` exports (`contract_alloc`, `contract_free`, `contract_evaluate`, `contract_check`), JSON in and out over linear memory, no wasm-bindgen; the reply's pointer and length come back packed in one `u64`. `contract.ts` reads the file with `fs` in Node and `fetch` in the browser, and drops the instance after a trap. About 105 KB, no dependencies.
- **`src/skills/contract.wasm` is a committed output** (§0g). `npm run build:contract` (`tools/build-contract.mjs`) runs `rustc` directly on `src/lib.rs` from the crate's `src/` folder (relative paths only, `--remap-path-prefix`, `opt-level=s`, fat LTO, one codegen unit, `panic=abort`, stripped), so the bytes match on any checkout path. Rebuild and commit it with every change to the crate; the gate rebuilds it and compares hashes, so a different `rustc` than the one that built it (1.99.1 today) fails the gate until it's rebuilt.
- **Fuzz parity:** `cargo run --release -p contract --bin contract-fuzz -- <n> [seed]` prints n accepted random contracts and traces with the native result; the gate checks WASM against them. Non-finite margins print as `±1e999`, which `JSON.parse` reads as ±Infinity.
- **The canary** `canary_planted_false_pass_fails` (`tests/canary.rs`) runs the false-pass check against an evaluator that passes everything. Run by its exact name, it asserts the check let that through, so it fails while the check works and the gate sees the canary fire. In a plain `cargo test` it asserts the opposite and passes. Rust in the crate keeps §0's spirit: no comments, small functions, `cargo clippy -- -D warnings` (also with `--target wasm32-unknown-unknown`), `cargo fmt`.

### Artifacts (`artifacts.ts`, `bundle.ts`)

- **Hashes over `SimModel`** (`modelHashes`): visual elements and attributes (`light`, `camera`, `visual`, `rgba`, `material`, `texture`, `group`) are stripped first. **Topology** is the body tree, joint names, types and axes, actuator kinds and robots. **Physics** is the rest of the MJCF (masses, sizes, hulls, ranges, contact, timestep) plus the start pose. **Actuators** is the `<actuator>` block plus each joint's effort and drive. All carry `SIM_MODEL_VERSION`.
- **`skillFreshness(skill, current)`:** another design, topology, observation or action schema → `needs-training`; no evidence, or a contract, physics or actuator hash that moved → `rerun-arena`; evidence that failed → `needs-training`; otherwise `fresh`. A colour or name change leaves every hash alone.
- **Moving a skill:** `warmStart(skill, target)` gives a training seed (the skill's hash and controller, bound to the target). A skill trained from it has `warmStartFrom` set and no evidence until Arena runs on the new design; the source's evidence never moves.
- **Storage:** content-addressed, `library/skills/<sha256 of the canonical skill JSON>/skill.json` (`skillFolder` refuses anything but a hash). Rerunning Arena makes a new skill, so a folder never changes.
- **`.basecase` files** carry skills as an optional `scene.skills` list, with the file `VERSION` unchanged: older builds ignore the field, and `readSkillBundle` drops entries that don't parse.

### Environment interface (`environment.ts`)

One task description that lowers to WASM now and to native, SIMD and GPU later, so it holds only data: observation terms (`policyObservation(joints)` is exactly today's policy contract), action spec, reset distribution, randomization ranges, a reward reference (contract robustness or a RewardLang hash) and the contract, plus named signal sources the contract reads (time, joint position, velocity and effort, part position, base height, tilt and forward travel, contact). `validateEnvironment(env, model)` returns plain problems; an empty list means valid.

### Arena (`arena.ts`)

The independent verifier, on the WASM `SimEngine`. `runArena({ mj, model, contract, controller, environment })` refuses a contract that differs from the environment's, then runs three variants of 32 tries each: held-out randomized starts and physics, half the timestep, and random servo delays. Evidence gives passes per variant, a one-sided 95% Clopper-Pearson lower bound, the conditions in plain words, and says it covers simulation only, not real hardware. It passes when every variant's lower bound is at least 0.75 (29 of 32).

- **Agents can't change it.** `ARENA` is frozen; `runArena` takes no counts, bars or ranges. Randomization is the environment's ranges widened to Arena's floor (friction ×0.8–1.2, mass ×0.9–1.1, strength ×0.9–1, start joints ±1°, delays to 40 ms in the delay runs), so an environment can't make Arena easier.
- **Sealed instances:** each try's seed is the SHA-256 of a fresh random 32-byte salt, the variant, the try and the environment hash. Evidence holds counts and the salt's hash only, never seeds or drawn values, so feedback can't be fitted to the instances.
- **Delay** wraps `mj_step` (the engine is unchanged), **divergence** turns off MuJoCo's auto-reset and fails the try on a bad-state warning, and a NaN trace fails the contract.

### Method Router (`router.ts`)

`routeTask(analysis)` is pure and walks the plan's rungs in order: unverifiable, IK or motion plan, tracking, Routine, LQR or MPC (12 state values or fewer, no rich contact), tracking RL with a reset curriculum, reward search (6 candidates at 5M steps, 2 at 25M, 1 at 100M, up to 3 rounds, warm-started after the first), ask for a demo, then not found with design relaxations. It returns the method, the rung and the reason.

### Feasibility, Tier 1 (`feasibility.ts`)

`checkFeasibility(mj, model, task)` runs only checks that a model can settle, each marked `exact`, `estimate` or `sampled`, with plain messages:

- **Holding torque** from `mj_inverse` (constraints off, zero velocity and acceleration) plus foot and payload loads by virtual work. Stand checks the start pose and a crouch 15% lower (feet held by IK), with the weight shared over the feet by a minimum-norm force and moment balance. A joint fails above 0.60 of its torque, the Stance limit in the Build checks (§8b).
- **Support polygon:** the center of mass over the hull of the feet's soles, margin in mm.
- **Workspace:** fails exactly past the summed link lengths, else samples 2048 poses and refines the best six with damped least squares.
- **Gripper opening:** prismatic travel, or `2 × finger × sin(span / 2)` for hinged fingers, against the object plus 2 mm.
- **Relaxation ladder:** servos ×2, ranges +20° at each end, links +20%, in that order; the first that makes every check pass is reported, otherwise it says none does. `must-fail-weak-quad` comes back as too weak to stand, with servos ×2 as the fix.
