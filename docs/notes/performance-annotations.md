# Annotation projection performance

Implementation: [Annotation projection](../guide/annotations.md#performance-annotation-projection). Shared requirements: [Performance](../guide/performance.md).

## Comment attachments resolve in linear work

`annotationAttachments.test.ts` checks positions, names, replies, missing parts and edits through both pipelines, with linear ID-read budgets for 300 and 600 parts and comments. The previous export read 721,200 part IDs on the 600-item fixture. Spatial relationship inference is separate and still compares visible part pairs.

## Stroke attachment probes reuse their workspace

Whole-app search found one world-point stroke attachment loop, `three/viewport/markParts.ts`, reached through `markParts` when moving a mark. It now copies each sampled point into one direction vector and passes one cleared intersection list to Three.js. Both buffers belong to the call. Sampling, normalization, ray origin, nearest-hit selection and first-seen ID order remain unchanged. Other pickers use individual rays or a screen-space marquee grid, rather than this stroke attachment path.

For 48 stroke points, direction vectors and result lists fall from 48 each to one each. For 600 points, the existing stride of 13 visits 47 points, reducing both counts from 47 to one. Three.js still allocates intersection records and performs the same geometry queries. These are structural allocation counts, not timings or an end-to-end latency claim.

`three/viewport/markParts.test.ts` uses overlapping and separate real box meshes to check nearest-hit selection, deduplication, first-seen order, misses after hits, empty input, later placement changes and unchanged stroke points and camera position. Fixtures of 48, 49, 96, 97 and 600 points assert the unchanged sampling count and one direction and intersection buffer per call. No UI state, action, copy, screenshot, browser walkthrough, timeout or quarantine changes.

## Mark picking normalizes only the nearest distance

Whole-app search found one annotation polyline distance helper, `three/viewport/markMath.ts`. `MarkLayer.distances` uses it for `hitTest` and `hits`, covering click selection, drag targeting, hover and erasing. Stroke length, closure and eraser spacing require their individual segment lengths and keep their existing calculations.

For a 400-point mark, distance normalization falls from 399 `Math.hypot` calls to one final `Math.sqrt`. For 800 points, it falls from 799 calls to one. Segment projection and comparison remain linear, every point is still projected once, and the two endpoint buffers remain shared. These are source-derived operation counts, not timings or a measured interaction latency improvement. Squared calculations operate on projected pixel coordinates.

`markMath.test.ts` checks diagonal projections, vertical segments, both endpoint clamps, reversed traversal and exact hits against analytic distances. Existing cases cover loops, empty and single-point inputs, repeated endpoints, edits and 400- and 800-point projection counts. Related `markLayer.test.ts` covers actual projected selection and erasure hit thresholds and label picking. No controls, copy, workflow, screenshots, browser walkthroughs or quarantine conditions change.
