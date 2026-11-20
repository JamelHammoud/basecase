# Sketch performance

Implementation: [Sketch](../guide/inspector-and-selection.md#performance-sketch). Shared requirements: [Performance](../guide/performance.md).

## Four-bar classification sorts one length list

Whole-app search found one Grashof classifier, `grashofClass` in `utils/linkageKinematics.ts`. `utils/linkage.ts` uses it when scoring every fitted candidate for both Sketch Path and agent synthesis. It now sorts the length list directly instead of copying it and shares a module-local class table instead of recreating it. Sorting, slack arithmetic, change-point tolerance and first-shortest tie priority stay unchanged.

Each classification removes one four-entry temporary array. A classification that reaches the shortest-link lookup removes a second four-entry array. A synthesis scores 72 candidate fits, removing 72 to 144 temporary arrays depending on their classes. The retained sorted list still allocates once per call. These are source-derived allocation counts, not heap measurements or timings. No complete interaction speedup is claimed.

`linkageClassification.test.ts` compares the previous classifier across 1,296 ordered length combinations and their crank edits. It covers all six classes, first-shortest ties and input preservation. Additional cases cover change-point tolerance boundaries, signed zero, negative lengths and nonfinite values in every role. Existing `linkage.test.ts` retains complete seeded synthesis coverage. No timeout, retry or quarantine changes.

On November 20, 2026, the changed-file check passed formatting, lint, docs, site copy and types. Related tests passed 751 files and 5,588 tests, with one existing file and test skipped, in 74.55 seconds. The log is `scratch/check-changed.log`. This local result does not establish browser or Windows reliability.

The steps and captured states in [Design a linkage from a path](../../site/content/help/design-a-linkage-from-a-path.md) remain accurate. Classification results, accepted candidates, ranking and inserted geometry are unchanged, so the article and screenshots stay unchanged.

## Shared dimension preparation

On November 17, 2026, the real OpenSCAD ten-assembly matrix on macOS arm64 and Node 26.13.0 compiled exactly two affected CAD parts per edit. One changed-file check sample measured 60.68 to 121.46 ms per complete preparation, retaining 3 to 12 unrelated catalog objects by identity. The preceding isolated native run measured 33 to 40 ms. These are single local samples under different contention, not percentiles or CI thresholds. Actual hole raycasts, Sketch geometry, mates, references and BOM assertions run with these samples.

The native repeated-CAD sampler prepared 1, 16 and 64 modules in 62.15, 1,129.20 and 2,441.27 ms respectively in the changed-file run. Compilation counts were exactly 1, 16 and 64. Each retained its unrelated stock object and geometry. Primitive-only cloned-service preparations for 1, 32 and 128 changed parts took 0.218, 0.873 and 5.352 ms, with zero CAD compilations and 1, 32 and 128 unrelated objects retained. These Node measurements include preparation and regeneration, without renderer interaction or worker transfer timing. The output is `scratch/parameters-final-check.log`.

The 64-module interruption control dispatched four jobs and rejected the caller in 0.308 ms. The other 60 never entered the kernel pool. This bounds speculative submission to the existing four-request window instead of submitting every module before cancellation can intervene. Already dispatched native jobs may finish. Their late results are discarded and cannot publish geometry. A separate single-job interruption sample rejected the caller in 0.260 ms. These are caller cancellation latencies, without a claim about terminating native work.

The browser documentation capture also records synchronous preparation, worker dispatch and atomic commit as `parameters:prepare`, `parameters:dispatch` and `parameters:commit`. Each name retains only its latest measurement. It uses the real worker and existing CAD bridge with the native kernel. The small rover and repeated-module samples are recorded below. Development-server measurements establish the measured path, without a production-renderer responsiveness claim or a CI timing assertion. Geometry scope includes connected Sketch and mate roots and returns patches only, so unrelated geometry does not cross the worker boundary. CAD dimension parsing is cached by source object and code. Verification signatures use weak geometry and binding references and preserve ordinary undo history.

The final development-server documentation capture measured the rover edit's synchronous preparation at 1.470 ms, worker dispatch at 0.110 ms and commit at 0.160 ms. It changed deck width to 200 mm and mounting plate width to 184 mm, with two compilations for that edit. The three binding operations account for the other three calls in the capture's total of five. The 16-deck capture compiled exactly 16 parts and retained two catalog records. Its measured synchronous preparation, dispatch and commit were 0.920, 0.450 and 0.395 ms. Observed UI-to-result time was 385.67 ms, including browser automation. These synchronous segments exclude rendering, other event handlers and asynchronous native and worker time. Both captures reported no app errors. Logs are `scratch/parameters-browser-measurements.json`, `scratch/parameters-browser-repeated.json` and `scratch/parameters-capture-final.log`. Vite emitted its existing ten-second shutdown warning after both capture tests passed, without a changed deadline or retry.

Current correctness coverage and corrected failures are recorded in [Build test evidence](testing-build.md#shared-dimension-preparation). No shared performance policy, timeout, retry or quarantine changed.

The review correction adds boolean parent edges to the existing connected scope and runs required recuts in the same geometry worker. Binding metadata no longer invalidates a boolean geometry hash. The samples above did not include boolean assemblies and do not measure recut latency. The nested-boolean regression measures mesh volume and verifies settled hashes without a timing assertion. [Review coverage](testing-build.md#shared-dimension-preparation) records its failure boundaries.

## SVG bounds scan contours directly

The bounds search found one remaining flattened point list in the SVG-to-solid parser, `utils/svgTo3DParser.ts`. Sketch framing and profile output already accumulate bounds directly. The parser now scans each outer contour in source order without collecting its references in another array. Holes remain excluded from bounds. Filled shapes and the outline fallback share the same scan, which supplies preview dimensions, extrusion contours and the Edit in Sketch handoff.

On November 16, 2026, `scratch/svg-bounds.test.ts` compared complete parser results with the preceding implementation for 1, 30, 300 and 600 rectangular SVG paths. Both used the same sampled paths and fixed timestamp. Every result matched exactly. Instrumentation counted 49, 1,470, 14,700 and 29,400 outer-point references in the former flattened bounds list, and zero in the new scan. The log is `scratch/svg-bounds.log`. These are reference counts, not timings or heap measurements. Shape extraction, sampling, normalization and output allocation retain their existing work, and no complete-import speedup is claimed.

Existing `svgTo3DParser.test.ts` covers normalized filled contours with a hole, skipped unfilled paths, tall outlines, dimension and color overrides, bevels and empty-input refusal. No new browser test, timeout, retry or quarantine is needed for this traversal change.

[Draw a part from a sketch or SVG](../../site/content/help/draw-a-part-from-a-sketch-or-svg.md) was rechecked against `SvgImportPanel.tsx`, `OutputFields.tsx`, `useStudioDraft.ts` and the final parser. Choosing or dropping an SVG still loads the preview and shape and hole counts. Output keeps W, T and Bevel, Add still reparses with the chosen settings and file name, and Edit in Sketch still opens the draft built from the normalized contour. Draft defaults remain 64 for the span field, 10 for thickness and Bevel enabled. The bounds traversal changes none of these controls, results or transitions. The article's steps and four Sketch screenshots remain accurate and unchanged. No SVG screenshot exists in this article, and no screen state changed that needs a new capture.

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

## Sketch elimination consumes its damping matrix

The whole-app search found one production caller of the Sketch square solver, `utils/sketch/leastNorm.ts`. Every damping trial already constructs a fresh matrix from retained weighted products. `solveSquareInPlace` now eliminates that owned matrix directly, removing the immediate row clone. Its residual vector is still copied. Rank calculation keeps its separate copy because it receives caller-owned input. Four-bar, IK and calibration solvers have separate ownership paths and do not call this function.

For n residuals, the removed clone allocated one outer array and n row arrays and copied n² numeric entries per trial. At 20 and 40 residuals across six trials, this removes 126 and 246 arrays and 2,400 and 9,600 copied entries respectively. These are counts calculated from the removed clone, not timings or heap measurements. Damping matrix construction, residual copies and elimination arithmetic remain unchanged. No complete solve or interaction speedup is claimed.

`dampedSteps.test.ts` covers exact weighted-step parity across damping values and weight scales, unchanged Jacobians, weights and residuals, singular trials, pivoting, partial elimination, retained outputs and interleaved prepared systems. Existing Sketch solver tests exercise constraints, dragged points and later edits through this same path. No quarantine applies. No visible state or workflow changes, so help steps and screenshots remain accurate.


## Four-bar queries normalize only the nearest segment

The whole-app search found one prepared polyline distance query in `utils/linkageKinematics.ts`. Both consumers are in `utils/linkage.ts`: sampled coupler path errors and drawn-polyline following scores. Other segment-distance functions perform individual picking or support-edge measurements rather than repeated queries over this prepared curve.

The query selects a segment using squared residuals, then repeats its projection and calls `Math.hypot` once. It retains the runner-up squared distance. Minima separated by at most eight times `Number.EPSILON` relative to the best squared distance, nonfinite minima and minima below 1e-300 fall back to the original hypot scan. The relative margin covers rounding differences between the squared sum and scaled hypot arithmetic. Segment preparation and projection arithmetic remain unchanged. The fallback repeats the segment scan, so this refinement does not claim a gain for nearly tied, degenerate or extreme queries.

`linkageDistance.test.ts` compares exact results with the original scan across seeded curves and queries, source edits, repeated vertices, empty and single-point curves, NaN and infinities. It also compares complete synthesized linkages and ranking with both consumers using the original distance query. New cases cover underflow, overflowing squares, tied minima and nearly tied residuals across five scales from 1e-149 to 1e149 in both traversal orders. No quarantine applies.

Review reproduced a missed rounding case before the relative margin was added. At the origin, endpoint residuals `[0.9999999999995, 9.999999999998333e-7]` and `[0.9999999998195, 0.000018999999998856832]` have squared sums 0.9999999999999999 and 1, but hypot distances 1 and 0.9999999999999999. A four-vertex curve joining their doubled coordinates returned 1 rather than the original scan's 0.9999999999999999. The regression failed against the equality-only fallback. The relative-margin fallback restores that exact minimum. Failure output is in `scratch/review-1465-regression.log` for this session.

For ordinary 360- and 720-segment straight polylines queried beyond their final endpoint, spy assertions count one hypot call instead of 360 and 720. Each new query performs one additional segment projection for the winner. These are deterministic operation counts, not timings or claims about complete synthesis or interaction speed. No visible state or workflow changes, so help articles and screenshots remain accurate.


## Sketch weights each Jacobian row once

Whole-app search found one weighted least-norm preparation in `utils/sketch/leastNorm.ts`, used by the shared Sketch constraint solver. It previously multiplied each row entry by its variable weight separately for the diagonal and every off-diagonal column. One call-local workspace now retains that first product across all columns of a row. The workspace is overwritten for each row and is not captured by the damping closure. Diagonal terms retain their existing storage and damping-first summation order. Every multiplication and addition keeps its original association.

For n residuals and m variables, weighting multiplications and weight reads fall from n²m to nm. One m-entry workspace is added during preparation. The retained matrix and diagonal terms are unchanged. For the existing 20-by-25 and 40-by-45 fixtures, weighting operations fall from 10,000 to 500 and from 72,000 to 1,800. Jacobian reads during preparation fall from 20,000 to 10,500 and from 144,000 to 73,800. These are deterministic operation counts, not timings or a claim about complete drag latency. Matrix elimination remains cubic.

`src/utils/dampedSteps.test.ts` asserts these preparation read counts and retains exact comparison against independent weighted equations across six damping values and three weight scales. It also covers singular trials, pivoting, interleaved prepared systems, retained outputs and unchanged inputs. Existing Sketch solver tests cover complete constraints, dragged points and subsequent edits. No UI state or workflow changes, so help articles and screenshots remain accurate. No quarantine changes.


## Sketch face projection counts boundary edges directly

Whole-app search found one projected-triangle staging list, in `utils/sketch/face.ts`. `useSketchSession.ts` calls this extractor for both point-picked and normal-picked part faces. Printed-label face extraction has its own mesh-space representation and does not use this projected list. Each triangle now adds its three edges to the existing undirected count map immediately after projection. Bounds updates, projection arithmetic, triangle order, edge insertion order, cancellation and collinear merging remain unchanged.

For T coplanar triangles, the previous projection allocated one outer list, T three-point arrays and T `[0, 3, 6]` offset arrays. The direct path removes those 2T + 1 arrays and the subsequent traversal of 3T staged point references. At 300 and 600 triangles, this removes 601 and 1,201 temporary arrays and a second visit to 900 and 1,800 point references. Projected point tuples and edge-map records remain necessary. These are code-derived operation counts, not timings or heap measurements. No complete interaction speedup is claimed.

On November 16, 2026, `scratch/face-projection.test.ts` compared complete ordered faces with the preceding implementation for 960 queries across 120 transformed, subdivided box and extruded-outline fixtures. Cases include holes, six normal directions, clicked vertices, empty input, input preservation, reference-sketch output and later vertex edits. All results matched. The session log is `scratch/face-projection.log`. Existing `placement.test.ts` covers face planes, both pick modes, reference outlines, solid placement and cutouts. `boundaryMerge.test.ts` retains mixed-boundary and degeneracy coverage. No quarantine changes.

The face-selection steps and screenshot in [Draw a part from a sketch or SVG](../../site/content/help/draw-a-part-from-a-sketch-or-svg.md) remain accurate. No control, output or visible state changes, so no article edit or screenshot is needed.

## SVG extraction appends accepted contours directly

Whole-app search found sampling and short-contour filtering together only in `utils/svgTo3DParser.ts`. Its consumers are the Import SVG panel and studio draft restoration. Previews, extrusion and Edit in Sketch receive the same parsed contours. Filled holes formerly used a mapped list followed by a filtered result. Fallback outlines used a mapped list per source path, a flattened list, a filtered list and the final shape list. Accepted points now append directly to the retained lists. Sampled point arrays and final contour records still allocate.

For P fallback paths containing S subpaths, the change removes P + 2 staging arrays and two full traversals of subpath references. For 300 and 600 paths, that is 302 and 602 arrays. Each filled shape with holes also loses one mapped staging array. These are source-derived allocation counts, not measured heap usage or timings. Sampling and normalization costs remain unchanged.

`svgTo3DParser.test.ts` covers real filled contours with holes, sizing, overrides and empty input. The fallback case forces the loader's empty-shape branch and checks order across multiple paths, exclusion of a short contour from bounds, sampled point count and source preservation. Actions, output geometry and visible states stay unchanged. Rechecking the [Sketch and SVG help article](../../site/content/help/draw-a-part-from-a-sketch-or-svg.md) found that its initial 64 mm size applies to the longer outline side, rather than always its width. The article corrects that sentence. Its steps, labels and screenshots still apply, so no new capture is needed. No timeout, retry or quarantine changes.

## Sketch support preparation

Measured on macOS with headless Chrome and the existing software GL harness on 16 November 2026. The documentation capture served the current source through Vite's development server and called the production geometry worker and document-result implementation. These are warm function measurements, not cold app startup or a production-bundle viewport benchmark. One warm-up preceded twelve recorded requests for one feature and an eight-feature chain. Every recorded request completed with no support finding.

| Scope | Main preparation median / max | Worker median / max | Worker round trip median / max | Main commit median / max |
| --- | --- | --- | --- | --- |
| One feature | 0.045 / 0.12 ms | 0.2375 / 0.86 ms | 0.3225 / 1.055 ms | 0.01 / 0.04 ms |
| Eight-feature chain | 0.3525 / 0.615 ms | 1.5575 / 4.03 ms | 1.8775 / 4.475 ms | 0.025 / 0.055 ms |

One feature prepared one source and counted 864 coordinate bytes. Its UTF-8 input was 2,527 bytes and its retained result was 1,809 bytes. The chain prepared eight sources and counted 35,136 coordinate bytes. Its input was 15,157 bytes and its retained result was 14,455 bytes. The coordinate counter charges eight bytes per number, conservatively counting the Float32 triangle soup at twice its buffer size. Prepared soups are operation-local and are not retained after the result.

Chrome DevTools collected garbage before and after each twelve-request series. Main-page used heap grew by 29,672 bytes for one feature and 39,084 bytes for the chain. Geometry-worker used heap grew by 193,600 and 148,992 bytes respectively. Main and worker backing storage did not grow in either series. These observations include runtime and DevTools overhead and do not prove zero heap growth or a peak-memory bound. Retained result bytes above are the serialized design records, not the whole browser heap.

The implementation retains one active request and only the latest pending immutable document reference per workspace. Fingerprint and validation caches are weak maps. Jobs are bounded by 128 supported parts, sixteen levels, 512 sketch items, a 2 MiB input-value budget and 512 KiB per source record. Source node counts and profile sampling are checked before building geometry. Mesh coordinate counts are checked before exporting the triangle soup, and total retained prepared coordinates are capped at 16 MiB. Oversized jobs produce a finding before serialization to the worker. Freshness hashes only the records and sources participating in Sketch support, rather than serializing unrelated boolean geometry.

The documentation capture's first cold navigation hit the existing 30-second deadline while Vite compiled the module graph. The scratch capture setup then fetched each transformed module once before browser navigation. That preparation covered 2,588 modules in 20.23 seconds, with no failed response. The capture then opened the studio in 4.879 seconds. No app timeout, test retry or CI deadline changed. This scratch prewarming is not a shipped startup change.

## Sketch face extraction reuses a corner

Whole-app search found the discarded triangle-edge vector in `utils/sketch/face.ts`. Both picks in `three/sketchFaceOps.ts` and attached-face resolution in `utils/sketch/support.ts` use this extractor. The third corner becomes the second edge after its coordinates have been read. The next triangle reloads it before use. Cross-product arithmetic, area rejection, retained normal ownership, offsets and boundary output stay unchanged.

For T visited triangles, this removes T temporary Vector3 instances. Subdivided boxes with 300 and 1,200 triangles remove 300 and 1,200 vectors respectively. These are code-derived allocation counts, confirmed by recording cross-product operand identities, not heap or timing measurements. No interaction speedup is claimed.

On November 17, 2026, `scratch/face-edge.test.ts` compared complete ordered face results with the preceding implementation for 420 queries over 30 rotated, translated and subdivided boxes before and after coordinate edits. Queries include point picks, six normal directions, degenerate triangles and empty input. Every result matched, and inputs remained unchanged. The two scratch tests passed in a 140 ms run. The log is `scratch/face-edge.log`. Existing `placement.test.ts` covers face picking and solid output, while `support.integration.test.ts` covers attached-face resolution. No timeout, retry or quarantine changes.

The first face-picking step in [Draw a part from a sketch or SVG](../../site/content/help/draw-a-part-from-a-sketch-or-svg.md) now states the existing supported rectangular face requirement. The article already described this limit later, and `useSketchSession.ts` refuses unsupported faces. Actions, labels and visible states stay unchanged. The existing box-face screenshot still demonstrates the supported case, so no new capture is needed.

The changed-file run passed formatting, lint, docs, site copy and types. Related tests reported 1,774 passed, one skipped and one timeout across 258 files in 91.57 seconds. The scene case in `cases/fixtureWorkflow.test.ts` exceeded its existing 5,000 ms limit at 5,407 ms. Separate scratch imports of that unchanged two-case workflow passed with both the preceding extractor and this change, in total runs of 5.17 and 2.97 seconds respectively. This supports contention as a possible cause, but does not establish the timeout's cause or cross-platform reliability. Logs are `scratch/check-changed.log`, `scratch/fixture-baseline.log` and `scratch/fixture-current.log`. The test and its budget are unchanged because this refinement does not own fixture workflow reliability.

## Normal-picked Sketch faces retain one candidate

Whole-app search found one outermost normal-facing triangle selector, in `utils/sketch/face.ts`. `three/sketchFaceOps.ts` uses it when opening Sketch, and `utils/sketch/support.ts` uses it when resolving attached supports. Printed labels have a separate face representation and no matching filtered outermost selection. Point picking remains unchanged.

The selector now retains its winning triangle while testing facing. For T triangles and F facing candidates, it removes one F-entry temporary array and the second traversal of those F references. Dot products and winner comparisons retain their previous counts and order. A subdivided box with 300 or 1,200 triangles and an axis-aligned normal previously staged 50 or 200 facing references. Both now stage zero. These are code-derived operation counts, not measured heap usage or timings. No complete interaction speedup is claimed.

On November 17, 2026, `scratch/face-selection.test.ts` compared complete ordered face results with the preceding implementation across 3,550 queries. Fixtures include rotated and translated subdivided boxes, duplicate soups, tied repeated triangles, degenerate and empty input, six axis directions, zero and nonfinite normals, facing-threshold probes and later coordinate edits. Results matched and source arrays stayed unchanged. The final scratch run passed in 772 ms. Its log is `scratch/face-selection.log`. Existing `placement.test.ts` and `support.integration.test.ts` retain pipeline coverage. No timeout, retry or quarantine changes.

Rechecked [Draw a part from a sketch or SVG](../../site/content/help/draw-a-part-from-a-sketch-or-svg.md) against `useSketchSession.ts`, `three/sketchFaceOps.ts` and `utils/sketch/support.ts`. The first step still requires a rectangular support face. Opening Sketch still supplies that face’s reference edges, and skipping the face still uses the ground plane. Attached-face resolution still supplies the same normal to `faceOf`. The change only replaces candidate storage inside normal selection, preserving the selected plane and ordered edges. The article’s controls, dimensions, extrusion, reopening and SVG steps are untouched. Its box-face, typed rectangle, extruded part and edited part captures still describe the same states. All four referenced PNGs remain present. No step, label or screenshot became inaccurate, so the article stays unchanged.

The final changed-file check passed formatting, lint, docs, site copy and types. Related tests reported 261 files passed and one skipped, with 1,808 tests passed and one skipped in 98.64 seconds. The log is `scratch/check-changed-final.log`. The existing skip was not changed.


## Sketch support picks project scalar offsets

Whole-app search found one rectangular support-click containment check, `pointWithinFace` in `utils/sketch/support.ts`. `captureSupport` invokes it after canonical face extraction for point picks. Normal picks skip it. Other point transformations construct output geometry or apply quaternion and matrix transforms rather than test rectangular containment.

Each checked click previously allocated five Vector3 objects, a two-coordinate projection array and a temporary min/max reference array. Scalar offsets and three dot products now allocate none of those objects. Subtraction, multiplication and left-associated addition keep the previous arithmetic. The plane-distance and rectangular bounds retain their inclusive 0.001 mm tolerance. These are source-derived allocation counts, not heap measurements or timings. No complete interaction speedup is claimed.

On November 17, 2026, `scratch/support-projection.test.ts` compared the previous and new containment functions across 40,600 cases. The fixtures cover 200 translated and rotated planes, rectangle edges, points inside and outside each tolerance, signed zero and nonfinite point coordinates. Every result matched. The log is `scratch/support-projection.log`. Existing `support.integration.test.ts` covers accepted and refused point picks, persistent support, retriangulation, source edits and save/reopen. No timeout, retry or quarantine changes.

Rechecked [Keep a sketch on a face](../../site/content/help/keep-a-sketch-on-a-face.md), which covers the changed module, and [Draw a part from a sketch or SVG](../../site/content/help/draw-a-part-from-a-sketch-or-svg.md). Attaching and replacing a support still use the same accepted face and tolerance. Resizing, moving, edge offsets, regeneration, blockers, cancellation and copy behavior are untouched. All steps, labels and captured states still hold. This changes temporary storage only, so both articles remain unchanged.
