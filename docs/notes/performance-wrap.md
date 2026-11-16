# Robot shells performance

Implementation: [Robot shells](../guide/joints-and-motion.md#performance-robot-shells). Shared requirements: [Performance](../guide/performance.md).

## Shell field bounds merge in one pass

The shared `merged` helper in `fieldSolid.ts` serves all three Wrap Robot call sites: live region bounds, sweep raster bounds and prismatic endpoint bounds. Each nonempty merge previously allocated a filtered box list, two axis lists and six coordinate lists before producing its two result arrays. It now allocates only the two result arrays and visits boxes once. For 100 and 1,000 present boxes, this removes nine temporary arrays holding 706 and 7,006 entries respectively. Coordinate reads remain six per present box. These are source-derived allocation counts, without wall-clock measurements or a claim about complete Wrap Robot time.

`fieldSolid.test.ts` compares the previous equations over every suffix of 70 generated collections containing nulls, signed zero, infinities, NaN and degenerate bounds. It checks owned results, unchanged sources and fresh reads after edits. A 160,000-box collection checks bounds without argument spreading. Existing `wrapCore.test.ts` and `wrapPlan.test.ts` cover generated shell clearance and scene integration. The change has no UI state or workflow changes, so no help screenshot or browser test is added.

## Shell distance masks read triangle coordinates once

`cellMask.test.ts` compares 140 generated fixtures with the previous construction and checks negative boundaries, typed-array views, incomplete triangles, source edits and independent masks. Its 300- and 600-triangle fixtures reduce source-coordinate reads from 5,400 and 10,800 to 2,700 and 5,400. These are operation counts without timing assertions or a claim about complete Wrap Robot time.

## Shell sweeps prepare triangle interpolation once

`sweepSampling.test.ts` checks edited geometry, independent rasters and source-read budgets. Its 300- and 600-triangle fixtures reduce coordinate reads from 167,400 and 334,800 to 2,700 and 5,400. `sweepRaster.test.ts` checks triangle-interior queries against direct surface scans. A scratch comparison matched 200 complete raster states and 50,000 queries against the previous sampler. These are operation counts and numerical comparisons, without timing assertions or a claim about complete Wrap Robot time.

## Shell carve fields prepare interpolation once

`gridField.test.ts` checks independently calculated field values, fractional queries, boundaries, empty fields, source edits and independent rebuilds. Its 300- and 600-query fixtures reduce mapped-array allocations from 900 and 1,800 to zero. A scratch comparison matched 42,280 probes exactly against the previous interpolator across 40 grids, including non-finite coordinates. These are allocation counts and numerical comparisons, without timing assertions or a claim about complete Wrap Robot time.
