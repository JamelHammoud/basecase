# Selection performance

Implementation: [Selection](../guide/inspector-and-selection.md#performance-selection). Shared requirements: [Performance](../guide/performance.md).

## Boolean groups prepare frame rotations once

Whole-app search found one shared boolean frame follower, `src/booleans/frames.ts`, called by `editWithOperands`. It handles result movement, rotation and resizing across gizmo, Inspector and agent edits. Each changed group now prepares its source-frame inverse and target-relative rotation once, rather than once per operand. Nested groups prepare their own transforms. Scaling uses the operand's own quaternion for local orientation, keeping the shared inverse unchanged. Multiplication association, rounding and dimension formulas stay unchanged.

For a changed group with 32 operands, inverse calculations fall from 32 to 1, and target-relative quaternion products fall from 32 to 1. Quaternion clones fall from 64 to 33. These are structural operation counts, not timings or an end-to-end latency claim. `frames.test.ts` asserts one inversion for the 32-operand fixture and no additional inversion when synchronizing the unchanged result.

The same test compares complete results with the former transform arithmetic for Union, Subtract and Intersect, with mixed operand rotations, nested groups, nonuniform resizing and subsequent edits. It checks untouched source records and retained dimension references for rigid movement. Existing `booleans.test.ts` covers edits through `editWithOperands`, geometry evaluation, saved results and move-only hash stability. No visible state, user action, copy, browser test, timing gate or quarantine changes.

## Rotated bounds calculate half extents directly

`src/utils/selection.ts` removes six temporary arrays per ordinary rotated part: half sizes, mapped Euler angles, the matrix and its three rows. The returned extent tuple remains independently owned. Unrotated parts avoid the two size and angle arrays. Affine sheets still use `affineBounds`. A source search found no second Euler half-extent matrix implementation to change.

On 16 November 2026, a scratch Vitest comparison ran on an Apple M5 Pro, macOS arm64 and Node v26.13.0. Each batch evaluated 2,048 parts 100 times with varied rotations and dimensions. After one warm-up batch per version, nine alternating batches had medians of 28.14 ms before and 9.87 ms after, a 64.9% reduction. Results contributed to a retained checksum. The comparison used the previous helper from git and asserted exact output parity for all fixture parts, plus zero, signed zero, infinite and NaN rotations. This isolates ordinary half-extent calculations, excluding rendering, affine sheets and browser interaction. Local timings are not CI results or an end-to-end latency claim.

`selection.test.ts` now compares six mixed, negative, cardinal and multi-turn rotations with Three.js box bounds. Existing selection, alignment and sheet tests retain command and affine coverage. No user action, copy, control or visible state changes, so the existing Align and Spread help article remains accurate. No timing assertion, retry or quarantine is added.

## Selecting groups uses membership sets

`workspace/selection.scale.test.ts` checks interleaved groups, selection order and every selection subset for click modifiers, with array-read budgets on 600-part fixtures. Group expansion previously took 271,500 reads and a fully selected group toggle through a click took 543,301 reads on those fixtures.

## Boolean drill picking accumulates surface gaps directly

`booleans/picking.ts` removes the mapped and flattened gap arrays for each operand, the scored operand array and its ranking records. A single intersection array replaces one result array per probe. Probe geometry construction and Three.js raycasting remain unchanged.

On 16 November 2026 UTC, a scratch Vitest comparison ran on an Apple M5 Pro, macOS arm64 and Node v26.13.0. Each batch made 100 picks across 32 box operands, with 256 controlled intersections per probe. After one warm-up batch per version, seven alternating before and after batches had medians of 55.51 ms and 47.13 ms, a 15.1% reduction. Every pick selected the same first operand. The comparison used the previous picker from git and the changed picker with identical geometry builders. Controlled intersections isolate result processing and geometry setup, excluding real raycasting, rendering and browser input latency. These local timings are not CI results or an end-to-end interaction claim.

`src/booleans/picking.test.ts` uses real geometry to cover entry and exit faces, equal-distance ties, misses and edited operands. Its existing cut-surface test exercises drilling through the result into solid and cutout operands. The targeted related run passed four files and nine tests. No timing assertion or quarantine was added.

## Align retains measured bounds

`src/utils/selection.ts` retains bounds by selected part object for the duration of Align. The previous path measured bounds once for the target and again for each position update. The target now accumulates only the requested axis from retained bounds. Spread already retains its measurements, and no other Align implementation exists in the app.

For a selection of 64 distinct parts, bounds measurements fall from 128 to 64. Ordinary rotated parts read dimensions 448 times before and 256 times after, including the read from copying each output part. Affine sheets read dimensions 192 times before and 128 times after. These are operation counts derived from the previous path, with the new counts asserted by `src/utils/selectionAlignment.test.ts`. They are not timings or an end-to-end latency claim. A single unlocked part still needs one measurement.

The test covers all three axes and all three anchors on 64-part rotated and affine fixtures, duplicate and missing ids, locked parts, untouched references, source preservation, repeated object references and fresh dimensions after edits. Existing `selection.test.ts` and `sheetSelection.test.ts` retain coverage of origin alignment, rounding, mixed selections and rendered sheet bounds. No browser behavior, control, copy, timeout or quarantine changes.


## Marquee reuses its ray-grid workspace

A whole-app search of `setFromCamera` found one rectangular selection ray grid, in `src/three/viewport/marquee.ts`. Plate and ordinary pointer picking cast individual rays. Mark projection already consumes retained coordinates. This change covers the complete marquee grid without changing those separate paths.

Each selection still casts 49 rays in the same column-first order. Coordinate vectors fall from 49 to 1, intersection result arrays from 49 to 1, and mapped ID arrays from 49 to 0. The intermediate collected ID list and its final traversal are removed. Each probe clears the shared hit array before raycasting, then adds selectable IDs directly to the existing set. Three.js still owns individual intersection records and sorts each probe by distance. These are structural allocation counts, not timings or an end-to-end latency claim.

`marquee.test.ts` drives the installed pointer listeners against real Three.js planes and an orthographic camera. Large planes have no vertices inside the rectangle, so selection requires the ray grid. Coverage includes every overlapping selectable surface, first-hit order, duplicate elimination, locked and hidden parts, missing scene records, edited geometry, subsequent drags, empty results and coordinate and intersection-array identity across all probes. No action, control, copy or visible state changes, so existing selection help remains accurate. No timeout, retry or quarantine changes.
