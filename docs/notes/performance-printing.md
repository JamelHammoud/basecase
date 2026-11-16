# Print planning and labels performance

Implementation: [Print planning and labels](../guide/printing.md#performance-print-planning-and-labels). Shared requirements: [Performance](../guide/performance.md).

## Fleet relocation retains plate bounds

For a successful relocation of N items, the previous path measured the footprint twice. Each measurement allocated six N-entry arrays and N rectangle objects. It visited items once to build rectangles and once for heights, then visited rectangle fields through four mapped arrays and their extrema scans. Relocation now measures bounds in one item scan with five scalar extrema and reuses them for fitting and translation. Diagonal items also share absolute sine and cosine between both extents. The existing moved-item and matrix output allocations remain.

`src/print/fleetFootprint.test.ts` compares 120 complete bounds, fit and relocation cases against the previous calculation. It covers negative and diagonal rotations, axis-aligned yaw, copied items, bed obstacles, margins, refused placements, empty plates, edited inputs and unchanged sources. Additional cases compare NaN, infinities and signed zero in each placement field. Getter instrumentation on successful 300- and 600-item relocations records 600 and 1,200 yaw reads, including the returned item copies. The previous two measurements plus returned copies required 1,500 and 3,000 reads. These are operation counts, without timing assertions or a claim about complete sending time. Existing fleet and obstacle tests cover eligibility and placement integration. No UI, workflow or browser coverage changes are needed.

## Project filaments retain material matches

`print/projectJob.test.ts` compares filament order, colors and every object's assignment against the previous lookup rules over 80 generated tray lists. It covers mixed case and material suffixes, duplicate slots, external and negative slots, missing materials, malformed colors, copied objects, unchanged sources and edited tray order. Existing `print/project.test.ts` covers complete worker-written project archives and the single-material path.

On four materials with one tray each in material order, the previous comparator and color construction read tray types 41 times in a local Node replay. Preparation now reads them ten times, once for each prefix visited during the four material searches. The test counts reads through tray getters and checks fresh preparation after an edit. Every object also replaces its ordered-material search with a map lookup. These are operation counts, without timing assertions or a claim about complete export speed. Tray lists and material counts are small. No browser flow, on-screen state or archive format changes.

## Welding rejects collapsed triangles as they arrive

The shared welder removes the post-weld traversal and temporary JavaScript index list. For 30,000 triangles without collapsed faces, it removes 90,000 post-weld typed-index reads, 90,000 temporary list entries and the subsequent 90,000-entry typed-array copy. The existing index buffer becomes the result. For a mesh with half its triangles collapsed, the temporary 45,000-entry list is gone, while a typed copy of the retained prefix preserves exact buffer sizing. Welding still checks three indices per triangle during construction. These are structural operation counts, not wall-clock or complete export measurements.

`src/print/threeMf.test.ts` compares 80 generated 90-triangle soups with mixed collapsed faces against an independent reference. It also checks first-seen coordinates after quantization, winding and ordering, unchanged inputs, empty and fully collapsed meshes, and exact-sized output buffers. Other welders in CAD import, kernel meshes and mesh simplification have different rounding or face-retention rules and do not use the removed filtering pass. No browser flow or on-screen state changes.

## Plate statuses share prepared print history

`print/plateStatus.test.ts` compares the previous scan across 120 generated histories in both input orders, plus frozen inputs, repeated queries and later edits. With 100 and 200 records and unmatched plate queries, record-hash reads fall from 10,000 and 40,000 to 100 and 200. On all-replacement fixtures of those sizes, record-part-list reads fall from 20,000 and 80,000 to 200 and 400. These are operation counts without timing assertions or a claim about complete printing time.

## Printed-label plane areas accumulate during grouping

`labelFaces.test.ts` checks 80 transformed indexed boxes, exact threshold boundaries, disconnected faces, winding, degenerate triangles, typed-array views, edits and independent output buffers. On its 300- and 600-triangle rejected-plane fixtures, area measurements fall from 600 and 1,200 to 300 and 600. Retained faces also skip that area-only pass. These are operation counts without timing assertions or a claim about complete plate-writing time.

## Printed-label samples locate triangles with binary lookup

`labelSamples.test.ts` compares every coordinate across 360 generated face inputs, plus degenerate, nonfinite and edited geometry. `surfaceSampleIndex.test.ts` checks repeated boundaries, double precision, typed-array views and logarithmic read bounds. On equal-area 300- and 600-triangle fixtures, the 40 label searches reduce cumulative-area reads from 6,829 and 13,636 to 329 and 370. These are operation counts, without timing assertions or a claim about complete plate-writing time.

## Printed-label fitting visits centers only as needed

`labelFit.test.ts` compares 320 complete fits with exhaustive preparation across rectangles, holes, notches, rotations, rejected fits and later edits, and checks centroid ties and empty geometry. On 300- and 600-triangle square fans, triangle-coordinate reads for containment fall from more than 15,000 and 30,000 to at most six when the centroid fits at full size. These are operation bounds without timing assertions or a claim about complete plate-writing time.

## Printed-label fitting prepares boundary segments once

`labelBoundary.test.ts` compares 6,000 generated boundary queries with independent segment intervals and checks parallel, zero-length, reversed and touching edges, precision, state reset and source preservation. Its 300- and 600-edge fits read each source coordinate once. A scratch comparison matched 720 complete fits against the previous implementation across rectangles, notches, holes and subsequent edits. On subdivided 20 × 12 mm rectangles with AA labels, source-coordinate reads fell from 425,872 and 850,704 to 1,200 and 2,400. On shared macOS arm64 hardware with Node 26.13.0, median fit times fell from 2.85 ms and 5.52 ms to 0.59 ms and 0.62 ms. Measurements used 21 alternating ten-call batches after five warmup batches per implementation. These measure fitting alone, without CI timing assertions or a claim about complete plate writing time.

## Fit coupons skip hosts that cannot win

`fitCouponHosts.test.ts` compares complete coupons with exhaustive host selection across transforms, ties, disconnected geometry, the 0.5 mm contact tolerance, missing hosts and edited placements. Its 300- and 600-host fixtures reduce mesh-box queries from 300 and 600 to one each. These are operation counts, without timing assertions or a claim about complete fit-test time.

## Diagonal bed fits retain polygon projections

`bedProjection.test.ts` checks rotated, reflected, collapsed and nonfinite footprints, tolerance boundaries, source preservation and edited beds. Across two overlapping candidate footprints and 300 or 600 keep-outs, coordinate reads fall from 96,000 and 192,000 to 52,896 and 105,696. A scratch comparison matched 10,000 complete fits against the previous calculation, including 164 diagonal fits and 5,188 refusals. On shared macOS arm64 hardware with Node 26.13.0, batches of five passes over those fixtures took medians of 107.25 ms before and 89.51 ms after. Each used eleven alternating measurements after five warmups per implementation. These measure bed fitting alone, without CI timing assertions or a claim about complete print planning time.

## Plate packing selects both orientations in one scan

`packSpot.test.ts` checks 2,400 seeded queries, ties, tolerance boundaries, nonfinite values, source preservation, edits and result ownership. Its 300- and 600-rectangle fixtures reduce free-list visits from 600 and 1,200 to 300 and 600. A scratch comparison matched 500 complete layouts across 10,900 items, including build steps, fixed positions, pinned plates, keep-outs, gaps and diagonal placements. These are traversal counts and output comparisons, without timing assertions or a claim about complete packing time.

## Print orientations share triangle calculations

`printOrientation.test.ts` checks box contact areas, support hits and misses, angle and contact limits, tilted faces, degenerate triangles, source preservation, cache reuse and coordinate-read bounds for both batch paths. A scratch comparison matched complete reports on 30 transformed meshes and 90 manual-face requests exactly against the previous scorer. With ten candidates, 300- and 1,200-triangle fixtures reduced coordinate reads from 99,900 to 75,600 and from 399,600 to 302,400. Vector cross products fell from 7,602 to 4,902 and from 18,410 to 7,610, including BVH work. These are operation counts, without timing assertions.
  Support queries also reuse one ray and its origin and direction vectors for the entire batch. `printSupport.test.ts` compares exact costs and cast coordinates against the previous per-query allocation on supported meshes. Its 10- and 20-subdivision roofs make 606 and 2,406 support queries, each using one ray instead of a new ray and centroid clone per query. Automatic scoring keeps this ray separate from wall-thickness sampling. Later batches and changed geometry use fresh workspaces. These are allocation counts, without timing assertions or a claim about complete print-planning time.

## Print connected-component lookups compress their full paths

`print/componentGrouping.test.ts` checks membership, ordering, repeated joins, cycles, unchanged inputs and map-read budgets at 300 and 600 items. On the 600-item fixtures, total map reads fell from 721,798 to 4,792 for descending print joins, and from 368,996 to 10,198 for descending coplanar triangles. These are operation counts, without wall-clock assertions.

## Wall probes use scalar sample coordinates

The shared wall-thickness sampler no longer returns a temporary two-number array for each ray. A local replay compared complete printability reports and every support and wall cast coordinate against the previous implementation. Nine rotated and translated boxes combined 0.1, 1 and 10 scale factors with 1, 3 and 10 face subdivisions. Inputs used offset typed-array views and remained unchanged. Empty, degenerate and open triangle inputs also matched exactly.

The six smaller boxes each cast 4,000 wall rays and the three largest each cast 20,000. Temporary sample-pair construction falls from those counts to zero. These are structural allocation counts, without heap measurements, timing assertions or a claim about complete printing time. The replay is session evidence rather than a committed test. Existing `src/three/printability.test.ts` retains thin-panel, dense-mesh, solid-block and blind-pocket coverage. `src/three/printSupport.test.ts` retains support-cost parity, exact support casts and separate wall workspace coverage. No UI or workflow changes require browser coverage.

## Printed-label fallback bounds scan interleaved coordinates

The fallback grid now reads each triangle coordinate once and retains four extrema. For 300 and 600 triangles, the previous two filters visited 3,600 and 7,200 coordinates, copied 1,800 and 3,600 values into two typed arrays, then visited those copies twice for extrema. The new bounds scan reads 1,800 and 3,600 coordinates and allocates no coordinate arrays. These are structural operation counts, not timings or complete plate-writing measurements. Full-size centroid fits still bypass bounds preparation entirely.

`src/print/labels/labelFit.test.ts` retains the 320 complete-fit comparisons across holes, notches, rotations, rejected fits and edits. A dense fallback fixture repeats a ring’s triangles into an offset typed-array view with 192,000 points, comparing the complete result against the small equivalent ring. It checks the centroid is in the hole, so bounds preparation cannot be bypassed. In a local Node replay, spreading 192,000 coordinates into the previous minimum calculation threw `RangeError: Maximum call stack size exceeded`. The scan completed with the expected extrema. The engine’s precise argument limit varies. No UI, workflow or browser coverage changes are needed.

## Resting-face discovery stops when full

A local Node replay compared complete printability reports with the previous implementation on 20 meshes. Boxes, dodecahedra, icosahedra, 16-sided cylinders and 24-sided cones each used four rotations and a translation. Every mesh used an offset typed-array view and remained unchanged. Candidate directions, their order and every report field matched exactly. Empty and degenerate inputs also matched.

Instrumented face-normal clone and normalization counts fell from 18 to 6 for each dodecahedron, from 26 to 6 or 8 for the icosahedra, and from 24 to 6 or 8 for the cylinders. A visited face now normalizes once, including its resting check. After six accepted faces, remaining candidates receive no normalization. Area grouping and sorting still visit all buckets. These are operation counts, not timings or a claim about complete print planning speed.

The replay is session evidence, without a committed instrumentation test. Existing `src/three/printability.test.ts` covers solid blocks, dense and coarse thin panels and blind pockets. `src/three/printSupport.test.ts` covers exact support costs, ray coordinates, automatic and manual pose consistency and separate ray workspaces. No UI state or workflow changes require help or browser updates.
