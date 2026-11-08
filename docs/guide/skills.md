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

The independent verifier, on the WASM `SimEngine`. `runArena({ mj, model, contract, controller, environment })` refuses a contract that differs from the environment's, then runs three variants of 32 tries each: held-out randomized starts and physics, half the timestep, and random servo delays. Evidence gives passes per variant, a one-sided 95% Clopper-Pearson lower bound, the conditions in plain words. It passes when every variant's lower bound is at least 0.75 (29 of 32).

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

### Motor Kit and solver race (interface)

The contract the Stage 3a gate (`s3a-motor-kit`, §0k) builds against. The tests in `verify/skills/` import exactly these names; anything not named here is the builder's choice. Every function is plain data in, plain data out, and none of them judges itself: the gate reruns `runArena` and `evaluateContract` on what they return.

**Shared types**, exported from `src/skills/motorKit.ts` (and reused by `race.ts`):

- `ForgeJob = { name: string; xml: string; job: Record<string, unknown> }`: one Forge training, the MJCF and the `job.json` fields `forge-train` reads (§8g). New tasks, command ranges and RewardLang rewards are new job fields.
- `ForgeOutcome = { ok: boolean; policy: PolicySpec | null; events: object[]; stderr: string }`: Forge's JSON-lines events and the `policy.json` it wrote.
- `ForgeRunner = (job: ForgeJob) => Promise<ForgeOutcome>`. The Kit and the race train only through the runner they're given: in the app that's `electron/trainer.mjs`, in the gate a runner that spawns `forge/target/release/forge-train --job <dir>`. A skill's policy must be one a runner returned, weights unchanged.
- `SkillSave = (path: string, text: string) => Promise<void>`: called once per new skill with `skillFiles(skillHash(skill)).skill` and the skill's JSON.

**Motor Kit** (`src/skills/motorKit.ts`):

- `KitEntry = 'stand' | 'get-up' | 'velocity-tracking' | 'pose-tracking' | 'settle-to-neutral'`. `kitSkillName(entry)` is the `Skill.name` of that entry's skill.
- `kitEnvironment(model, entry): Environment`, pure: the environment (and contract) the Kit trains and Arena judges for `model.robots[0]`. The same model always gives the same environment, and a colour edit changes nothing.
- `trainKitEntry({ mj, design, model, entry, forge, save, signal? }): Promise<KitOutcome>`, where `KitOutcome` is `{ kind: 'skill', skill, environment, cost }` or `{ kind: 'refused', reason, relaxation, cost }`, `cost = { wallS, steps, forgeRuns }`, and `relaxation` is the feasibility ladder's `{ change, message }` or null. A skill comes back with passing Arena evidence on `environment`, bound to `design`, and saved. It refuses before any training when `checkFeasibility` rules the entry out, naming the relaxation (`must-fail-weak-quad`: `torque-x2`). `cost.steps` counts every Forge step it spent.
- `kitStatus({ design, model, skills }): Array<{ entry, skill: string | null, freshness: Freshness | 'missing' }>`: one row per entry that applies to the model, matching skills by `kitSkillName`, freshness from `skillFreshness` against `kitEnvironment(model, entry)`.
- **Velocity tracking is commandable:** its policy reads `PolicySpec.command` as `[forward m/s, left m/s, counter-clockwise rad/s]`, and `SimEngine.command({ v })` on a policy controller replaces that command from the next control tick (`setController` starts from the spec's). Drive for bipeds goes through this. No external force ever moves the robot.

**Solver race** (`src/skills/race.ts`):

- `RaceTask = { id, design, model, environment, analysis: TaskAnalysis, goal: RaceGoal }`, with `RaceGoal = { kind: 'reach', part, waypoints: Array<{ point: [x, y, z], holdS }> } | { kind: 'velocity', command: [vx, vy, wz] }`. Points are in MuJoCo's world frame in metres, where a `part-position` signal reads that part's body.
- `runSolverRace({ mj, task, forge, save, rewardCandidates?, robustnessCandidate?, budgetSteps?, signal? }): Promise<RaceOutcome>` routes with `routeTask(task.analysis)` and solves cheapest first. `RaceOutcome` is `{ kind: 'skill', skill, method, route, cost, attempts }` or `{ kind: 'not-found', route, cost, attempts, reason }`; `cost = { wallS, steps }`; each attempt is `{ method, passed, cost, reason, candidates: Array<{ reward: RewardRef, steps, arenaPassed: boolean | null }> }`. A skill only comes back with passing Arena evidence on `task.environment`; a candidate whose reward is high and whose contract fails never wins. `rewardCandidates` replaces the agent's RewardLang candidates, `robustnessCandidate: false` drops the free contract-robustness one, and `budgetSteps` caps Forge steps (exceeded by at most one run).
- `solveWith({ ...raceInput, method })` runs one method alone and honours `signal`; a method that isn't built returns `not-found`.
- Skills record where they came from: `Skill.origin = { method, cost: { wallS, steps } }`, optional, so older skill files still read, and the file `VERSION` stays.

**Kit retraining** (`electron/kitScheduler.mjs`): `new KitScheduler({ trainer, debounceMs })` with `request({ workspaceId, xml, job })`, `cancel(workspaceId)` and `dispose()`. Requests for one scene within `debounceMs` (global `setTimeout`, read at call time) collapse to the latest, which starts once at `PRIORITY.kit`. A queued or running Kit job for an older design of that scene is stopped and replaced, so only the latest design trains. User training keeps going first. Scenes are independent.

**Cases use the one contract:** `parseCase` takes any task contract `src/skills/contract.ts` takes; `CaseResult` adds `trace: Trace` (every signal the contract reads) and `failed: string[]`, and `passed`, `margin` and `failed` are exactly `evaluateContract(result.case.task.contract, result.trace)`. `src/cases` keeps no evaluator of its own (`evaluateLocally` goes), and a contract the crate refuses makes `runCase` reject or come back not passed.

### Gate s3a-motor-kit: bars and why

The gate judges Kit skills twice with the unchanged `runArena` (its files are hashed in the gate): once on the Kit's own environment, and once on the gate's own contracts in `verify/skills/judge.ts`, so an easy Kit contract can't pass. Every bar was checked against stand-ins before the gate was approved: a hold controller passes Stand, Get-up and Settle; limp fails Stand on all three robots and Get-up and Settle on quad-servo; a zero policy fails Velocity tracking. Where limp fails the gate's contract, the Kit's own contract must fail it too.

- **Stand**, 6 s from starts up to 15° off neutral: tilt under 0.35 rad, base above 75% of its start height, drift under 0.15 m. The 15° matters: these fixtures stand passively on straight legs, so limp passes from the neutral pose.
- **Velocity tracking**, 8 s: tilt under 0.6 rad, base above 60%, and after a 1 s ramp the distance covered sits between 0.5× and 1.5× the command (0.2 m/s for quad-servo and hexapod, 0.15 for biped-servo), judged at the top speed, half of it (the four- and six-legged robots) and standing still (under 0.1 m drift). Three speeds catch a policy that only knows one. 0.2 m/s is the time-to-skill bar (§0k).
- **Get-up**, 6 s, from the pose limp collapses to out of a 40° crouch: hold base above 80% and tilt under 0.35 rad for 1 s.
- **Settle to neutral**, 4 s, from 12° off neutral on every joint: every joint within 8° of neutral for 1 s, upright. The servo law is `kp = effort / 0.17 rad`, so a joint under stance load sits several degrees off its target; 8° leaves room for that and still fails a robot that stays where it started.
- **Biped steering**, a 13 s timeline in the WASM sim through the app's policy path: 1 s still, 4 s forward at 0.15 m/s, 4 s left and 4 s right at 0.1 m/s and ±0.5 rad/s. It must cover 0.3 m along its heading in the forward segment (half the command), turn at least 0.35 rad (20°) of the commanded sign in each turn segment, never tilt past 45° or drop under 60% of its start height, and no external force may act. 0.15 m/s on a 0.15 m leg is a Froude number (v²/gL, Alexander's dynamic similarity) of about 0.015, a slow, nearly quasi-static walk: people walk near 0.25 and change to running near 0.5. The run is one clean rollout, because Arena already covers randomized physics and servo delay for the same skill. The turn bar is a fifth of the command because biped-servo has no hip yaw joint, so it turns only by uneven strides and foot pivots; a robot that drifts one way can't pass both turns.
- **Wall-clock budgets** on the M5 Pro, Arena included, against Forge F1 at 40K steps/s or more: quad-servo Stand 10 min, Velocity 30, Get-up 20, Settle 10; hexapod Stand 10, Velocity 30; biped-servo Stand 15, Velocity 45. The race: 5 min per arm task, 45 min for the walk. These checks are `timed`.
- **The race suite:** arm-3dof reach (IK expected, a 20 mm box held 0.5 s), arm-6dof touch then hold (IK expected, 0.1 s at one point, then 1 s at another), quad-servo walk at 0.2 m/s (reward search expected, judged by the Velocity tracking contract). The 2× rule is checked by running every other method with a cap of half the router's wall time (10 min at most); any that passes Arena inside it fails the gate.
- **Canaries** fire only on their own assertion; a canary that crashes or doesn't load counts as not fired (`verify/lib/canary.mjs`). Limp on Stand and a zero policy on Velocity tracking are planted against the gate's own contracts; a reward-hacked RewardLang candidate (rewards staying upright) alone in the race with a 10M-step budget; the weak quad's Stand; a quad-servo Stand skill on the hexapod; and the biped driven on the same timeline with every turn command zeroed.
