# Collision analysis performance

Implementation: [Collision analysis](../guide/build.md#performance-collision-analysis). Shared requirements: [Performance](../guide/performance.md).

## Joint sweeps prepare their pivot frame once

`sweepRotation.test.ts` compares exact matrices against the previous calculation across 100 seeded pivot and axis combinations, repeated angles and degenerate or nonfinite axes. Separate preparations retain independent workspaces and read edited origins and axes. A real two-box sweep compares complete batched reports against independent single-angle sweeps, including obstacle interference, floor penetration, repeated angles, empty angle lists and unchanged source placements.

The 300- and 600-angle fixtures reduce axis normalizations from 300 and 600 to one, and translation builds from 600 and 1,200 to two. The composed rotation retains one matrix identity across all angles. Rotation preparation owns four matrices per sweep instead of allocating three per angle, while moving placements still own their separate matrices. These are operation and storage counts, without timing assertions or a claim about complete collision-check time. No preparation is shared between sweeps, and per-angle collision and floor queries retain their existing work.

## Rotor classification prepares its output line once

`lineDistance.test.ts` compares Three's unbounded projections across 12,000 seeded queries, degenerate lines, nonfinite values and independent preparations. Its 300- and 600-probe fixtures reduce dot products from 600 and 1,200 to 301 and 601. `rotorSplit.test.ts` compares complete partitions across 90 translated and scaled meshes near axis and reach limits, preserving source arrays and cached results. These are operation counts and result comparisons, without timing assertions or a claim about complete check time.

## Coplanar contact scans reuse one triangle workspace

`coplanarNormals.test.ts` compares contact reports with the allocating calculation across 200 transformed shape pairs, including reversed winding, different tessellations and changed placements. Its 300- and 600-sample fixtures retain one triangle and three corner vectors per scan instead of 300 and 600 triangles with 900 and 1,800 corner vectors. Repeated calls own separate workspaces and read edited normals. These are workspace counts, without timing assertions or a claim about complete collision-check time.

## Face subdivision writes centers directly

`facePieces.test.ts` covers these boundaries and independent buffers. Its 300- and 600-face fixtures reduce center vectors from 1,200 and 2,400 to one per sampler. A scratch comparison matched all face buffers exactly across 80 generated meshes and 378,425 samples. On macOS arm64 with Node 26.13.0, 15-sampler batches on 1,200 triangles and 4,800 samples took medians of 3.04 ms before and 2.04 ms after. Each used 15 alternating measurements after five warmups per implementation. These measure face sampling alone, without CI timing assertions or a claim about complete check time.

## Coplanar comparisons reuse sampled surface area

`shapeSolid.test.ts` checks subdivision, sampling stride, discarded faces, empty shapes, source preservation and replacement geometry. Its 300- and 600-face fixtures reduce summed entries across repeated queries from 90,000 and 360,000 to 300 and 600. These are operation counts, without timing assertions or a claim about complete collision-check time.

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

## Collision pairs share prepared containment directions

`collisionDirections.test.ts` drives real BVH collision checks on four and eight overlapping, rotated box placements. Every pair reports interference, matching independent two-part calls in value and order. Direction preparation falls from nine vector clones and transforms per pair to three per participating placement. The fixtures reduce transforms from 54 to 12 and from 252 to 24. A changed-frame case rotates an existing placement that remains overlapping and moves another placement clear, updating their matrices, inverses and boxes between calls. It retains the independent pair reports, requires three fresh direction transforms for the rotated placement and confirms that the isolated part prepares no directions. The original case only moved a part clear, leaving its edited inverse unused by collision probes.

These are operation counts, without timing assertions or a claim about complete collision-check time. The cache lasts only for one collision call and does not share preparation across sweep angles. Existing containment, crossing, coplanar and servo-sweep tests continue to cover the surrounding geometry calculations.

## Containment samples write into their final buffer

`solidSamples.test.ts` compares exact Float32 output against the previous buffered calculation across 16 coordinate counts and 11 budgets. Cases include empty and incomplete triangles, fractional budgets, vertex-stride transitions, centroid limits, unchanged sources and independent caches for replacement shapes and different budgets.

For a 1,200-vertex shape, budgets of 300 and 600 produce 400 and 800 samples. Previously these retained temporary JavaScript lists of 1,200 and 2,400 coordinate entries, then copied every entry into Float32 storage. The sampler now allocates only the final 4,800-byte and 9,600-byte buffers. Its sizing pass walks selected indices without reading coordinates or retaining entries. Cache hits still return the existing buffer. These are storage and copy counts, without timing assertions or a claim about complete collision-check time. Existing analysis and servo-sweep tests cover the surrounding collision pipeline.
