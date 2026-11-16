# Case facts and world geometry performance

Implementation: [Case facts and world geometry](../guide/cases.md#performance-case-facts-and-world-geometry). Shared requirements: [Performance](../guide/performance.md).

## Case facts accumulate occupancy during classification

`caseFacts.test.ts` compares complete facts across 120 generated worlds and repeated poses, including moving markers, overlap precedence, inclusive boundaries, reentry and score edits. With 20 markers and 100 or 200 movers, mover-id reads fall from 2,800 and 5,600 to 800 and 1,600. Classification still searches markers in order. These are operation counts without timing assertions or a claim about complete simulation time.

## RoomPlan walls order opening heights once

`roomWalls.test.ts` checks solid coverage, volume, overlap, boundaries, edits and source preservation. A scratch comparison matched 2,000 complete ordered outputs against the previous implementation across 1,000 generated scans and subsequent edits. On crowded single walls with 300 and 600 windows, complete mapping reduces sort calls from 603 and 1,203 to three, including edge sorting and the object cap. On shared macOS arm64 hardware with Node 26.13.0, median mapping times fell from 4.62 ms and 19.41 ms to 0.44 ms and 1.23 ms. Measurements used 21 alternating three-call batches after five warmups per implementation. These measure wall mapping alone, without CI timing assertions or a claim about complete import time.

## World floor probes reuse projected triangle edges

`floorTriangle.test.ts` compares the previous calculation across 120 translated, rotated and scaled triangles, both windings, tolerance boundaries, degenerate inputs and nonfinite queries. It checks source preservation, replacement geometry and independent preparations. Across 300 and 600 probes, source-coordinate reads fall from 5,400 and 10,800 to 18 during preparation and zero during queries. `worldSurfaces.test.ts` checks cell boundaries, the 64-cell cutoff, large-floor fallback, gaps and floor-height tolerance. These are operation counts and result comparisons, without timing assertions or a claim about complete world-planning time.

## Ground planning reuses obstacle footprints

`groundObstacles.test.ts` checks strict boundaries, rotation and parallel thresholds, all four clearance levels, obstacle order, duplicate ids, source preservation, edits and empty or push-only routes. Both 10- and 20-waypoint fixtures prepare one footprint. A seeded scratch comparison matched 300 complete routes, 6,000 occupancy queries and 30 room starts against the previous implementation. A 20-waypoint detour fixture reduced footprint calculations from 320 to one. A blocked room-center search reduced them from 147 to one. These are operation counts, without timing assertions.

## Captured world parsing

`e2e/worldImport.e2e.test.ts` covers attachment of the rendered world.

## Captured world benchmarks

`node tools/perf/worldBench.mjs --dist dist --scene scratch/rover.json` imports a synthetic 1,000,000-point kitchen splat into a saved rover scene, waits for all points to enter Spark's active set, warms one orbit and measures a second four-second orbit at 1440 × 900. It uses the viewport benchmark's WebGL probes and Chrome's GPU-process trace, records CPU work p95, frame interval p95 and average GPU-process work per rendered frame, and fails when CPU work p95 or GPU-process work exceeds 16 ms. `--cpu` selects SwiftShader, `--budget` changes that explicit budget, and `--output` chooses the JSON report (default `scratch/perf/world.json`). No GPU measurement has been recorded for this change. GPU-process work measures Chrome's submission work rather than hardware execution time. The decomposition test’s 200,000-triangle worker budget is 10 seconds. Run `src/cases/worldDecomposition.perf.test.ts` with `vitest.perf.config.ts` for that measurement. It transfers a tessellated kitchen into a bundled worker and checks the gap under its table. The initial direct 200,000-triangle box measurement took 17.95 seconds before boundary-preserving collision simplification was added. This is a local measurement, not a CI result.
