# Sketch performance

Implementation: [Sketch](../guide/inspector-and-selection.md#performance-sketch). Shared requirements: [Performance](../guide/performance.md).

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
