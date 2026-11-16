# Case facts and world geometry performance

Implementation: [Case facts and world geometry](../guide/cases.md#performance-case-facts-and-world-geometry). Shared requirements: [Performance](../guide/performance.md).

## Arm discovery retains candidate chains

`robotFit.test.ts` checks inherited and leaf arm tags, first-match ties, untagged fallback, edits and source preservation, alongside shoulder reach and guest binding coverage. A scratch comparison matched complete robot facts against the previous implementation on six fixtures with 10 or 20 four-joint branches, tagging no branch, the first branch or the last branch. For 20 eligible leaves, chain construction falls from 41 to 20 without an early tagged match, or to one when the first leaf is tagged. Measured parent-map reads for the complete fact calculation fall from 9,304 to 9,220 or 9,144 respectively. Gripper discovery and morphology retain their existing work. These are operation counts, without timing assertions or a claim about complete Case startup time.

## Case facts accumulate occupancy during classification

`caseFacts.test.ts` compares complete facts across 120 generated worlds and repeated poses, including moving markers, overlap precedence, inclusive boundaries, reentry and score edits. With 20 markers and 100 or 200 movers, mover-id reads fall from 2,800 and 5,600 to 800 and 1,600. Classification still searches markers in order. These are operation counts without timing assertions or a claim about complete simulation time.

## RoomPlan walls order opening heights once

`roomWalls.test.ts` checks solid coverage, volume, overlap, boundaries, edits and source preservation. A scratch comparison matched 2,000 complete ordered outputs against the previous implementation across 1,000 generated scans and subsequent edits. On crowded single walls with 300 and 600 windows, complete mapping reduces sort calls from 603 and 1,203 to three, including edge sorting and the object cap. On shared macOS arm64 hardware with Node 26.13.0, median mapping times fell from 4.62 ms and 19.41 ms to 0.44 ms and 1.23 ms. Measurements used 21 alternating three-call batches after five warmups per implementation. These measure wall mapping alone, without CI timing assertions or a claim about complete import time.

## World floor probes reuse projected triangle edges

`floorTriangle.test.ts` compares the previous calculation across 120 translated, rotated and scaled triangles, both windings, tolerance boundaries, degenerate inputs and nonfinite queries. It checks source preservation, replacement geometry and independent preparations. Across 300 and 600 probes, source-coordinate reads fall from 5,400 and 10,800 to 18 during preparation and zero during queries. `worldSurfaces.test.ts` checks cell boundaries, the 64-cell cutoff, large-floor fallback, gaps and floor-height tolerance. These are operation counts and result comparisons, without timing assertions or a claim about complete world-planning time.

## Ground planning reuses obstacle footprints

`groundObstacles.test.ts` checks strict boundaries, rotation and parallel thresholds, all four clearance levels, obstacle order, duplicate ids, source preservation, edits and empty or push-only routes. Both 10- and 20-waypoint fixtures prepare one footprint. A seeded scratch comparison matched 300 complete routes, 6,000 occupancy queries and 30 room starts against the previous implementation. A 20-waypoint detour fixture reduced footprint calculations from 320 to one. A blocked room-center search reduced them from 147 to one. These are operation counts, without timing assertions.

## Ground routes append detours directly

A seeded scratch comparison matched 300 complete ordered routes against the previous implementation and checked input preservation. Fixtures had 1 to 12 obstacles and 1 to 8 waypoints, including push targets. The largest result contained 166 route points. On alternating 10- and 20-waypoint fixtures around one block, the old recursion created 40 and 80 path arrays, copied 30 and 60 entries into parent paths, then created 10 and 20 mapped arrays. Direct appending removes those arrays and copies while retaining the final route and its point objects. Side-selection geometry and footprint preparation still allocate as before. These are operation counts, without timing assertions or a claim about complete Case startup time. `groundRoute.test.ts` retains a two-obstacle nested detour with speed, push identity and source-preservation assertions.

## Captured world parsing

`e2e/worldImport.e2e.test.ts` covers attachment of the rendered world.

## Captured world benchmarks

`node tools/perf/worldBench.mjs --dist dist --scene scratch/rover.json` imports a synthetic 1,000,000-point kitchen splat into a saved rover scene, waits for all points to enter Spark's active set, warms one orbit and measures a second four-second orbit at 1440 × 900. It uses the viewport benchmark's WebGL probes and Chrome's GPU-process trace, records CPU work p95, frame interval p95 and average GPU-process work per rendered frame, and fails when CPU work p95 or GPU-process work exceeds 16 ms. `--cpu` selects SwiftShader, `--budget` changes that explicit budget, and `--output` chooses the JSON report (default `scratch/perf/world.json`). No GPU measurement has been recorded for this change. GPU-process work measures Chrome's submission work rather than hardware execution time. The decomposition test’s 200,000-triangle worker budget is 10 seconds. Run `src/cases/worldDecomposition.perf.test.ts` with `vitest.perf.config.ts` for that measurement. It transfers a tessellated kitchen into a bundled worker and checks the gap under its table. The initial direct 200,000-triangle box measurement took 17.95 seconds before boundary-preserving collision simplification was added. This is a local measurement, not a CI result.

## Classroom grading

Host: Apple M5 Pro, 24 GiB RAM, macOS, Node 26.13.0. The scratch measurement uses the same bundled native-thread adapters as the integration matrix. Each revision changes the starter rover chassis width, uses a distinct display name and pins the same Reach a Spot assignment with twenty seeds. The input-byte total counts complete submission files. Assignment construction and row retention are included in elapsed time, while the shared worker-bundle build runs before timing. No browser rendering is included.

Worker memory samples `heapUsed + external` after each dispatch reply, including WASM external allocations. The aggregate sums the latest samples from concurrently retained workers. These are peak sampled worker values, not continuous high-water marks or whole-process RSS. Workers are terminated and awaited before retained-driver memory is measured after garbage collection. The driver retains submissions and result rows, matching the local grid's retained references.

| Observation | Submissions | Duration | Input bytes | Peak sampled single worker | Peak sampled aggregate workers | Retained driver delta |
| --- | --- | --- | --- | --- | --- | --- |
| Earlier | 3 | 2.454 s | 8,118 | 38.6 MB | 84.0 MB | 1.25 MB |
| Earlier | 30 | 23.750 s | 81,201 | 44.2 MB | 88.1 MB | 2.45 MB |
| Final | 3 | 3.078 s | 8,118 | 45.4 MB | 90.7 MB | 1.26 MB |
| Final | 30 | 51.852 s | 81,201 | 43.9 MB | 91.3 MB | 2.17 MB |

The final observation includes the finite-output guard and stricter malformed-part validation. The host is shared and its load was not controlled. These observations establish no regression or improvement between revisions. The fixtures use primitive robot geometry and declared joint loads rather than maximum-size catalog designs.

Every sample ended with zero active workers. The runtime limit is one submission at a time and at most one file worker, one Study worker and one Case worker for its grading session. A selected replay is separate from the grid, and selecting it cancels an active batch. Imports are capped at 8 MiB per file, 64 MiB of retained submission files, thirty revisions, 256 parts, 64 joints and 100,000 prepared triangles. These limits are supported format and scheduling bounds, not measured guarantees for maximum-size inputs or other devices. Native-worker startup and memory behavior differ from browser workers. Browser transfer, GPU memory, large imported worlds and maximum-size catalog robots were not measured in this sample.

## Study camera visibility

Measurements on 16 November 2026 used an Apple M5 Pro, model Mac17,8, macOS, headless Chrome with software GL and the production desktop bundle. The host was shared with other work. These are local observations, not timing gates or physical sensor measurements.

The source was a generated rover with a Camera Module 3, one declared target, four recorded body-pose samples and two supplied orientations. The catalog file contains 119,682 decoded triangles. The current view and two candidate views use the same four timestamps. The comparison requests instance and depth captures only, without JPEG encoding or detector initialization.

Two production entry captures completed the comparison in 3,682.18 ms and 3,294.25 ms. In the second observation, worker scene preparation took 193.18 ms for the current design and 61.19/11.24 ms for candidates. Corresponding rendered capture batches took 842.13 ms and 215.50/66.19 ms. These times include cold setup and software-renderer variation and do not establish a throughput rate.

The source load sent 520,084 binary bytes, including the 816-byte recording and catalog bytes. Diagnostic JSON metadata occupied 17,293 UTF-8 bytes, excluding binary payloads. Current-view preparation sent 8,877 metadata bytes through Study's immutable handles. Candidate preparations sent 1,090 and 1,089 metadata bytes and zero binary bytes. Engineering triangles and measures never enter these render packets. Apply independently revalidates the source, sending another source load to a new short-lived worker.

From the grading reply to capture posting, interaction-thread preparation took 0.205, 0.095 and 0.110 ms. Native capture posts took 0.085, 0.020 and 0.030 ms. Byte-accounting instrumentation was excluded from those preparation intervals. The first observation contained one 83 ms studio task during comparison startup. The second contained no task of at least 50 ms. A renderer-thread CPU profile of the second observation was mostly idle, with aggregate self time below 10 ms for each named React, layout and existing viewport GL node. Native program time is outside that attribution. This does not prove that every studio interaction meets 16 ms. Label/depth rendering and pixel counting run entirely in the capture worker.

Retained memory was measured separately through Chrome's `Runtime.getHeapUsage` after explicit garbage collection. The worker module started at 6,673,784 bytes of JS heap and 7,889,241 bytes of backing storage. After the current design and one candidate it retained 9,423,740 and 18,940,011 bytes respectively. The stage reported 12 geometries, 3 textures and 7 programs. Selected body-pose arrays held 1,344 bytes, and the two result records serialized to 1,123 bytes. GPU byte totals were not measured.

After stage disposal, JS heap was 8,881,036 bytes and backing storage was 18,928,504 bytes. Catalog caches remain scoped to that worker until termination. The capture client terminates its worker at completion or abort. An earlier observation before immutable mesh-file registration reuse retained 16 geometries and 22,304,214 backing-storage bytes after capture. Registering the same immutable file map once avoids those repeated decoded geometry resources. These single observations are not a statistical speed comparison.

The render matrix reuses one test-owned production stage across its generated scenarios, while the application owns one capture worker per Study. Geometry preparation runs in the existing Study worker. Baseline local triangles and solids are reused across camera candidates. Sampling is capped at 32 frames, 8 cameras, 16 targets, 256 robot/world parts, 1,000,000 robot triangles and 1,024 full-or-isolated capture requests across the current design and candidates. Each request contains an instance pass and a depth pass. Source recordings are at most 64 MiB. Correctness coverage is in [camera evidence](testing-cameras.md#study-camera-visibility).
