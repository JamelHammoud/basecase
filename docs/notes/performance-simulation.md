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
