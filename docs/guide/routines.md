# Routines

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 8j. Routines

A Routine is an inspectable flowchart that runs as one background skill plus prioritised reactions. It lives in `src/routines/`, and its coordinator in `hw/coordinator/`.

- **The graph is the truth.** Sentences are an entry point, and plain English is generated back from the graph.
- **The motor loop never depends on a Routine.** Control reads one atomic slot, so a hung model or LLM can't stall motors.
- **Sim runs the code the robot runs.** One coordinator crate builds natively and to WASM.
- **A Routine is data, never code.** `Routine` (`schema.ts`) is plain JSON: it survives `structuredClone`, a file and a hash. No callbacks, no scripts.

### Shape

- **Base:** one `do` step that loops for the life of the Routine. Its `timeoutMs` is how long the Routine runs (the greeting walks for 5 min). When it runs out or fails, its path runs, then the robot stops with `safeStop`.
- **Watchers** run perception models at 1–30 Hz and publish one fact each. A fact is fresh for `maxAgeMs`; a stale fact is unknown, and an unknown condition is never true (Kleene logic, so `not` of stale is still unknown).
- **Reactions** fire on the rising edge of `when`, in array order of priority: a higher one preempts a lower one; a lower one is dropped (or queued with `onRetrigger: 'queue'`) while a higher one runs. `cooldownMs` drops edges that come too soon after the last start. One reaction runs at a time, so coverage stays enumerable.
- **`keepGoing`** runs the steps while the base keeps its resources (say while walking). **`stopFirst`** stops the base through its `stopVia` skill first (at the next phase for an `atPhase` skill), then runs the steps, then resumes the base.
- **Steps:** `do`, `say`, `infer`, `ask`, `if`, `wait`, `together`. Every step except `if` and `together` has `timeoutMs`, `onTimeout` and `onFail`. An empty path means: end the reaction. There are no gotos; a path always ends the reaction.
- **Facts and names.** An `infer` or `ask` step publishes a fact named by its `id` (`recognize`, `ask`). Optional step `id`s name nodes for mocks, faults, traces and the flow UI; without one a node is named after its skill, model or kind (`say`, `say2`).
- **Templates:** `{name}` is the name of the only identity fact checked so far; `{fact}`, `{fact.score}` and `{fact.name}` read any fact.

### Compiler refusals

`compileRoutine(routine, { skills, provenTransitions?, capabilities?, modelHash? })` never throws; it returns `{ ok, plan }` or `{ ok: false, errors: [{ code, message, path }] }`. Messages are user-facing copy (§3).

| Code | Refused when |
|---|---|
| `not-a-routine`, `schema-version`, `invalid-field`, `too-large`, `duplicate-id` | the input isn't a Routine of this schema, or is malformed, too deep or too big |
| `missing-timeout` | a guarded step has no positive `timeoutMs`, `onTimeout` or `onFail` |
| `resource-conflict` | two `together` branches hold the same resource, or a `keepGoing` reaction holds what the base holds |
| `holds-mismatch`, `unknown-skill`, `needs-training`, `unsafe-safe-stop` | a step's `holds` differ from its contract, the skill doesn't exist or isn't trained, or `safeStop` hands off to another skill |
| `unproven-transition` | a skill pair has no proof (at least 8 seeds, no falls, matching `modelHash`) and isn't the skill's own `stopVia` |
| `unbounded-ask`, `ask-holds-resource`, `timeout-out-of-range` | an Ask retries from its own failure path, its reaction's cooldown is under 5 s, a reaction asks more than 4 times, Ask holds anything, or Ask isn't given 0.2–60 s |
| `unguarded-name`, `use-before-set`, `unknown-slot` | a `{name}` isn't under an `if` on its identity fact, a model's answer is read before the model runs, or a slot names nothing |
| `unknown-fact`, `type-mismatch`, `unknown-answer`, `unknown-model` | a condition reads a missing fact, compares it the wrong way, names an answer Ask can't give, or uses a model the catalogue lacks |
| `rate-out-of-range`, `stale-by-design`, `wait-never-ends`, `uninterruptible`, `empty-reaction`, `missing-capability` | other graphs that can't run as written |

Transitions are tracked per resource. A `stopFirst` reaction starts from the hubs (the `stopVia` of every body skill in the Routine) and ends back at the base skill; a timed-out `do` hands off to its `stopVia`. Never blend skills linearly.

The plan is flat: ops only jump forward (the compiler emits in reverse and renumbers), so the coordinator can't loop, and `plan.hash` is the SHA-256 of its canonical JSON (`planHash`).

### Runtime tiers

| Tier | Rate | Rule |
|---|---|---|
| Control | 50 Hz | reads one 64-bit atomic slot and never waits; trips to `safeStop` when the slot's sequence stops changing for `controlDeadlineMs` (500 ms) |
| Coordinator | 20 Hz | `tick(now)` runs the plan; no allocation on the tick path |
| Perception | 1–30 Hz | publishes into a latest-wins mailbox of one per fact (seqlock; older stamps are dropped) |
| Remote LLM | 0.2–60 s | `ask` only: never holds a resource; an answer outside its list fails the step |

### Coordinator crate (`hw/coordinator/`)

A standalone Cargo workspace with no dependencies, so it builds offline and the same way everywhere. Rust follows §0 in spirit: no comments, `clippy -D warnings` with complexity 15, 120-line functions and 4 arguments (`clippy.toml`), and no `unwrap`, `expect`, `panic` or indexing outside tests, so a hostile plan can't panic it. `cargo fmt` formats.

- **Frozen slot layout:** `IntentSlot` is one `AtomicU64`: bits 0–15 body skill, 16–31 head skill, 32–63 sequence (bumped every tick). `0xffff` means no skill. `ControlReader` is the control tier's side.
- **Facts:** `FactBoard` (an `Arc` from `Coordinator::board()`) takes publishes from other threads; the coordinator copies them in at the start of each tick.
- **Host calls between ticks:** `complete(token, ok, (num, sym))`, `answer(token, index)`, `phase(token)`, `stop()`. Tokens come from `run` and `opStart` trace events; late or unknown tokens are ignored.
- **Trace events** are fixed records (`t`, kind, `a`, `b`, `c`, `v`) in a 256-slot buffer, written as JSON into a preallocated buffer by `drain_json`. Overflow adds one `lost` event.
- **WASM exports** (`ffi.rs`): `coord_alloc`, `coord_free`, `coord_load`, `coord_tick`, `coord_drain`, `coord_drain_ptr`, `coord_publish`, `coord_complete`, `coord_answer`, `coord_phase`, `coord_stop`, `coord_watchers`, `coord_control`, `coord_control_tripped`. The plan goes in as JSON in linear memory: `coord_load` takes a pointer and length from `coord_alloc`, and the caller frees that pair with `coord_free`. There is one coordinator per WASM instance (`coordinator.ts` makes a fresh instance per run).
- **Build:** `npm run build:routines` builds `src/routines/coordinator.wasm` and records the source and WASM hashes in `coordinator.build.json`; a unit test fails when the Rust changed and the WASM wasn't rebuilt. `npm run check:routines` rebuilds in a temporary folder and checks the bytes match. Built from inside the crate, Cargo's target folder is `node_modules/.cache/basecase-coordinator` (`.cargo/config.toml`). Cargo reads that config from the working folder, so `--manifest-path` from the repo root (the gate) still writes `hw/coordinator/target/`, which Prettier reads until the root `.prettierignore` lists `target`.
- **Parity:** `tests/parity.rs` records inputs and the native trace in `tests/fixtures/`; `coordinator.test.ts` replays the same inputs through the WASM and must match byte for byte. Regenerate with `UPDATE_FIXTURES=1 cargo test --test parity`.

### Scenario tests (L0)

`runScenario(plan, scenario)` runs the real WASM coordinator on virtual time with mocks. A scenario is `{ covers, world: [{ at, fact, value }], mocks, faults: [{ node, at, kind }], seconds, expect }`; times are in seconds.

- **Mocks:** watchers read `world` (default false); `mocks[node]` overrides. An identity mock is `'known'` (Maya, 0.83), `'unknown'` (0.31) or `{ name, score }`; an Ask mock is one of its answers (default the first). Latencies: infer 200 ms, Ask 1.5 s, a skill 1 s, speech 300 ms + 40 ms a character; the base skill never ends and reports a phase every 500 ms.
- **Faults:** `hang`, `fail`, `garbage` (an answer off the list, NaN from a watcher) and `slow` (10×), on any op node, skill, watcher, or `coordinator`. A fault on a node the plan doesn't have fails the scenario.
- **Expectations:** `always`/`never` (skill or said text in a window), `said`, `saidExactly`, `skills` (the body skills control ran, in order), `visits`, `elapsed`, and event counts (`{ event, reaction, node, fact, why, count, from, until }`).
- **Invariants checked in every run:** no gallery name is said unless the face check returned that name, nothing fires or speaks after a safe stop, two things never speak at once, and control never waits more than 20 ms.
- **Generated scenarios** (`generateScenarios`): every op outcome and branch of every reaction (found by a forward route and a condition solver), thresholds hit exactly and just missed, preemption both ways, cooldowns, retriggers, stale watchers, base timeout and failure with their paths, a stop that never ends, a base that never reaches a phase, and a coordinator that hangs. Expectations come from an abstract run of the plan (`generateModel.ts`). Each has a unique `covers`.
- **Later tiers plug in here:** L1 (MuJoCo with real policies) replaces the skill mocks in `scenarioHost.ts`; L2 (rendered frames through real detectors) replaces the watcher and infer mocks. Scenario shape and expectations stay the same.
- The 1,000 reruns, 200 mutants (`mutate.ts`) and the canary live in `verify/routines/`, not `npm test`.

### Explanations

`explain.ts` builds sentences from trace events only, never from an LLM: "Said Hello Maya at 1.2 s because Check Face matched 0.83 (needs 0.60)". The cause is the nearest timeout, failure or branch that leads to the event, read with its condition leaves; otherwise the reaction's trigger. `describeRoutine` writes the graph as plain English.

### ML nodes

`nodes.ts` is the catalogue: id, label, inputs, outputs, tier, where it runs, model, licence and a `measuredMs` slot that stays empty until a node is measured on that device. Face recognition is a normal node: `gallery.ts` holds enrolments locally (normalised embeddings, newest 16 per person) and Forget removes a person and every embedding. The gallery file belongs in `library/` and never in git. This stage runs on mocks; real inference comes later.

### Flow, L1 and the app (interface)

Stage 4b is judged by `s4b-routines-flow` (§0k); its tests in `verify/routines/` are the contract, and type stubs for everything below are in `verify/routines/interfaces.ts`.

- **`src/routines/flow.ts`:** `routineToFlow(routine) → { routine, nodes, edges }`, `flowToRoutine(flow) → unknown` and `lightFlow(flow, events) → { states, rejected }`. All pure; `flowToRoutine` never throws (a flow it can't read becomes something the compiler refuses).
  - `flow.routine` holds the Routine's own fields (schema, id, name, sentence, requires, safeStop). A node is `{ id, kind, data }` with kind `base`, `watcher`, `reaction`, `end` or a step kind; `data` is that object without its child sequences (`then`, `else`, `branches`, `onTimeout`, `onFail`, `steps`). Step node ids are exactly the compiler's node names (`plan.ops[].node`), the base is `plan.base.node`, watchers and reactions keep their ids.
  - Edges are `{ from, to, kind }`: `next`, `then`, `else`, `branch`, `timeout`, `fail`, `trigger`. Every guarded node (base and every `do`, `say`, `infer`, `ask`, `wait`) has exactly one `timeout` and one `fail` edge, to the first step of that path or to an `end` node for an empty one. Removing a `timeout` edge leaves that step without `onTimeout`, so the compiler refuses it (`missing-timeout`).
  - `flowToRoutine(routineToFlow(r))` equals `r` in canonical JSON for every valid Routine, including steps without ids (no ids are invented) and reaction and watcher order.
  - `lightFlow` gives every step, watcher and reaction node a state: `idle` until an event names it; then `opStart` → `active`, `opDone` → `done`, `opFail` → `failed`, `opTimeout` → `timedOut`, `opCancel` → `cancelled`, `branch` → `then` or `else`, `fired` → `active` and `ended` → `done` on the reaction. Events for a node or reaction the flow lacks go to `rejected` and change nothing.
- **`src/routines/capabilities.ts`:** `sceneCapabilities({ parts, joints }) → Capability[]`. Sensors come from catalog parts (`componentId` in Cameras → `camera`, Depth Cameras → `depth` and `camera`, speakers and amplifiers → `speaker`, microphone arrays → `microphone`); movers from joints (`legs`, `wheels`, `arms`) and a neck joint gives `head`. Pass it as `capabilities` to `compileRoutine`.
- **`src/routines/physics.ts` (L1):** `routineKit(mj, robot) → { skills, modelHash }` lists Kit skills as `SkillContract`s for that robot, at least `walk`, `settle`, `turn-away` and `look-at` for a legged robot, `ready` only when it can run them in MuJoCo, else `needsTraining`, with transition proofs measured on its `modelHash`. `runPhysicsScenario(plan, scenario, { mj, robot, kit })` runs the real coordinator on sim time with those skills driving MuJoCo (perception, speech and Ask stay mocked as in L0) and returns a `ScenarioResult` plus `physics: { samples: [{ t, base, yaw, tilt, joints }], fellAt }`: seconds, metres in the MuJoCo world (z up), radians, at least 10 Hz. Same inputs give the same trace and samples.
- **Agent tools** (MCP name = bridge kind, renderer handler like `set_world`; replies are a JSON object as text): `make_routine { sentence, routine }` → `{ ok, errors?, nodes }`, compiled against the scene's capabilities and Kit; `test_routine {}` → `{ passed, scenarios: [{ covers, passed }], errors? }`, `passed: false` when the Routine doesn't compile; `run_routine { scenario, live? }` → with `live`, `{ started: true }` at once while the Routine runs L1 on the canvas, with the scenario's world and mocks feeding perception.
- **UI:** a Routines view in the rail (`aria-label="Routines"`). The flow sits in `[data-testid="routine-flow"]`: each node is `[data-flow-node="<id>"]` with `data-state` from `lightFlow`, each edge `[data-flow-edge]` with `data-from`, `data-to`, `data-kind`. A step that needs a capability the scene lacks offers Add Camera (or the matching Add), which places a catalog part and recompiles; a `needs-training` node shows a Needs Training button inside its node.
- **Dev hook:** `__studio.routineState() → { routine, compiled: { ok, errors?, plan? }, tests, run: { live, done, trace, said } }`.
- **Soak:** `cargo build --release --manifest-path hw/Cargo.toml --bin routine-soak`, then `routine-soak --plan <plan.json> --seconds <n> --workers <n> --hang <node> --hang-seconds <n>` runs the native coordinator and the daemon's control loop on the emulated bus with that many busy worker threads, publishes facts so the greeting reaches its Ask within a few seconds, and never answers the hung node. Its last stdout line is JSON: `plan_hash`, `bus: "emulated"`, `seconds`, `workers`, `control: { ticks, p50_us, p99_us, p999_us, max_us, tripped }` (jitter is a control tick's lateness against its 20 ms schedule), `body_skills: { <skill>: ticks }`, `coordinator: { ticks }`, `hung: { node, started_ms, answered }`.

### Interfaces for the next stages

- **Flow UI:** render `Routine` directly; node ids are `plan.ops[].node`; live trace lighting maps `opStart`, `branch`, `fired` and `said` events to those nodes; error `path`s name nodes; `describeRoutine` and `explainTrace` give the words.
- **Skills (§8i):** pass Motor Kit contracts as `skills` and set `modelHash` to the compiled-physics hash; proofs come from `SkillContract.transitions`. `needs-training` errors are the Needs Training button. `fixtureSkills.ts` stands in until then.
- **Robot daemon (§8k):** link the crate natively: feed `FactBoard`, call `tick` at 20 Hz, act on `run` events by token, read `IntentSlot` from the control thread through `ControlReader`.
- **Sentence-to-flow:** the agent tool emits a `Routine` and calls `compileRoutine`; the graph stays the truth.
