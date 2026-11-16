# Image comparison performance

Implementation: [Image comparison](../guide/agent.md#performance-image-comparison). Shared requirements: [Performance](../guide/performance.md).

## Traced contours avoid temporary row lists

`outlineTrace.ts` removes two mapped edge lists, one reversed row copy and ten pairs of sliced rows and mapped widths per nonempty trace. That removes 23 temporary arrays containing five times the occupied-row count in total entries. Ring points and sampling buffers remain owned by each call.

`outlineTrace.test.ts` checks single-row winding and caps with exact coordinates, scale, offset, sparse-row bands, source preservation and independent results. A scratch comparison matched complete outputs against the previous implementation on 1,000 generated masks. Widths ranged from 1 to 29 pixels and heights from 1 to 43, with empty rows, nonbinary pixels, four scales, four sample counts and seven offsets.

On macOS arm64, Apple M5 Pro and Node 26.13.0, a filled 40 × 600 mask sampled at 24 points took median times of 0.03058 ms before and 0.02618 ms after. Five warmup batches preceded 21 alternating measured batches of 1,000 traces. The temporary arrays held 3,000 entries per call before the change. These shared-host measurements cover tracing alone, without a CI timing assertion or a claim about complete photo-tool time. The throwaway comparison is `scratch/outlineComparison.test.ts` during implementation and isn't committed.

## Outline distances propagate one minimum per cell

`targetDistance.test.ts` compares every binary pattern on nine grids through twelve cells, 160 generated masks and later edits, long diagonals, source views, independent outputs and both comparison paths. On empty 300 × 10 and 600 × 10 masks, distance-buffer reads fall from 38,144 and 76,544 to 23,840 and 47,840, with no writes added. These are operation counts without timing assertions or a claim about complete comparison time.

## Photo outlines simplify through index ranges

`simplifyPolygon.test.ts` compares 1,800 open, closed and reflected outline queries with the previous calculation, including frozen inputs, ties, repeated points and later edits. Its 48-ray fixture removes 75 slice calls and 25 concatenations. A scratch comparison matched 120 complete photo analyses at three raster sizes. These are operation counts and output comparisons, without timing assertions or a claim about complete attachment time.

## Photo outline ranges prepare one baseline

`simplifyPolygon.ts` calculates each range's endpoint direction and squared length once, instead of recalculating them for each interior point. The existing `simplifyPolygon.test.ts` parity coverage checks the previous recursive calculation across 1,800 queries and boundary cases. Repository searches found no other point-list simplifier. Sketch's similarly named distance helper evaluates constraints rather than simplifying outlines.

On macOS arm64 with Node 26.13.0, the existing 48-ray, seed-3 outline fixture at tolerance 0.022 matched the previous result. Proxy-counted coordinate reads fell from 2,428 to 1,656. After five warmup batches, 21 alternating measured batches of 5,000 simplifications gave median times of 0.01262 ms before and 0.00973 ms after. The benchmark compared the pre-change range implementation with the new implementation. These shared-host measurements cover simplification alone, without a CI timing assertion or a claim about complete photo-tool time. The throwaway benchmark lives in `scratch/outline-bench.ts` during implementation and isn't committed.

## Mask bounds and row extents share one scan

`maskRows.test.ts` checks direct measurements, sparse masks, holes, nonbinary pixels, narrow and empty images, edits, source preservation and independent results. Its filled 40 × 300 and 40 × 600 profile and tracing fixtures read 12,000 and 24,000 pixels instead of 24,000 and 48,000. Scratch comparisons matched 3,200 band/profile results, 400 traced outlines and 400 complete target fits exactly against the previous implementation. On shared macOS arm64 hardware with Node 26.13.0, ten-profile batches on a seeded 600 × 600 mask took medians of 20.33 ms before and 9.17 ms after, across 30 alternating measurements after five warmups. These measure profile calculation alone, without CI timing assertions or a claim about complete photo-tool time.

## Camera alignment prepares masks once

`viewFitAlignment.test.ts` compares fresh-raster scoring on 60 seeded mask pairs, including source edits, empty masks, ties and result ownership. On empty 64 × 48 and 128 × 96 masks with 27 candidates, model pixel reads fall from 86,016 and 344,064 to 3,072 and 12,288. These are operation counts for mask preparation, without timing assertions or a claim about complete camera fitting time.

## Image floods queue each open pixel once

`pixelFlood.test.ts`, `imagePixelAnalysis.test.ts` and `targetFit.test.ts` check boundaries, enclosed regions, measurements and traversal counts. A blank 128 × 96 photo took 49,152 stack removals before this change and 12,288 after it. This is an operation count, not a wall-clock measurement.

## Target alignment reuses one raster

`targetAlignment.test.ts` compares exhaustive resampling across aspect ratios, scales, all nine combinations of offsets −4, 0 and 4, unchanged inputs and first-offset ties. On its 240 × 240 fixture, target data-property reads fall from 4,665,601 to 57,601, including the bounds scan's one property read. These are operation counts, without timing assertions.

## Comparison overlays reuse four colors

`targetOverlay.test.ts` compares every byte with the previous renderer across six scales, all four colors, nonbinary masks, changed inputs and independent results. Its 300- and 600-cell fixtures at 3× scale remove 5,400 and 10,800 temporary color arrays respectively. The four palette arrays are shared across renders, while each result owns its output buffer. These are allocation counts, without timing assertions or a claim about complete comparison time.

## Photo border medians use fixed histograms

`silhouette.test.ts` checks those boundaries, RGB extremes, enclosed background, narrow images and source preservation. A scratch comparison matched the previous masks and refusal results on 600 seeded images. On macOS with Node 26.13.0, rejecting one seeded 900 × 900 busy image took a median of 2.23 ms before and 0.13 ms after, over 25 alternating measurements after five warmups per implementation. This measures the busy-background refusal path, without a CI timing assertion or a claim about full photo-tool latency.

## Photo regions copy contiguous rows

`cropMask.test.ts` compares the previous pixel loop across 90 regions on five mask shapes, including fractional bounds, clipped and reversed regions, nonfinite bounds, zero dimensions, nonbinary pixels and offset buffer views. It also checks incomplete buffers, unchanged sources, edits and independent outputs. Existing `outlineTrace.test.ts` and `photoScale.test.ts` exercise tracing and known-part scaling through the shared cropper.

On macOS arm64 with Node 26.13.0, a scratch comparison cropped the middle 80% of each axis of deterministic nonbinary masks. Each implementation had three warmup batches and eleven alternating measured batches of twenty crops. Complete results matched before timing. Median milliseconds per crop were:

| Mask | Before | After |
| --- | --- | --- |
| 300 × 400 | 0.1092 | 0.0702 |
| 1568 × 1568 | 1.9787 | 0.2231 |

The cropper replaces per-pixel JavaScript copies with one native typed-array copy and one temporary buffer view per selected row. It still allocates a zeroed output the size of the source buffer. These local shared-host measurements cover cropping alone, without a CI timing threshold or a claim about complete photo-tool time.

The initial parity fixture compared 90 crops at 300 × 400 through recursive assertions and exceeded the five-second test limit at 7.19 seconds. The retained suite uses a 31 × 43 mask for that shape, preserving all region cases. Larger masks stay in the on-demand benchmark. No timeout was raised.
