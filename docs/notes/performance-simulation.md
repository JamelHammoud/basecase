# Simulation performance

Implementation: [Simulation](../guide/simulate.md#performance-simulation). Shared requirements: [Performance](../guide/performance.md).

## Robot exports index joint identities

`src/sim/robotPackage/jointLookup.test.ts` compares every generated file byte for byte with scan-based joint lookup across all fixture robots. The reference replaces only index lookup with the previous first-match `find`, keeping geometry, serializers and package metadata identical. It also checks reversed model order, two policies with different action orders and an unknown joint, duplicate model and scene ids, independently missing model and scene joints, empty lists and edits between calls.

For the 12-joint quadruped and 18-joint hexapod, the complete package pipeline reads model joint ids 36 and 54 times, down from 336 and 720. Getters count reads on each source model joint. Each fixture includes two policies, each referring to every model joint and one unknown id. Indexed lookup reads each id once for URDF, once for the joint map and once for all policies together. The scan reference reads 2N(N + 1) + 2N ids. These are operation counts measured by the tests, without timing assertions or a claim about complete export time. Indices retain linear storage and no state survives an export call.

## Simulated sensors reuse world-ray and hit buffers

`rayCasting.test.ts` checks rotated and translated poses against independent Three.js geometry, zero directions, range misses, independent sensors, scan rates, time reversal and snapshots. Its 300- and 600-ray fixtures require 180 rotation-coefficient reads across 20 casts, down from 54,180 and 108,180. A scratch comparison matched 480 complete scan snapshots byte for byte against the previous implementation across 40 sensor configurations, moving poses, different scan rates, range misses and time reversal. These are operation counts and numerical comparisons without timing assertions or a claim about complete simulation time.

### Sensor setup copies direction components directly

`compactEye.test.ts` compares full direction and pixel-index lists with the previous slice-based compactor for 0, 1, 192, 720, 768 and 4,096 rays. Frozen sources check input preservation. Separate coverage retains nonfinite components and signed zero, then verifies independent direction, index and world-buffer storage after source edits and another setup. Existing `rayCasting.test.ts` covers the shared compactor through real MuJoCo eye casts and LiDAR scans.

The default 16 × 12 eye removes 192 temporary three-component arrays per setup. A maximum 32 × 24 eye removes 768, and a maximum 720-ray LiDAR removes 720. Four maximum eyes remove 3,072 temporary arrays. These are source-derived allocation counts, not elapsed-time measurements. Setup still allocates its retained compact lists and world buffers and remains linear in ray count. Casting frequency, ray counts and physics work stay unchanged.

The targeted check passed formatting, lint, docs, site copy and types, then 351 related test files and 2,104 tests in 105.86 seconds. One existing file and test were skipped. This includes the new compaction parity cases and existing MuJoCo eye and LiDAR integration coverage. No timeout, retry or quarantine changed.

## Single-body pose reads transform only their owner

`mjcfFrames.test.ts` compares the previous full-map calculation across rotations, aliases, duplicate ids, both namespaces, missing ids, nonfinite poses, source edits and independent results. Across 20 queries, its 300- and 600-body fixtures reduce body rotations from 6,000 and 12,000 to 20, and matrix clones from 9,000 and 18,000 to zero. Membership searches remain linear in body and member counts. These are operation counts, without timing assertions or a claim about complete simulation time.

## Policy playback retains actuator addresses

`policyCommand.test.ts` compares controls and poses against equivalent held targets for both controller kinds, checks replacement and missing joints, and bounds joint-id reads across 50 substeps. The 12-joint quadruped fixture falls from 4,500 reads to 600, and the 18-joint hexapod from 9,450 to 900. The remaining reads belong to the ordinary hold pass. These are operation counts, without timing assertions or a claim about total simulation speed.

## Physics latency reuses control snapshots

`controlDelay.test.ts` checks every channel through startup, repeated wraps, zero delay, resets and changed control widths. A scratch comparison matched the former controls across 140 runs and 84,000 steps. At eight controls and 20 steps of latency, 1,200 steps allocated 21 snapshots instead of 1,200. `controlDelayWorlds.test.ts` checks 450 real WASM steps in each of the live and Arena paths, including timestep rounding and repeated resets. These are allocation counts, without timing assertions.

## Fixed simulation schedules advance by cursor

A local Node 26.13.0 measurement on shared macOS hardware consumed 40,000 events across 4,001 ticks, including the initial copy and sort. After three warmups, the median of nine runs was 2,135.40 ms with `shift()` and 1.96 ms with the cursor. This measures scheduling alone, not physics, and adds no CI timing assertion.

### Pending deadlines remain cached between ticks

`src/utils/timelineCursor.test.ts` exercises 100 events spaced 1,000 time units apart across 100,001 integer ticks. After sorting, the former loop reads timestamps 100,100 times. Retaining the next deadline needs 100 reads, including the first deadline prepared in the constructor. A second sparse cursor advances alongside it to check independent scheduling. The existing 20,000-event fixture now asserts exactly 19,999 timestamp reads after construction, rather than allowing an extra read per tick.

These are operation counts, not timings or complete simulation speed measurements. Sorting still calls the timestamp accessor, event delivery stays linear, and each cursor adds one scalar deadline. All production accessors read fixed event times or return numeric frame times. No caller edits scheduled times during playback. The cursor still releases consumed event references. Stable ties, the 1 ns due boundary, backward ticks and empty schedules retain coverage. No browser flow, timeout or quarantine changes.

## Wheel mixing writes directly into its output

Manual rover driving and route playback were the two differential-wheel mixers in the app. Both built an outer entry array and one pair array per wheel on every tick. Route playback also discarded its speed record after writing controls. The shared mixer now writes each wheel speed into a record directly. Manual output remains a fresh snapshot, while each route runner owns one reusable speed record. No output record escapes route playback.

A local Node 26.13.0 comparison on an Apple M5 Pro, macOS arm64, mixed 100,000 changing forward and turn commands for four and six wheels. Wheel sides alternated at ±85 mm, spin alternated and radii started at 35 mm. The command used sine for forward speed and cosine for turn. Each variant received three warmups, followed by nine interleaved runs. The table gives median elapsed milliseconds, including command generation and output checksum accumulation.

| Wheels | Previous entry arrays | Direct manual snapshots | Reused route record |
| --- | --- | --- | --- |
| 4 | 15.71 ms | 7.41 ms | 4.16 ms |
| 6 | 21.15 ms | 11.74 ms | 5.18 ms |

All variants produced exactly equal accumulated wheel-speed checksums. Across 100,000 ticks, the four-wheel mixer removes 500,000 temporary arrays and the six-wheel mixer removes 700,000. Route playback additionally replaces 100,000 speed records with one runner-owned record. These are source-derived allocation counts. Timings measure only mixing on a shared local machine, not MuJoCo physics, complete driving latency or CI performance. No timing assertion was added.

`src/sim/wheelSpeeds.test.ts` retains exact numeric parity with the old calculation and covers output ownership, unusual ids, radius clamping and repeated route control writes. The integration comparisons cover manual speed ramping and clamping, route turns, duplicate wheel ids, untouched controls and passive and missing actuator bindings. Existing real-physics drive tests remain unchanged.

## Routine scenario events use a heap

Implementation: [Routine scenario tests](../guide/routines.md#scenario-tests-l0). The dynamic scenario clock is shared by L0, L1, L2 and live Routine physics. Unlike fixed simulation schedules, callbacks insert new events while the queue is being drained. A cursor alone cannot replace its ordered insertion. The heap preserves the former time, priority and sequence comparison without moving every later event on insertion or removal.

A local Node 26.13.0 comparison on an Apple M5 Pro, macOS arm64, scheduled N events at `(i * 79) % 307` milliseconds with five alternating priorities. Each clock also ran recurring 20 ms and 50 ms callbacks through 400 ms. Each sample constructed and drained `ceil(50000 / N)` clocks, including callback creation and checksum accumulation. Both implementations received three warmups followed by nine interleaved samples. Median elapsed milliseconds:

| Initial events | Clocks per sample | Sorted array | Heap |
| --- | --- | --- | --- |
| 8 | 6,250 | 6.92 | 3.56 |
| 32 | 1,563 | 3.04 | 1.80 |
| 256 | 196 | 2.87 | 1.63 |
| 4,096 | 13 | 7.99 | 2.90 |

Every paired sample had an exactly equal callback-time checksum. These shared-machine measurements cover scheduling alone, without coordinator, physics, rendering or inference work. They are not complete Routine timings or CI budgets. Pending storage remains linear and each clock owns its queue.

`src/routines/scenarioClock.test.ts` compares full callback traces with the former sorted-array implementation for 2,048 initial events, two insertions per callback, all phase priorities and three recurring periods. It drains the queue across repeated and incremental time boundaries. A separate case covers empty and singleton queues and continuing after a callback throws. Existing `scenario.test.ts` runs the real WASM coordinator through generated scenarios and checks determinism and control timing. No timing assertion was added.

## Routine text symbols use an index

Implementation: [Routine scenario tests](../guide/routines.md#scenario-tests-l0). Compilation already indexed text symbols, while the shared runtime host used `indexOf` on every text watcher reading and inference result. Both now use `Symbols`, with a private map per table and the ordered list retained for coordinator and trace decoding. Runtime initialization copies the plan and indexes its first occurrences. Memory remains linear in distinct observed strings, with an additional map in each host. The list preserves duplicate seeds and never changes the source plan.

A local Node 26.13.0 comparison on an Apple M5 Pro, macOS arm64, interned 100,000 cyclic readings from `person-0` through `person-(N-1)`. Each sample included constructing the table and accumulating returned ids. Three warmups preceded nine samples, alternating implementation order. Median elapsed milliseconds:

| Seeded symbols | Previous list scan | Shared indexed table |
| --- | --- | --- |
| 8 | 7.11 | 1.28 |
| 64 | 40.24 | 1.35 |
| 256 | 113.72 | 1.51 |

All paired checksums matched exactly. These shared-machine measurements cover interning alone, without coordinator, inference or physics work. They are not complete Routine timings or CI budgets. Tables with mostly new names retain their appended strings for the run's lifetime, as before.

`src/routines/symbols.test.ts` compares 1,000 readings against the previous first-match algorithm, including duplicate seeds, empty strings, prototype-like names and Unicode. It also checks stable decoder-list identity, source preservation, compiler ids and isolation between runs. Existing generated-scenario coverage continues to exercise watcher and inference publication through the real WASM coordinator. No timing assertion was added.

The local targeted check selected 133 related files. It passed 129 files and 773 tests, including symbol and Routine coverage. One file was skipped. Three Case physics tests exceeded their existing 5,000 ms limit: recorded object replay in `src/cases/handoffGoal.test.ts:235`, paired-arm Hand Off in `src/cases/slots.test.ts:113`, and hexapod Rough Ground in `src/cases/terrain.test.ts:165`. This run does not establish their baseline status. No timeout, retry, skip or quarantine was added, and no claim of a fully passing related run is made. Formatting, lint, documentation, site copy and types passed.

## Closed Sketch linkages

Measured on 16 November 2026, Apple M5 Pro, macOS arm64, Node 26.13.0, pinned MuJoCo 4.0.0 WASM. The production scene pipeline used the generated Sketch records, fixture box hulls, mesh measures, printed mass calculation, catalog C001 servo and measured fit. All repeated mechanisms shared one robot. Preparation includes linkage insertion records, rig, measures and MJCF. Seven preparations per size supplied the median. Stepping used the median of three 1,000-step runs, each covering two simulated seconds at 0.002 s. No timing assertion or UI performance claim follows from these Node measurements.

| Mechanisms | Preparation ms | 1,000 WASM steps ms | Physics steps/s | Passive coordinates | Actuators | Equalities |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1.478 | 13.158 | 75,998 | 2 | 1 | 1 |
| 2 | 1.256 | 7.660 | 130,548 | 4 | 2 | 2 |
| 16 | 6.070 | 41.799 | 23,924 | 32 | 16 | 16 |

These were unisolated local measurements. JIT warmup and machine load make the two-mechanism stepping sample faster than the one-mechanism sample. They do not establish a scaling speedup. The former welded model had different degrees of freedom, so it is not a physical baseline for this capability.

`forge/crates/forge-train/tests/closed_linkages.rs` reports C model loading plus equality refusal/native fallback startup, then 250 native steps, for each generated matrix member. Native Forge startup remains a CI observation because this host has no Rust toolchain. Local pinned C replay was measured through the existing Python oracle. Its process, loading and half-second trajectory took 135.8–146.8 ms after the first 326.7 ms invocation, including uv startup. These process times are not Forge fallback startup measurements. The existing `tools/sim/contactParity.mjs` comparison captures every applied control, integration state and body pose for ten half-second four-bar trajectories, with its existing 1e-6 maximum state drift bar.

The final model uses solver tolerance 1e-12 for scenes containing a closure. At the default 1e-8 tolerance, the floating contact replay diverged by 7.1348e-6, above the unchanged 1e-6 bar. Tightening convergence reduced the measured worst drift to 8.5391e-10, with no contact differences across all ten mechanisms. The table above was remeasured with the final solver tolerance. No iteration cap or parity threshold changed.

## LiDAR setup rejects unrelated parts

Repository search found one catalog LiDAR specification reader and one body-selection path, both in `src/sim/lidar.ts`. `robotScans` calls them for every scene part during MJCF generation. Previously, `lidarSpec` read the range row before checking the catalog group, and `buildScan` searched body membership even when no LiDAR spec existed. Both now reject unsupported inputs before that work. Valid LiDAR parsing and ray construction are unchanged.

The permanent `lidarSelection.test.ts` fixtures use 300 and 600 unrelated scene parts with 16 bodies. The former body search required 4,800 and 9,600 membership reads, respectively. Both fixtures now require zero. Every non-LiDAR catalog entry also requires zero spec-row reads. These are operation counts, without wall-clock measurements or a claim about complete model preparation time.

Coverage includes real catalog sensors, mixed source order, missing bodies, duplicate ownership, unknown component ids and the existing four-scan limit. Existing `lidar.test.ts` retains the physics and catalog integration checks. No timeout, retry or quarantine changes apply. This changes no visible state or user action, so help articles and screenshots remain current.

Preflight identified [Simulate a LiDAR](../../site/content/help/simulate-a-lidar.md) through its `covers` entry. Its catalog selection, grouping, Drive and Case steps, scan values, dataset output and screenshot remain accurate. This refinement only avoids work for parts that never produced scans, so the article needs no edit or new capture.

Changed-file validation passed formatting, lint, documentation, site copy for 295 pages, types and 1,540 tests across 240 files, with one existing skipped file and test. The related run reported 84.97 seconds. Logs are `scratch/check-lidar-selection.log` and `scratch/check-lidar-docs.log`. Copy accounting is net zero.

## LiDAR specification patterns are prepared once

Repository search found one catalog LiDAR specification parser, `src/sim/lidar.ts`. It serves model preparation and the other `lidarSpec` and `partLidar` callers. Each valid read previously constructed four interpolated regular expressions and evaluated three regex literals. Six module-level patterns now serve all reads, with the identical degree-prefix pattern shared by field of view and angular resolution. None uses global or sticky flags, so matching carries no cursor between inputs. Specification values and parsed results are not cached.

A local scratch replay compared complete results against the previous source for all 18 catalog LiDARs across 100 repetitions. All 1,800 results matched exactly. Instrumenting the global RegExp constructor counted 7,200 constructions before and zero during parsing afterward. This counts the four explicit constructors per valid read, excluding literals and module initialization. Source inspection additionally identifies three per-read regex literal evaluations removed. These are operation counts, without elapsed-time measurements or a claim about complete simulation speed.

`lidarSpec.test.ts` retains 12 synthetic cases across forward, reverse and repeated input order. Cases cover missing and unusable ranges, decimal and comma values, both range separators, defaults, bounded scan rates, competing sample sources, competing field-of-view sources and ray limits. It also verifies source preservation, changed rows and independently owned results. Existing catalog and real-physics tests remain unchanged. No timeout, retry or quarantine changes apply.

The replay source and reports are session artifacts in `scratch/lidar-patterns.test.ts`, `scratch/lidar-before.ts` and `scratch/lidar-pattern-counts.json`. The covered help article, [Simulate a LiDAR](../../site/content/help/simulate-a-lidar.md), remains accurate because no controls, values, states or user actions change. No article edit or screenshot is needed.

Changed-file validation passed formatting, lint, docs, site copy for 295 pages and types. The related run passed 240 files and 1,541 tests, including the new parser tests, with one existing skipped file and test. One test failed at its existing 5,000 ms timeout: the hexapod Rough Ground walk in `src/cases/terrain.test.ts:165`. The run reported 103.95 seconds. This does not establish that test's baseline status, and the related check is not fully passing. No test was retried, weakened or quarantined. The complete log is `scratch/check-lidar-patterns.log`.

## Self-contact

Measured on 17 November 2026 on Apple M5 Pro, macOS arm64, Node 26.13.0 and pinned MuJoCo 4.0.0. `selfContactMeasurements.test.ts` reuses the ten generated mechanisms and the production replay workload. Preparation takes the median of three runs, with content reuse after the first enabled preparation. Stepping takes the median of three 1,000-substep runs, each covering two simulated seconds at 0.002 s. The same reference targets run with self-contact disabled and enabled. No timing threshold, timeout or retry was added.

Numbers come from Vitest’s isolated Node worker. They measure the preparation computation and real WASM stepping, without browser worker launch or UI frame timing. RSS is sampled after the runs, and includes Node, MuJoCo and the preparation runtime. It is not a peak or a per-model allocation. Disabled runs precede enabled runs in the same worker, so memory samples retain earlier allocations. JIT warmup and garbage collection prevent a speedup claim from these observations.

Preparation, stepping and memory columns are disabled / enabled. The pair column lists eligible enabled body / geom pairs before spatial broad-phase rejection. Geom counts use the compiled masks and emitted exclusions, so the payload arm and compound Sketch model expose more geom pairs than body pairs. Disabled models have zero eligible self-contact pairs.

| Mechanism | Preparation ms | Eligible body / geom pairs | Steps/s | Worker RSS MiB | Worker JS heap MiB | Retained hull bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| folding arm | 0.15 / 1.54 | 1 / 1 | 171,519 / 279,968 | 208.7 / 234.7 | 43.0 / 53.8 | 0 |
| crossed humanoid arms | 0.08 / 0.96 | 1 / 1 | 415,239 / 325,976 | 251.4 / 277.6 | 57.7 / 59.8 | 0 |
| quadruped leg and torso | 0.09 / 1.18 | 10 / 10 | 270,130 / 198,911 | 294.7 / 312.7 | 77.5 / 68.1 | 0 |
| neighboring hexapod legs | 0.15 / 1.04 | 15 / 15 | 252,818 / 202,127 | 324.0 / 326.0 | 77.0 / 94.5 | 0 |
| opposed gripper fingers | 0.05 / 0.79 | 1 / 1 | 425,298 / 303,536 | 331.5 / 331.4 | 83.0 / 77.4 | 0 |
| pan-tilt camera and mount | 0.04 / 0.68 | 1 / 1 | 482,762 / 314,700 | 332.5 / 336.2 | 92.5 / 85.2 | 0 |
| folded snake | 0.12 / 0.87 | 6 / 6 | 322,715 / 241,726 | 340.5 / 342.3 | 86.5 / 102.6 | 0 |
| desk-lamp linkage | 0.07 / 0.82 | 3 / 3 | 370,645 / 312,061 | 349.2 / 354.2 | 93.7 / 95.8 | 0 |
| asymmetric payload arm | 0.05 / 0.69 | 1 / 2 | 431,523 / 260,250 | 357.5 / 365.7 | 111.2 / 103.4 | 0 |
| closed Sketch mechanism | 0.29 / 2.01 | 2 / 4 | 339,256 / 208,243 | 358.7 / 371.1 | 70.1 / 88.6 | 480 |

The closed Sketch fixture retained 480 hull bytes from 2160 complex-source bytes. The other fixtures use convex primitives and retain no decomposed hulls. These fixture bytes do not include the decomposition runtime’s internal memory. The ordinary browser workflow was separately captured with actual worker preparation, enabled contact, a disabled passing control and exported scene-file reopen.

The browser cache retains at most 16 MiB of completed hulls. Exact local triangle bytes and a preparation revision form its SHA-256 key. Placement is recomputed after a cache hit. Cancellation terminates browser preparation, while stale replies cannot update its cache or publish a model. The existing captured-world decomposition supplies the 64-piece, 96-vertex and 1 mm minimum-thickness approximation. [Implementation and coverage](../guide/simulate.md#self-contact).

## Linear animation controls prepare endpoints once

Obstacle-aware arm validation exposed repeated `sampleAnimation` allocations inside every physics integration step. `ControlTargets` prepares one pair of Float64 endpoint arrays and a presence mask per non-looping linear key interval. Each step now interpolates directly into existing actuator controls. This removes the sampled pose object, joint-value object, key list and interpolation closures from that path. Preparation costs remain proportional to joints times key intervals. Other animation types retain the shared sampler.

`controlValues.test.ts` compares exact controls against the preceding sampler across 511 timestamps for each of seven controller variants. The cases include sparse and duplicate keys, endpoint holds, root keys, mixed units, velocity and passive channels. Controller replacement rechecks every variant. These are numerical comparisons, without CI timing assertions. Physics timesteps, trial counts, Arena and native parity tolerances remain unchanged.

[Arm planning measurements](performance-skills.md#obstacle-aware-arm-planning) report the complete current planning and validation workload alongside the original direct-plan baseline. They include this control preparation change and do not isolate its elapsed-time contribution. The first broad acceptance run encountered existing five-second test deadlines while several new physics files competed. The generated matrix now shares one file and reuses its matching draft candidate. All original positive, negative and between-key assertions remain. Early broad runs still exceeded the five-second deadline. Grouping and control preparation alone did not resolve those failures. The fixture timing experiment was reverted, preserving every original ten-second request. Current local worker-capacity observations and full-check results are recorded in the linked Skills evidence. No retry, timeout or quarantine was added.

The final macOS changed-file check passed all 2,029 related tests with one local worker and one existing skip. It retained every original ten-second arm request and existing deadline. Parallel invocation failures and the slower local serial check are recorded in the linked Skills evidence. No shared test configuration or CI gate changed.
