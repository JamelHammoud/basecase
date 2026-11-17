# Collision analysis performance

Implementation: [Collision analysis](../guide/build.md#performance-collision-analysis). Shared requirements: [Performance](../guide/performance.md).

## Joint sweeps prepare their pivot frame once

`sweepRotation.test.ts` compares exact matrices against the previous calculation across 100 seeded pivot and axis combinations, repeated angles and degenerate or nonfinite axes. Separate preparations retain independent workspaces and read edited origins and axes. A real two-box sweep compares complete batched reports against independent single-angle sweeps, including obstacle interference, floor penetration, repeated angles, empty angle lists and unchanged source placements.

The 300- and 600-angle fixtures reduce axis normalizations from 300 and 600 to one, and translation builds from 600 and 1,200 to two. The composed rotation retains one matrix identity across all angles. Rotation preparation owns four matrices per sweep instead of allocating three per angle, while moving placements still own their separate matrices. These are operation and storage counts, without timing assertions or a claim about complete collision-check time. No preparation is shared between sweeps, and per-angle collision and floor queries retain their existing work.

## Rotor classification prepares its output line once

`lineDistance.test.ts` compares Three's unbounded projections across 12,000 seeded queries, degenerate lines, nonfinite values and independent preparations. Its 300- and 600-probe fixtures reduce dot products from 600 and 1,200 to 301 and 601. `rotorSplit.test.ts` compares complete partitions across 90 translated and scaled meshes near axis and reach limits, preserving source arrays and cached results. These are operation counts and result comparisons, without timing assertions or a claim about complete check time.

## Rotor splits write both partitions directly

Repository search found one shared rotor partition implementation, called by joint sweeps and posed output-rider collision checks. The previous splitter appended each partition to a JavaScript coordinate list, then copied it into a Float32 buffer. The replacement counts moving triangles from cached body ids and routes coordinates directly into two exact output buffers. Classification and cache lifetimes stay unchanged.

`rotorSplit.test.ts` compares exact rotor and stator coordinates for interleaved case and horn triangles at 24, 600 and 1,200 triangles. It checks triangle order, source preservation, independent output buffers, replacement shapes and cached result identity. Existing generated meshes cover 90 classification cases near axis and reach boundaries, including rigid fallback.

The 600- and 1,200-triangle fixtures remove temporary lists holding 5,400 and 10,800 coordinate entries, plus their conversion copies. The retained output buffers still total 21,600 and 43,200 bytes. Sizing reads body ids without reading mesh coordinates. These are structural storage and copy counts, without measured heap usage, timing assertions or a claim about complete collision-check latency. No controls, visible states or user workflow change.

## Coplanar contact scans reuse one triangle workspace

`coplanarNormals.test.ts` compares contact reports with the allocating calculation across 200 transformed shape pairs, including reversed winding, different tessellations and changed placements. Its 300- and 600-sample fixtures retain one triangle and three corner vectors per scan instead of 300 and 600 triangles with 900 and 1,800 corner vectors. Repeated calls own separate workspaces and read edited normals. These are workspace counts, without timing assertions or a claim about complete collision-check time.

The scan also retains its last target face normal. The 300- and 600-sample fixtures cross to the other target triangle and return, reducing target normal calculations from 300 and 600 to three per scan. Each later scan starts fresh. Existing transformed-pair comparisons retain complete report parity across winding and tessellation changes. These are deterministic operation counts, without timing assertions or a claim about complete collision-check time. Only consecutive hits share a normal, so no per-face map or cross-call cache is allocated.

The targeted `check:changed` run selected 78 related files. Collision coverage passed, but the run ended with 581 passing tests and two 5,000 ms timeouts: the scene variant in `cases/fixtureWorkflow.test.ts` and the Carry a cup seeds 1 through 5 in `classroom/grading.test.ts`. Other worktrees were running checks concurrently. This does not establish the cause of either timeout. No timeout, retry or quarantine policy changed.

## Face subdivision writes centers directly

`facePieces.test.ts` covers these boundaries and independent buffers. Its 300- and 600-face fixtures reduce center vectors from 1,200 and 2,400 to one per sampler. A scratch comparison matched all face buffers exactly across 80 generated meshes and 378,425 samples. On macOS arm64 with Node 26.13.0, 15-sampler batches on 1,200 triangles and 4,800 samples took medians of 3.04 ms before and 2.04 ms after. Each used 15 alternating measurements after five warmups per implementation. These measure face sampling alone, without CI timing assertions or a claim about complete check time.

## Coplanar comparisons reuse sampled surface area

`shapeSolid.test.ts` checks subdivision, sampling stride, discarded faces, empty shapes, source preservation and replacement geometry. Its 300- and 600-face fixtures now require no area-buffer reduction across repeated queries. The former cached implementation reduced 300 and 600 entries once before retaining its total. These are operation counts, without timing assertions or a claim about complete collision-check time.

## Triangle crossings reuse query storage

`crossing.test.ts` checks vertex order, winding, triangle order, tolerance boundaries, result ownership, gathering limits, stride order, moved meshes and source preservation. Its 300- and 600-pair fixtures require 2,100 and 4,200 dot products. These are operation counts, without timing assertions.

## Containment stops when its ray votes settle

`containment.test.ts` and `meshQuery.test.mjs` check every three-ray vote sequence, real solid and hollow meshes, boundary points and moved assembly frames. Custom renderer direction lists retain the two-vote threshold. A local before-and-after probe of 300 interior box points reduced BVH traversals from 900 to 600 in each of collision analysis, assembly probes and the kernel, with 300 inside results in both versions. These are operation counts, without timing assertions.

## Agent checks never run on the main thread

A 3 mm bracket (about 1,900 cells) solves in 0.2 s, a 124 mm hollow arm (8,900 cells, the cap) in 0.9 s on an M-series Mac; `engineeringStrength.test.ts` holds the bracket under 2 s of CPU time, which a busy test run doesn't inflate the way it does wall time.

## Collision filters plan eligible partners once

`collisionPairs.test.ts` compares every focus and straddle subset against the previous algorithm, including empty lists, missing ids, skipped pairs, touching boxes and padding boundaries. Its 600-part and 1,200-part one-part sweeps each read part ids once per input part, without wall-clock assertions.

## Visible-share projections reuse one workspace

`visibility.test.ts` checks exact shares for overlapping, rotated, scaled and far-translated meshes, empty geometry and collapsed ranges. A local operation-count comparison on one and two meshes, each with 4,000 cached samples, reduced bounds scans from five to one. Projection-limit reads fell from 40,020 and 80,020 to 20 in both cases. These are operation counts, without timing assertions.

World placement now retains references to the local sample caches and writes transformed coordinates directly into the final combined Float32 buffer. It previously allocated one transformed Float32 buffer per part, copied each into that combined buffer and allocated a transform vector per part. With 4,000 samples per part, scenes of 300 and 600 nonempty parts remove 14,400,000 and 28,800,000 bytes of temporary coordinate storage and the same number of copied bytes. The final points, owner indices and cached local samples remain. These are structural storage and copy counts, not process-memory measurements or a wall-clock speedup claim.

The existing exact-share fixtures cover overlapping, rotated, scaled, far-translated and tied placements. Added coverage compares differently sized caches, interspersed empty parts and later transform edits against independently pretransformed Float32 samples. It checks unchanged local caches. The one- and two-part fixtures now require zero Float32 chunk-copy calls. Repository search found one shared world-sample preparation path for craft review and single-part visibility queries. No controls, workflow, visible state or browser coverage changes.

### Visibility bounds accumulate during world placement

Whole-app search found one world-sample preparation path in `three/analysis/visibility.ts`, shared by craft review and single-part agent visibility queries through the analysis worker. Bounds now accumulate while transformed samples are written. Each coordinate is rounded with `Math.fround` before extending the box, matching the Float32 values the previous `Box3.setFromArray` scan read. Empty bounds, sample order, owner indices, local caches and projection arithmetic stay unchanged.

On November 16, 2026, the existing one- and two-part fixtures use 4,000 cached samples per part. The removed bounds scan loaded 4,000 and 8,000 vectors, or 12,000 and 24,000 coordinates. Placement still loads each local sample once and bounds still perform the same minimum and maximum comparisons. Three explicit Float32 rounding operations per sample replace the old implicit rounding followed by buffer reads. These are source-derived operation counts, without a wall-clock, heap or complete interaction latency claim.

`visibility.test.ts` retains exact shares for overlapping, rotated, scaled, far-translated and tied placements, empty geometry and collapsed ranges. It compares mixed cache lengths and changed transforms with independently pretransformed Float32 samples. Its sized fixtures require no separate bounds scan and exactly one vector load per sample. The related run passed all 51 files and 299 tests locally. No timeout, retry or quarantine changes apply. User actions, labels and visible states stay unchanged, so existing help articles and screenshots remain accurate.

## Collision pairs share prepared containment directions

`collisionDirections.test.ts` drives real BVH collision checks on four and eight overlapping, rotated box placements. Every pair reports interference, matching independent two-part calls in value and order. Direction preparation falls from nine vector clones and transforms per pair to three per participating placement. The fixtures reduce transforms from 54 to 12 and from 252 to 24. A changed-frame case rotates an existing placement that remains overlapping and moves another placement clear, updating their matrices, inverses and boxes between calls. It retains the independent pair reports, requires three fresh direction transforms for the rotated placement and confirms that the isolated part prepares no directions. The original case only moved a part clear, leaving its edited inverse unused by collision probes.

These are operation counts, without timing assertions or a claim about complete collision-check time. The cache lasts only for one collision call and does not share preparation across sweep angles. Existing containment, crossing, coplanar and servo-sweep tests continue to cover the surrounding geometry calculations.

## Containment samples write into their final buffer

`solidSamples.test.ts` compares exact Float32 output against the previous buffered calculation across 16 coordinate counts and 16 budgets. Cases include empty and incomplete triangles, fractional, zero, negative and nonfinite budgets, vertex-stride transitions, centroid limits, unchanged sources and independent caches for replacement shapes and different budgets.

For a 1,200-vertex shape, budgets of 300 and 600 produce 400 and 800 samples. Previously these retained temporary JavaScript lists of 1,200 and 2,400 coordinate entries, then copied every entry into Float32 storage. The sampler now allocates only the final 4,800-byte and 9,600-byte buffers. Sizing now calculates vertex and centroid counts directly from their loop bounds, preserving the initial iteration for a nonfinite stride. It removes both preliminary counting loops. At those budgets this eliminates 400 and 800 counting iterations per uncached shape. Filling still visits each selected sample once. Cache hits still return the existing buffer. These are storage and copy counts, without timing assertions or a claim about complete collision-check time. Existing analysis and servo-sweep tests cover the surrounding collision pipeline.

## Crossing vectors are built only for selected probes

`crossingsOf` is the sole triangle-crossing sampler. `collide.ts` requests 24 crossings for depth probes, including collision reports and joint sweeps. A repository search found no second implementation of this gather-and-select path.

`crossing.test.ts` gathers 300 and 600 accepted crossing pairs with a 24-result budget. The previous implementation cloned two vectors per accepted crossing, giving 600 and 1,200 clones. The revised implementation makes no vector clones in either fixture. Each query owns two scratch vectors and materializes 48 output vectors for the selected 24 crossings. Gathering retains one six-number record per accepted crossing instead of a record referencing two owned vectors. The 2,048-crossing cap, triangle tests, projection arithmetic and stride selection remain unchanged.

The tests compare complete selected points and directions against full-gather filtering across ordinary, zero, negative, fractional and nonfinite budgets. Mutating a returned point or direction leaves a later query unchanged. Existing tests cover tolerance boundaries, transformed meshes, owned results and the gathering cap. These are allocation counts and value comparisons, without timing assertions, measured heap sizes or a claim about complete collision-check time. Scalar records and selected output vectors coexist until the query returns, and the BVH still gathers every crossing needed to determine the stride.

Local validation on 16 November 2026 passed 451 of 452 related tests across 72 files after formatting, lint, documentation and type checks passed. The remaining test, `src/leagues/replay.test.ts`'s catalog-geometry replay case, exceeded its existing 5,000 ms limit. All 452 tests passed in the preceding run, which failed lint because the added assertions made a test group too long. Moving those assertions outside the group resolved lint. The final run passed the crossing tests. The replay timeout's cause was not established, and no timeout, retry, quarantine or League implementation changed. Full logs remain session-local in `scratch/refine-crossing-check.log`.

## Rotor measurements retain each triangle's body record

Whole-app search found one connected-body bounds and reach accumulator in `three/analysis/rotorSplit.ts`. Both joint sweeps and posed output-rider checks use it. Each triangle has one body ID, so the accumulator now retains that body's record across its vertices. Vertex order, bounding-box updates, distance evaluations, maximum accumulation and map insertion order remain unchanged. Measurement records stay local to classification, and the existing per-shape split cache is unchanged.

On November 16, 2026, `scratch/rotor-body-scan.mjs` compared the previous and changed accumulators exactly across 120 generated inputs, including empty inputs and incomplete triangles. Every measurement map matched, and source buffers remained unchanged. Instrumented 300-triangle and 600-triangle fixtures reduced map lookups from 900 and 1,800 to 300 and 600. Map writes fell by the same counts. These are operation counts, without timing assertions, heap measurements or a claim about complete collision-check latency.

Existing `rotorSplit.test.ts` compares complete partitions across 90 translated and scaled classification cases and checks interleaved triangles, rigid fallback, independent buffers, replacement geometry and cache identity. No timeout, retry or quarantine changes apply. No user action, label or visible state changes, so existing help instructions and captures remain accurate.

## Collision pair padding reuses one box

Repository search found one shared broad-phase pair planner in `three/analysis/collisionPairs.ts`. Interference, posed checks, output-riding servo checks and joint sweeps all call it through `collide.ts`. Other expanded boxes belong to separate containment, contact or assembly queries, rather than this pair traversal.

`collisionPairs.test.ts` compares complete ordered pairs with the previous planner and checks touching and padding boundaries, empty bounds, focus, straddle and skip filters. Added 300-part and 600-part fixtures retain the same pairs and source boxes. Box clones fall from 299 and 599 to zero. Each call instead owns one Box3 and its two corner vectors, reducing padded-box workspaces from 299 and 599 to one. Expansion still occurs 299 and 599 times. These are instrumented operation and structural allocation counts, without heap measurements, timing assertions or a claim about complete check latency.

A nested-query fixture checks that a skip callback can run another collision query without overwriting the outer padded bounds. A later source-bound edit changes the next result. No controls, labels or user actions change, so help articles and screenshots remain accurate.

## Face sampling shares area and normal products

`shapeSolid.ts` previously called Three.js `Triangle.getArea` and `Triangle.getNormal` for every accepted face. Both subtract the same edges, cross them and calculate their length. Face preparation now retains one cross product and its length for both results. One edge workspace belongs to the preparation call. Rejected faces still stop at the area threshold.

`facePieces.test.ts` counts 300 and 600 cross products for 300 and 600 accepted triangles, down from 600 and 1,200. Accepted triangles also need one square root instead of two. These are operation counts, not wall-clock or complete collision latency measurements. The checks run in Node on arm64 without a browser or GPU.

The sphere fixture compares every emitted Float32 normal and area weight against the previous Three.js calculation. Existing cases cover reversed winding, the inclusive 0.5 mm² threshold, degenerate and empty geometry, the 12-split cap, 3,000-triangle stride selection, cached buffers and replacement geometry. Barycentric center arithmetic is unchanged. No user action or visible state changes, so help instructions and captures remain accurate.


## Rotor selection uses its measured bodies

Whole-app search found one moving-body selector in `three/analysis/rotorSplit.ts`, shared by joint sweeps and posed collision checks. Selection now traverses the existing measurement map directly. Its size supplies the connected-body count for split eligibility. Triangle membership is prepared once and passed to both classification and partitioning. Measurement arithmetic, center probes, inclusive thresholds, traversal order and shape caches stay unchanged.

Previously each classification created five temporary lists: measured values, reaches, map entries, filtered entries and selected ids. It also constructed a second set by traversing every triangle body id when at least one moving body was selected. The new path retains only the selected-id set and uses the existing measurement map's size. Map iteration still creates entry tuples during selection. It does not change the measurement map or triangle-id buffer.

The added fixtures contain 25 and 50 disconnected stator boxes plus one rotor box, giving 26 and 51 bodies and 312 and 612 triangles. Both compare complete ordered partitions against the previous classifier. On these fixtures, the removed membership-set construction visited 312 and 612 triangle ids. The removed reach lists held 26 and 51 entries each. These are code-derived operation and storage counts, without timing assertions, heap measurements or a claim about complete collision latency.

`rotorSplit.test.ts` also covers empty geometry, 90 translated and scaled boundary cases, connected rigid fallback, interleaved triangles, independent output buffers, replacement geometry and cache identity. Empty geometry remains rigid. No timeout, retry or quarantine changes apply. No user action or visible state changes, so help instructions and screenshots remain accurate.

## Surface totals accumulate during face emission

Repository search found one sampled surface-total implementation in `three/analysis/shapeSolid.ts`. Coplanar comparisons use it to choose the smaller sampled surface, including collision reports and Study grading. Face emission now rounds each weight with `Math.fround` and adds it to the retained total in sample order. This matches the previous Float32-buffer reduction exactly. Empty and discarded-only shapes retain a zero total. Replacement shapes own fresh buffers and totals.

On November 16, 2026, the 300- and 600-face fixtures eliminate the subsequent 300- and 600-entry reductions. The same additions occur inside the existing emission loop. The per-shape nullable total field is removed, and the face record owns its total alongside its buffers. These are source-derived traversal counts, without timing assertions, heap measurements or a claim about complete check latency.

`shapeSolid.test.ts` compares totals exactly with independently summed stored Float32 weights across boxes, spheres, subdivision, stride, discarded faces and empty geometry. It checks independent replacement shapes and zero reductions across repeated queries. Existing face sampling and coplanar report tests cover the surrounding pipeline. No user action, label or visible state changes, so help articles and screenshots remain accurate. No timeout, retry or quarantine changes apply.

## Crossing directions normalize after plane rejection

Whole-app search found one triangle-crossing sampler in `three/analysis/crossing.ts`. Interference reports and joint sweeps share it through crossing-depth probes. The parallel-direction cutoff still runs first. The direction now normalizes only after both triangle-plane cuts pass their strict 0.01 mm tolerance. Accepted pairs retain the same normalization, projection and output calculations.

On November 17, 2026, the 300- and 600-pair fixtures mix rejection at the first plane, rejection at the second plane and the exact tolerance boundary. Each batch ends with one accepted crossing. Direction normalizations fall from 301 and 601 to one. Including the accepted inward direction, total vector normalizations fall from 302 and 602 to two. These are instrumented operation counts, without timing assertions, heap measurements or a claim about complete collision-check latency.

`crossing.test.ts` checks the accepted midpoint and inward direction following each rejected batch. Existing coverage includes vertex permutations, winding, triangle order, parallel and degenerate inputs, short spans, transformed placements, gathering limits, selection order and independent result vectors. No user action, label or visible state changes, so help instructions and screenshots remain accurate. No timeout, retry or quarantine changes apply.

Local `check:changed` validation passed formatting, lint, site copy and types. The first related run passed 88 other files and 664 tests. Its two new assertions failed because `Math.SQRT1_2` differs from Three.js normalization by one floating-point rounding step. The corrected test compares the complete accepted result against the same pair queried alone. The final test-file check passed all 10 crossing tests. Documentation checks passed separately. Logs remain session-local in `scratch/crossing-check.log`, `scratch/crossing-test-check.log` and `scratch/crossing-docs-check.log`.

## Rotor reach scans defer square roots until selection

Whole-app search found one prepared Three.js line-distance query, used only by `three/analysis/rotorSplit.ts`. Joint sweeps and posed output-rider checks share this classifier. Vertex scans now accumulate squared reaches. Selection converts the global maximum and each body maximum that passes the center test back to millimeters. Center tests retain their original square root, inclusive 1 mm allowance and 0.8 reach multiplication. Projection arithmetic, source order and caches remain unchanged.

For the existing 25- and 50-stator fixtures, there are 26 and 51 connected boxes, with 936 and 1,836 triangle corners. The former vertex scan took one square root per corner. The replacement takes none during that scan, then one for the global maximum and at most one per connected body during selection. Center probes still take one per body. These are code-derived operation counts, without timing measurements or a claim about complete collision latency.

`lineDistance.test.ts` compares square-rooted query results exactly against Three.js across 12,000 seeded projections, degenerate lines, nonfinite inputs and extreme coordinates. Its 600-query fixture compares exact squared results and asserts zero square roots. Existing `rotorSplit.test.ts` compares complete partitions for disconnected and interleaved bodies, 90 translated and scaled cases near classification limits, rigid fallback, source preservation and cache ownership. No user action or visible state changes, so help instructions and screenshots remain accurate. No timeout, retry or quarantine changes apply.

The November 17, 2026 `check:changed` run passed formatting, lint, documentation, site copy and types. Related selection ran 66 test files, with 466 tests passing and seven 5,000 ms timeouts. The failures were Bambu Studio archive loading in `electron/print/project.test.mjs`, catalog geometry loading in `leagues/replay.test.ts`, both scene and gallery variants in `cases/fixtureWorkflow.test.ts`, and the first three five-seed Carry a cup groups in `classroom/grading.test.ts`. The line-distance and rotor-partition suites passed. This run does not establish a passing broad related selection. The failures remain unresolved, with no retries, timeout increases or quarantine edits in this refinement.

A subsequent focused `check:changed` run on `lineDistance.test.ts`, `rotorSplit.test.ts` and this note passed all checks, with 14 tests across two files in 237 ms. This isolates the changed classifier without retrying the seven failing workflows.
