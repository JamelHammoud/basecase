# Sensor layers and mapping performance

Implementation: [Sensor layers and mapping](../guide/canvas.md#performance-sensor-layers-and-mapping). Shared requirements: [Performance](../guide/performance.md).

## Recorded mapping indexes sensor order once

`mapFeed.test.ts` checks complete sample order, repeated maps, source preservation, edits and empty recordings through the real mapping pipeline. Its 128- and 256-sensor fixtures remove 2,736 and 5,588 sensor-list searches respectively. These are operation counts, without timing assertions or a claim about complete mapping time.

## Scan reconstruction reuses sample workspaces per sweep

`mapWorldCells.test.ts` compares occupied and free evidence with the previous calculation across transformed sweeps, mixed directions, boundary crossings, zero rays, occupied-only clouds and edited sources. Its 300- and 600-return fixtures reduce coordinate rounding calls from 2,700 and 5,400 to 1,803 and 3,603, and typed-array views from 300 and 600 to zero. These are operation counts, without timing assertions or a claim about complete reconstruction time.

## Scan reconstruction checks box faces without cell arrays

`mapWorldBoxes.test.ts` compares all 256 occupancy patterns in a 2 × 2 × 2 cube and 120 mixed planar and volume fixtures against the previous merger, with independent coverage and overlap checks. It also checks insertion order, edits, result ownership and refusal budgets. Its 300- and 600-cell solid fixtures reduce coordinate-array joins from 902 and 1,802 to 300 and 600. These are operation counts, without timing assertions or a claim about complete reconstruction time.

## Sensor data costs only what changed

A million points rewrite in about 6 ms solid and 11 ms colored by intensity on an M-series Mac, and an unchanged update takes under 0.1 ms (`dataLayers.perf.test.ts`, best of 8, run with `npm run perf:booleans`, which takes every `*.perf.test.ts`); a first version with a function call per point took about 170 ms. The test fails past one 16 ms frame solid and 24 ms colored, and when an unchanged update takes 1 ms.

## Scan matching reuses a sweep workspace

`mapMatch.test.ts` checks convergence, buffer reuse, input preservation, independent repeated calls, sparse neighborhoods and unconstrained sweeps. A scratch comparison matched the former poses exactly in 120 cases across flat lines, tilted lines, 3D corners, tilted corners, three point counts and ten pose guesses. A 240-point flat fixture reduced neighborhood arrays from 435 to one and removed 438 normal copies and 438 Jacobian arrays. A 1,323-point 3D fixture reduced neighborhood arrays from 2,978 to one and removed 1,545 normal copies and 1,545 Jacobian arrays. Both kept identical constraint counts and poses. On shared macOS arm64 hardware with Node 26.13.0, batches of 20 matches took median times of 3.93 ms before and 3.64 ms after for the flat fixture, and 31.60 ms before and 29.83 ms after for the 3D fixture. Each measurement used nine alternating batches after ten warmups. These measure matching alone, without CI timing assertions.

## Scan maps fuse off the main thread

`src/dataLayers/map.perf.test.ts` bundles the real core into a Node worker and checks a 200,000-point map against a 10-second budget. On an Apple M5 Pro with Node 26.13.0, 400,000 returns across 40 sweeps produced 200,518 occupied voxels in 512.3 ms with matching on. This is a local measurement, not a CI result. Run that one performance file with `vitest.perf.config.ts` to measure the budget on CI without adding timing assertions to Check.

## Scan reconstruction stays in the mapping worker

A fresh Node worker per existing fixture on an Apple M5 Pro, Node 26.13.0, matching on, measured reconstruction plus hashing as follows. Heap and ArrayBuffers are end-of-call worker memory, not process peak RSS, and include retained intermediate allocations before GC. The machine was shared with other builds. These are local measurements, not CI timing assertions.

| Fixture | Time | Pieces | Occupied/free cells | Heap | ArrayBuffers |
  | --- | --- | --- | --- | --- | --- |
  | Corridor | 2,904.5 ms | 64 | 702 / 5,163 | 17.5 MiB | 2.6 MiB |
  | Depth room | 4,675.2 ms | 32 | 3,804 / 19,393 | 21.7 MiB | 8.2 MiB |
  | Steps | 328.3 ms | 5 | 689 / 0 | 13.4 MiB | 0.9 MiB |

## Recorded scan hits write directly into their output

`quat.test.ts` checks product parity and output storage. `scanHits.test.ts` compares complete outputs with the previous calculation across 80 poses and layouts, range boundaries, sparse inputs, typed-array views and later edits. Existing `simTracks.test.ts` and `simMap.test.ts` retain MuJoCo replay and map coverage. On macOS arm64 with Node 26.13.0, 720-ray scans took median times of 0.0370 ms before and 0.0103 ms after with every ray returning, 0.0214 ms and 0.0069 ms with half returning, 0.0057 ms and 0.0028 ms with 10% returning, and 0.0021 ms and 0.0016 ms with none returning. Each comparison used four warmup batches and 21 alternating measured batches of 500 calls per implementation. These measure hit reconstruction alone, without CI timing assertions or a claim about complete playback or mapping time.
