# Sheet manufacturing performance

Implementation: [Sheet manufacturing](../guide/build.md#performance-sheet-manufacturing). Shared requirements: [Performance](../guide/performance.md).

## Sheet outline extents use one bounds scan

The thickness-to-width check previously mapped each outline axis twice, once for its maximum and once for its minimum. It now accumulates both axes together through the existing lightweight Sketch bounds primitive. A candidate with N outline vertices needs N outline visits instead of 4N, without four N-element coordinate arrays or spread arguments. Two fixed bound pairs replace the axis list and mapped extent pair, with one bounds object added. Scalar minimum and maximum counts stay unchanged.

A local source replay compared the previous and current detectors across 72 generated plates varying holes, concavity, tilt, wall subdivisions, scale and translation. Complete profiles matched exactly and source triangles stayed unchanged. Both versions also refused a pocket, open caps, empty input and nonfinite input. Array-map instrumentation on the four-corner plate counted five fewer mapped arrays and eighteen fewer mapped elements across complete detection. These are operation counts, without a timing assertion or a claim about total detection speed. The replay lives in session scratch files rather than the test suite. Existing `src/sheet/detectSheet.test.ts` and `src/sheet/sheetProjection.test.ts` retain the detector coverage. No browser interaction, manufacturing rule or screen changes.

## Sheet face normal workspace

Face preparation previously cloned two vertices per triangle to form its edge cross product. One clone became the retained normal, and the other was discarded. The detector now creates each normal directly and reuses one second-edge vector per call. Direct vertex loading also removes each triangle's temporary offset array and mapping callback. Retained vertices and normals remain independent.

A local source replay compared the previous detector with the new detector using `Vector3.prototype.clone` instrumentation. On the existing plates with 300 and 600 wall subdivisions, containing 2,404 and 4,804 triangles, total clone calls fell from 7,217 and 14,417 to 2,409 and 4,809. Face preparation removes 2,403 and 4,803 vector allocations after accounting for its one workspace vector. These are operation counts, without timing assertions or a claim about complete detection time.

The replay returned exactly equal profiles for 48 plates varying holes, tilt, concavity, subdivisions, scaling and translation, including degenerate padding, and equal refusal for a pocket. `src/sheet/sheetProjection.test.ts` retains clone budgets alongside its complete profile assertions and tests interleaved nonzero collinear triangles on a tilted concave plate. Existing detector tests cover rounded tilted meshes, through holes, open faces, pockets and nonfinite data. No browser interaction or manufacturing rule changes.

## Sheet boundary loop ordering

The previous sort recalculated both polygon areas on every comparison. When multiple loops need ordering, each completed loop now retains one absolute area until ordering finishes. Empty and single-loop boundaries return without area calculations. A source-instrumented Node replay on 100 and 200 disjoint 64-vertex rings counted 67,584 and 159,872 area vertex visits before, versus 6,400 and 12,800 after. Radii follow `(i * 37) % count + 1`, with centers spaced 1,000 units apart. These are operation counts, without a timing assertion or a claim about complete detection time. The change adds one area record per loop and an output array of loop references, replacing repeated vertex traversals.

`src/sheet/profileLoops.test.ts` checks descending absolute area, stable ties, reversed winding, point identity, unchanged inputs, fresh measurements after edits, independent containers, empty boundaries and malformed graphs. `sheetProjection.test.ts` retains complete profile coverage through reversed winding, face order and moved geometry. No browser interaction or manufacturing rule changes.

## Sheet caps count edges while projecting triangles

`capBoundary.test.ts` compares the previous calculation across 80 subdivided caps with holes, reflected coordinates and reversed faces, plus rounding boundaries, degenerate inputs, edits and independent results. Its 300- and 600-triangle fixtures reduce coordinate rounding from 3,600 and 7,200 calls to 1,800 and 3,600. These are operation counts, without timing assertions or a claim about complete detection time.

## Sheet detection and cut files

`sheetProjection.test.ts` checks profiles, reversed winding, reordered faces, moved meshes, unchanged inputs and dot-product budgets. On plates with 2,404 and 4,804 triangles, vector dot products fell from 21,678 and 43,278 to 9,637 and 19,237. These are operation counts for detection, without wall-clock assertions.

## Sheet candidate directions normalize after selection

Candidate grouping previously copied and normalized its running weighted sum after every additional face. Those intermediate directions were never read. Grouping now retains the weighted sum and normalizes only selected groups after area ranking. Single-face groups retain the original normal and need no weighted sum. Both geometry-worker measurement routes and analysis reports use this detector.

A local Node source replay instrumented `Vector3.prototype.normalize` across complete detection. The existing hole-free plates with 300 and 600 wall subdivisions contain 2,404 and 4,804 triangles. Normalization calls fell from 4,806 and 9,606 to 2,408 and 4,808. These are operation counts, without timing assertions or a claim about complete detection time.

The replay returned exactly equal profiles for 48 combinations of holes, concavity, tilt, wall subdivisions and coordinates rounded to 0.001 mm. It also preserved refusal for a pocket, open caps, empty input and nonfinite input. `sheetProjection.test.ts` retains a normalization budget alongside complete profile assertions, source preservation, reordered and reversed faces, edits and degenerate padding. Existing `detectSheet.test.ts` checks tilted and rounded profiles, holes, stock thickness and refusal cases. No browser interaction, manufacturing rule or screen changes.
