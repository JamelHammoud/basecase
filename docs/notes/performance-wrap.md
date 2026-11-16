# Robot shells performance

Implementation: [Robot shells](../guide/joints-and-motion.md#performance-robot-shells). Shared requirements: [Performance](../guide/performance.md).

## Shell distance masks read triangle coordinates once

`cellMask.test.ts` compares 140 generated fixtures with the previous construction and checks negative boundaries, typed-array views, incomplete triangles, source edits and independent masks. Its 300- and 600-triangle fixtures reduce source-coordinate reads from 5,400 and 10,800 to 2,700 and 5,400. These are operation counts without timing assertions or a claim about complete Wrap Robot time.

## Shell sweeps prepare triangle interpolation once

`sweepSampling.test.ts` checks edited geometry, independent rasters and source-read budgets. Its 300- and 600-triangle fixtures reduce coordinate reads from 167,400 and 334,800 to 2,700 and 5,400. `sweepRaster.test.ts` checks triangle-interior queries against direct surface scans. A scratch comparison matched 200 complete raster states and 50,000 queries against the previous sampler. These are operation counts and numerical comparisons, without timing assertions or a claim about complete Wrap Robot time.

## Shell carve fields prepare interpolation once

`gridField.test.ts` checks independently calculated field values, fractional queries, boundaries, empty fields, source edits and independent rebuilds. Its 300- and 600-query fixtures reduce mapped-array allocations from 900 and 1,800 to zero. A scratch comparison matched 42,280 probes exactly against the previous interpolator across 40 grids, including non-finite coordinates. These are allocation counts and numerical comparisons, without timing assertions or a claim about complete Wrap Robot time.
