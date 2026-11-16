# Sheet manufacturing performance

Implementation: [Sheet manufacturing](../guide/build.md#performance-sheet-manufacturing). Shared requirements: [Performance](../guide/performance.md).

## Sheet boundary loop ordering

The previous sort recalculated both polygon areas on every comparison. When multiple loops need ordering, each completed loop now retains one absolute area until ordering finishes. Empty and single-loop boundaries return without area calculations. A source-instrumented Node replay on 100 and 200 disjoint 64-vertex rings counted 67,584 and 159,872 area vertex visits before, versus 6,400 and 12,800 after. Radii follow `(i * 37) % count + 1`, with centers spaced 1,000 units apart. These are operation counts, without a timing assertion or a claim about complete detection time. The change adds one area record per loop and an output array of loop references, replacing repeated vertex traversals.

`src/sheet/profileLoops.test.ts` checks descending absolute area, stable ties, reversed winding, point identity, unchanged inputs, fresh measurements after edits, independent containers, empty boundaries and malformed graphs. `sheetProjection.test.ts` retains complete profile coverage through reversed winding, face order and moved geometry. No browser interaction or manufacturing rule changes.

## Sheet caps count edges while projecting triangles

`capBoundary.test.ts` compares the previous calculation across 80 subdivided caps with holes, reflected coordinates and reversed faces, plus rounding boundaries, degenerate inputs, edits and independent results. Its 300- and 600-triangle fixtures reduce coordinate rounding from 3,600 and 7,200 calls to 1,800 and 3,600. These are operation counts, without timing assertions or a claim about complete detection time.

## Sheet detection and cut files

`sheetProjection.test.ts` checks profiles, reversed winding, reordered faces, moved meshes, unchanged inputs and dot-product budgets. On plates with 2,404 and 4,804 triangles, vector dot products fell from 21,678 and 43,278 to 9,637 and 19,237. These are operation counts for detection, without wall-clock assertions.
