# Sketch performance

Implementation: [Sketch](../guide/inspector-and-selection.md#performance-sketch). Shared requirements: [Performance](../guide/performance.md).

## Sketch picking scans for one nearest target

The whole-app search found both ranked nearest-target selections in `components/studio/sketchMarks.ts`'s `hitTest`, shared by new and reopened sketches through `useSketchSelection`. Drawing inference and face picking already retain nearest candidates directly. Path-layer sorting controls paint order and still needs its ordered result.

`sketchPicking.test.ts` compares the previous filter-and-sort result across 100 deterministic sketches, seven tolerances and both mixed and all-fixed point sets. It covers overlapping circles, misses, negative and NaN tolerances, infinite distances, empty ids, source preservation and later edits. Existing `sketchMarks.test.ts` covers point priority, first ties, inclusive boundaries, lines, arcs, reference lines, duplicate coordinates and missing endpoints. No quarantine applies.

For 300 and 600 eligible points in descending distance order, the previous filter and sort read point x coordinates 898 and 1,798 times. The direct scan reads them 300 and 600 times, bounded by getter assertions. These previous counts follow one filter measurement per point and two measurements per comparison across the descending run's adjacent comparisons. The filtered point candidate array is removed. Entity picking removes its complete ranking-record array, filtered array and sort while retaining one distance measurement per entity. These are operation counts, without timing assertions or a claim about complete pointer or rendering time. Point lookup preparation and distance arithmetic remain unchanged.

## SVG-to-Sketch conversion appends geometry once

`utils/sketch/polylineSketch.test.ts` compares complete output with the previous converter across 200 deterministic mixed-loop fixtures and their reversed winding. It checks independent loop closure, empty loops, single points, repeated points, source preservation, later input and output edits, and 1,000 four-vertex loops. The whole-app search found one converter, called by `components/studio/useStudioDraft.ts` for SVG outlines and holes. Interactive point and entity additions edit existing sketches and keep their immutable update path.

On shared macOS arm64 hardware with an Apple M5 Pro and Node 26.13.0, a scratch benchmark compared the previous and new converters. Each fixture used four vertices per loop, five warmups per implementation and 21 alternating three-call batches. Complete outputs matched before timing. Median conversion times for 500, 1,000 and 2,000 loops fell from 0.870, 2.777 and 9.540 ms to 0.034, 0.067 and 0.136 ms. The previous two growing-array spreads copied 998,000, 3,996,000 and 15,992,000 prior entries respectively, calculated from the loop sizes. The new converter copies no prior entries and appends one point and line per vertex. These are local converter measurements, without CI timing assertions or a claim about SVG parsing, constraint solving or complete interaction time. No quarantine applies.

## Sketch probes only dependent residual terms

`residualPlan.test.ts` compares every derivative across 120 mixed sketches and checks edits, source preservation and independent dimensions. For 300 and 600 independent circle constraints, each Jacobian reduces constraint evaluations from 180,000 and 720,000 to 600 and 1,200. Preparation evaluates each constraint once. A scratch comparison matched 5,664 complete solves against the previous implementation, including dragged points. On shared macOS arm64 hardware with Node 26.13.0, median complete solves for 40 and 80 independent circles fell from 0.429 ms and 1.925 ms to 0.143 ms and 0.733 ms. Measurements used 21 alternating three-call batches after five warmups per implementation. These fixtures measure independent radius dimensions, without a CI timing assertion or a claim about complete pointer interaction time.

## Sketch profile tracing consumes incident lists once

`profileTraversal.test.ts` checks these contracts and unchanged inputs. Its 300- and 600-loop shared-vertex fixtures reduce edge-id reads from 92,700 and 365,400 to 3,000 and 6,000. A seeded scratch comparison matched complete loops and profiles across 2,000 mixed sketches. These are operation counts for edge traversal, without timing assertions or a claim about complete Sketch rendering time.

## Sketch solves prepare entity references once

`solver.scale.test.ts` bounds entity-array reads to five per input entity, independent of the number of numerical probes. Its 80-line fixture with a circle and an arc previously took 161,868 reads.

## Sketch profiles measure each loop's area once

`profile.test.ts` checks ties, winding, ordered holes, outside loops, arcs, the area cutoff, source preservation and edits, with one area measurement per loop on 100- and 200-hole fixtures. A scratch comparison matched complete profiles on 300 seeded sketches. On a 1,000-vertex outline with 100 circular holes, area accumulation fell from 113,800 vertex visits to 7,400. A 2,000-vertex outline with 200 holes fell from 427,600 visits to 14,800. These are operation counts, without timing assertions. Hole containment still checks each candidate against the outer boundary.

## Damping trials reuse unchanged matrix products

`utils/dampedSteps.test.ts` checks repeated damping, singular recovery, source preservation and bounded Jacobian reads. Sketch keeps its original diagonal addition order.

## Sketch deletion avoids repeated membership searches

`sketch/removal.test.ts` compares 120 mixed selections with the previous cleanup and checks shared centers, every constraint kind, references, duplicate ids, source preservation and later edits. Its 300- and 600-line fixtures delete alternating lines. Entity-id reads fall from 22,800 and 90,600 to 599 and 1,199. Retained-point comparisons fall from 135,150 and 540,300 to zero. These are operation counts for deletion cleanup, without timing assertions or a claim about complete selection or rendering time.

## Sketch constraint batches assign ids once

The whole-app search found one constraint-creation helper, `utils/sketch/edit.ts`'s `withConstraints`. Rectangles, dimensioned lines and circles, dimension edits and constraint commands all call it. Solver updates replace existing constraints rather than assign new ids. SVG conversion creates no constraints.

`constraintBatch.test.ts` compares complete results against the previous batch implementation across 100 fixtures with gaps, cross-collection prefixes, fractional, malformed, infinite and large numeric ids. It checks every constraint kind, empty-batch identity, source preservation, retained references, independent added objects, subsequent batches and later source edits. Existing edit and solver tests cover the callers. No quarantine applies.

For six added constraints on fixtures with 300 and 600 items in each collection, counted existing-id reads fall from 7,200 and 14,400 to 900 and 1,800. The old append path copies 1,815 and 3,615 existing constraint entries across six growing lists. The new path copies 300 and 600 entries once. These are deterministic operation counts, without timing assertions or a claim about complete Sketch interaction time. Constraint solving remains unchanged.

## Sketch bounds accumulate coordinates directly

The whole-app search found coordinate buffers in `utils/sketch/profile.ts`, `utils/sketch/face.ts` and `components/studio/sketchView.ts`. Profile output and view fitting now accumulate extrema without coordinate arrays or spread arguments. Face placement includes each projected corner during projection, removing its flattened corner list and four coordinate arrays. Revolve derives its radius from the measured x extrema, removing a separate absolute-coordinate array and traversal. The operation-local accumulator retains `Math.min` and `Math.max` behavior for signed zero, NaN and infinities. Circle-center selection and empty-view behavior stay unchanged.

`utils/sketch/bounds.test.ts` compares previous extrema and circle extents, including duplicate and missing centers, negative radii, source preservation and later edits. It checks Extrude and Revolve output on negative, positive and axis-crossing profiles. Its 200,000-point fixture checks profile bounds, view bounds, framing and containment without an argument-count limit. Existing `placement.test.ts` covers face picking, reference edges, placed planes and cutouts. No quarantine applies.

On shared macOS arm64 hardware with an Apple M5 Pro and Node 26.13.0, a scratch benchmark compared the previous and new profile-bound calculations. It used ten warmups per implementation and 31 alternating ten-call batches, checking complete results before timing. Median times for 1,000, 10,000 and 50,000 points fell from 0.0215, 0.2162 and 1.0902 ms to 0.0179, 0.1634 and 0.8222 ms. The previous implementation threw `RangeError: Maximum call stack size exceeded` on 200,000 points. These are local bounds measurements, without CI timing assertions or a claim about complete Sketch interaction time. Circle-center searches, face triangulation and boundary merging remain unchanged.

## Sketch arcs append samples directly

The whole-app search found one profile edge sampler in `utils/sketch/profile.ts`. Both forward and reverse traversal now write directly into the result loop. `SketchShapes.tsx` and `sketchPreview.ts` use the standalone `arcPoints` wrapper, which retains both endpoints and uses the same sampling arithmetic. Circle sampling and incident-edge traversal are unchanged.

`profileArcs.test.ts` compares exact standalone samples and complete contours with the previous arithmetic across 150 fixtures per direction. Fixtures cover translated centers, varying radii, angle wrapping, full circles, short sweeps and zero radii. Each fixture also checks unchanged inputs, a later center edit and reopening the original geometry. Existing profile, traversal and placement tests cover hole selection, branches and solid output. No quarantine applies.

For 1,000 semicircular arcs with 36 segments each, forward tracing previously allocated 1,000 sampled arrays and 1,000 slices. Reverse tracing also allocated 1,000 reversed copies. Both directions generated 37,000 point tuples and discarded 1,000 endpoints. Direct tracing allocates none of those temporary arrays and generates only the 36,000 retained point tuples. Straight edges also append directly instead of allocating a one-entry array. These are code-derived operation counts, without timing assertions or a claim about complete Sketch interaction time.


## Sketch marks share their outward center per query

The whole-app search found one outward-centroid calculation in `components/studio/sketchMarks.ts`. Both `dimensionLabels` and `constraintGlyphs` now retain that center for their query. `SketchOverlay` uses both queries, and `useSketchKeys` uses dimension labels for keyboard editing. Point and entity hit testing does not calculate this centroid.

`sketchMarks.test.ts` checks nonfixed-point preference, the all-fixed fallback, opposite outward directions, angle and length labels, selected-line measurements, stacked pair glyphs, source preservation, independent results and later edits. Empty, point-only and round-only queries perform no centroid membership reads. Existing tests cover every dimension and glyph kind, duplicate point coordinates and missing references.

On 300- and 600-line fixtures, angle-label queries reduce centroid membership reads from 180,000 and 720,000 to 300 and 600. Selected-line measurements reduce them from 90,000 and 360,000 to 300 and 600. Two-target glyph queries reduce them from 180,000 and 720,000 to 300 and 600. Counts follow the previous filter per anchor and are bounded by getter assertions in the new implementation. The original centroid arithmetic and summation order remain unchanged. Repeated filtered point arrays and coordinate sums are removed, leaving one centroid calculation per query that needs it.

A seeded scratch comparison matched 16,000 complete dimension and glyph results across 500 mixed sketches, four gaps and later edits. These are deterministic parity results and operation counts, without timing assertions or a claim about complete pointer or rendering time. Entity searches remain unchanged. No quarantine applies.

## Sketch face boundaries retain edge preparation

The whole-app search found one collinear Sketch boundary merger, in `utils/sketch/face.ts`. It now delegates to `boundaryMerge.ts`, shared by point-picked and normal-picked faces. Other direction calculations serve different geometry. The merger retains normalized directions and rounded endpoint keys per edge, preparing each replacement after a successful join. Pair traversal and restart order remain unchanged. The four endpoint matches retain their previous priority, including degenerate and nonfinite comparisons.

`boundaryMerge.test.ts` compares complete ordered edges against the previous implementation on 200 deterministic mixed fixtures, then checks unchanged sources, later edits and reopened geometry. It also checks empty boundaries, zero-length edges, NaN, infinity and directions near the parallel tolerance. Existing `placement.test.ts` checks face picking, four-edge reference outlines, placed planes and solid output. No quarantine applies.

For 100 and 200 disconnected parallel edges, getter assertions count x-coordinate reads falling from 79,200 and 318,400 to 600 and 1,200. The previous code reads coordinates while normalizing both edges and testing four endpoint matches for every pair. The prepared path reads them six times per edge and performs no coordinate reads during pair comparisons. Each comparison also loses two temporary direction arrays and the four-entry endpoint candidate array with its four tuples. Successful joins still allocate their retained edge and prepare its direction afresh. These are deterministic operation counts, without timing assertions or a claim about complete Sketch interaction time. The pair search remains quadratic for a boundary with no joins.


## Constraint eligibility rejects unsupported selection sizes first

The whole-app search found one eligibility function, `utils/sketch/edit.ts`'s `applicableConstraints`, used by the overlay toolbar and by `addConstraint`. It offers constraints only for one or two selected ids. Larger selections now return before entity and point searches, removing the unused kind array and three filtered arrays. Supported selections retain their existing lookup and rule order.

`constraintEligibility.test.ts` covers single items, all geometry categories, missing and repeated ids, reversed pairs and unsupported sizes. Its 300- and 600-line fixtures count zero entity-id reads for both eligibility and command rejection. Previously, each eligibility call searched for every selected line in source order, requiring 45,150 and 180,300 entity-id reads respectively. These baseline counts are calculated as n(n + 1) / 2. A subsequent supported single-line query reads the current geometry. Existing `edit.test.ts` covers applying constraints through the solver. No quarantine applies.

These are deterministic operation counts without timing assertions or a claim about complete selection latency. Supported selections still perform linear geometry searches. No visible state or workflow changes, so no help article or screenshot changes are needed.
