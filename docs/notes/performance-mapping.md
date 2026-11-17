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

## Sibling frame anchors use one selection scan

`dataFrames.selection.test.ts` checks shallowest-link priority, first tree-entry ties despite reversed anchor order, disconnected roots and cycles, deleted anchors and unchanged input matrices. Existing frame tests retain interpolation, rotated sibling placement, unknown frames and base fallback coverage.

A scratch comparison against the previous resolver matched complete matrices for 9,200 queries across 200 deterministic 40-edge graphs, including cycles, disconnected roots and unknown frames. On 300- and 600-link star trees, complete root resolution reduced edge reads from 1,201 and 2,401 to 603 and 1,203. The permanent tests assert these new counts. These are deterministic operation counts, independent of hardware, without timing assertions or a claim about complete rendering time. Parent walks remain proportional to candidate depth and are bounded on malformed cycles. No cross-call cache is introduced.

## Jacobi rotations use scalar row indices

A whole-app search found two Jacobi eigensolvers passing temporary row-index pairs, in `dataLayers/mapMath.ts` and `joints/cylinderFit.ts`. Both now pass indices directly in the original 0–1, 0–2, 1–2 order. Mapping removes three pair arrays per executed sweep, up to 72 per solve at its 24-sweep cap. Cylinder fitting removes its three pair arrays and their containing list per solve. These are source-derived allocation counts, not timings or a claim about whole-map or axis-discovery latency. Engines may already eliminate some temporary allocations.

A local scratch probe compared complete eigenvalues and eigenvectors exactly against the previous implementations on 1,009 matrices, twice per matrix. Cases include 1,000 seeded dense symmetric matrices spanning 25 scales, zero, repeated eigenvalues, rank-one matrices, signed zero, tiny and huge entries, infinities and NaN. Both implementations matched and preserved their inputs. The probe remains in `scratch/jacobi-pairs.test.ts`, with prior sources in `scratch/mapMathBefore.ts` and `scratch/cylinderFitBefore.ts`.

Existing `mapMatch.test.ts` checks complete matching, sparse neighborhoods, workspace ownership and unchanged inputs. `joints/cylinderFit.test.ts`, `joints/axisFinder.test.ts` and `joints/jointCandidates.test.ts` retain cylinder refitting, picked axes and automatic shaft-and-bore coverage. No action, label or visible state changes, so help steps and screenshots remain accurate. No timeout, retry or quarantine changes apply.

Preflight identified [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) through its coverage metadata. The complete article remains accurate: joint fields, joint sources, part following, anchoring, deletion, modeled poses, IK and robot selection are unchanged. The implementation only replaces internal rotation-call arguments. The article has no screenshots, and its text remains unchanged. The coverage reminder therefore remains informational after this check.


## Earth attribution retains its formatted text

A whole-app search found one visible-tile copyright aggregator, in `three/viewport/earthLayer.ts`. Its state reader, visibility handler and tile-credit events now share cached text. Each nonempty credit event invalidates the text after changing counts. Replacing the renderer clears both counts and text. The cache holds one string per Earth layer and never retains old tile metadata.

`earthAttribution.test.ts` drives the real layer with a controlled tile renderer. It checks frequency ranking, stable insertion-order ties, whitespace, duplicate names, removal and reinsertion, missing copyrights, notifications, hidden updates, renderer replacement and independent layers. The existing `earthLayer.test.ts` retains real tile loading, surface sampling, movement, capture exclusion and hiding coverage.

For 100 visibility events with two credits each and two state reads after every event, the test measures 100 sorting calls. The previous source performs 400 sorts for the same fixture, two per event and one per state read. Each avoided rebuild also removes its copied entry list, mapped name list and join. The hidden-update and show sequence adds one rebuild, which the test checks separately. These are deterministic operation counts, not timings or a claim about whole-map loading time. Every count change still rebuilds once, even if its final formatted order is unchanged.

No action, label or visible state changes. Help steps and screenshots remain accurate. No timeout, retry or quarantine changes apply.

Preflight identified [Place a robot on a map](../../site/content/help/place-a-robot-on-a-map.md) through its coverage metadata. Its key setup, placement, height, attribution, hide or show and distance-limit instructions remain accurate. Attribution content and visibility are unchanged, so its three screenshot states remain accurate and the article stays unchanged. The remaining preflight finding is this coverage reminder.
