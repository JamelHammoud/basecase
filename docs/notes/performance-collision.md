# Collision analysis performance

Implementation: [Collision analysis](../guide/build.md#performance-collision-analysis). Shared requirements: [Performance](../guide/performance.md).

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
