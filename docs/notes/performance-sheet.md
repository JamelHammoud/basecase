# Sheet manufacturing performance

Implementation: [Sheet manufacturing](../guide/build.md#performance-sheet-manufacturing). Shared requirements: [Performance](../guide/performance.md).

## Imported sheet triangles write directly into their buffer

The whole-app search found one indexed sheet-profile expansion using a temporary three-coordinate array for every corner, in `three/geometryOps.ts`. It now writes those coordinates directly into the final Float32 triangle buffer. Object triangle extraction already writes scalar coordinates and needs no change. CAD coordinate conversion, centering, rounding, index order and buffer ownership remain unchanged.

A local source replay compared the previous and current worker handler bodies with the real CAD converter and sheet detector. Complete triangle buffers and profiles matched for 12 plates varying holes, tilt and 1, 300 or 600 wall subdivisions. Four additional cases covered empty inputs, repeated and out-of-range indices, incomplete triangles, signed zero and nonfinite coordinates. Source positions and indices stayed unchanged for every plate. The hole-free 300- and 600-subdivision fixtures contain 2,404 and 4,804 triangles. Source-derived temporary triple counts fall from 7,212 and 14,412 to zero. The final buffer and CAD conversion arrays remain. These are allocation counts, without measured heap usage, timings or complete detection latency claims.

Replay source, results and logs are `scratch/sheet-expansion.test.ts`, `scratch/sheet-expansion-results.json` and `scratch/sheet-expansion.log`. Existing `detectSheet.test.ts` and `sheetProjection.test.ts` retain permanent coverage of holes, concavity, tilted and rounded geometry, ordering, edits and refusal cases. No permanent test is added for the direct-copy substitution. No timeout, retry or quarantine changes apply. Actions, labels and visible states stay unchanged, so the sheet help article and screenshots remain accurate.

Changed-file validation passed formatting, lint, documentation, site copy for 314 pages and types. Related tests passed 1,494 tests across 218 files, with one skipped file. Three parameterized tests in unchanged `study/visibilityMatrix.test.ts:33` reached their existing 15,000 ms timeout: pan tilt, finger occlusion and inspection arm. The run reported 148.34 seconds. The log is `scratch/check-sheet-expansion.log`. Their cause remains unresolved, and this is not a clean related-test result. No budgets, retries or quarantines changed. Copy accounting is net zero and preflight reports no findings.

## Sheet closure streams triangle keys

The shared detector's closed-solid check previously made a coordinate array and mapped rounding array for each triangle corner, plus a mapped key list per face. It also copied all edge counts before checking them. The check now formats rounded scalar coordinates directly, counts three edge keys per face and scans the map's values directly. This removes seven temporary arrays per retained triangle and one final count array. The edge map and key strings remain. Rounding, signed-zero string conversion, undirected edge keys and exactly-two incidence validation stay unchanged.

The whole-app search found this closure routine in `sheet/detectSheet.ts`, shared by both geometry-worker measurement routes and analysis reports. Cap boundary extraction has different incidence rules and already formats scalar keys. CAD edge identity includes a rounded midpoint and does not validate sheet closure. Neither needs this change. No user action, screen state, manufacturing rule or help step changes. [Cut parts from sheet](../../site/content/help/cut-parts-from-sheet.md) remains accurate.

A local Vitest source replay compared complete profiles for 48 generated plates varying holes, concavity, tilt, wall subdivisions and 0.001 mm rounding after scaling and translation. All results matched exactly and source triangles stayed unchanged. Pockets, open faces, empty input and nonfinite input retained their refusals. On the existing 300- and 600-subdivision plates, containing 2,404 and 4,804 triangles, instrumented vector-to-array calls fell from 7,214 and 14,414 to two in both cases. Source-derived removed array counts are 16,829 and 33,629. These are operation counts, without timing assertions or a claim about total detection latency. Replay source and results live in `scratch/sheet-closure.test.ts` and `scratch/sheet-closure-results.json`.

`sheetProjection.test.ts` retains an array-conversion budget independent of subdivisions with full-profile assertions, source preservation, winding, order, edits and interleaved degenerate faces. Existing `detectSheet.test.ts` covers through holes, concavity, tilted and rounded meshes, stock thickness, open caps, pockets and nonfinite data. No timeout, retry or quarantine changes apply.

Changed-file validation passed formatting, lint, documentation, site copy for 297 pages, types and all 948 tests across 132 related files. The related run reported 42.11 seconds. Its log is `scratch/check-sheet-closure.log`. Copy accounting is net zero and preflight reports no findings.

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

## Sheet direction grouping workspace

Candidate grouping previously cloned every face normal and created three coordinate arrays per face for dominant-axis selection and rounded direction keys. One reusable normal vector now serves the entire grouping pass. Only new groups retain cloned normals. The existing weighted-sum vectors remain independent. Geometry-worker sheet measurements and analysis reports both use this detector.

A local Vitest source replay instrumented `Vector3.prototype.clone` across complete detection. Hole-free plates with 300 and 600 wall subdivisions contain 2,404 and 4,804 triangles. Clone calls fell from 2,409 and 4,809 to 8 for both fixtures. Accounting for the added workspace, these fixtures remove 2,400 and 4,800 vector allocations. Grouping also removes 7,212 and 14,412 temporary coordinate arrays. These are operation counts, without timing assertions or a claim about complete detection time.

The replay returned exactly equal complete profiles across 48 combinations of holes, concavity, tilt, wall subdivisions and coordinates rounded to 0.001 mm. Inputs stayed unchanged. Refusal matched for a pocket, open caps, empty input and nonfinite input. The replay and results are session scratch artifacts. `sheetProjection.test.ts` retains a clone budget independent of wall subdivisions alongside existing full-profile, winding, ordering, edit and degenerate-face assertions. No browser interaction, manufacturing rule or screen changes.

## Sheet boundary adjacency stays bounded

The whole-app search found both growing neighbor-list copies in `sheet/profileLoops.ts`. `detectSheet.ts` calls this shared loop builder for both caps. Cap edge counting and Sketch boundary merging have separate responsibilities and no equivalent neighbor-list builder. Each rounded vertex now owns one list, with immediate refusal at its third incident endpoint. The final degree check traverses the map without copying its values. Valid boundaries retain endpoint order and last point references. No controls, screen states, manufacturing rules or help steps change.

`profileLoops.test.ts` covers rounded shared endpoints, point identity, self-edges, repeated edges, open graphs, branching, both windings, stable area ties, independent containers, source preservation and later edits. On 300- and 600-edge star fixtures, endpoint x-coordinate reads fall from 300 and 600 to 3. The previous center-list spreads copy 44,850 and 179,700 prior neighbor references, calculated as N × (N − 1) / 2. The bounded builder copies none. Valid degree-two vertices allocate one list rather than replacing their list twice. These are deterministic operation counts, without timing assertions or a claim about complete sheet detection time.

A scratch replay compared complete loop results with the previous implementation across 2,000 deterministic ring graphs, varying edge count, winding, missing edges, extra branches and self-edges. All results matched and input edges stayed unchanged. Source and replay live in `scratch/profileLoops-before.ts` and `scratch/sheet-loop-parity.test.ts`. Existing detector and projection tests cover complete sheet profiles. No quarantine applies.

The local changed-file check selected 131 related files. Of 952 tests, 945 passed and seven failed outside sheet coverage. Bambu Studio archive loading and league catalog-geometry replay exceeded 5,000 ms. Four classroom Carry a cup seed batches exceeded 5,000 ms, and their aggregate observed 15 runs instead of 20. Static checks and types passed. These failures do not establish a sheet regression or a clean full related-test run. No timeouts, retries, quarantine entries or unrelated tests were changed.


## Sheet hole containment intersects only crossing edges

A whole-app search found eager horizontal intersection arithmetic only in `sheet/profileLoops.ts`. Printing's `insidePolygon` and annotation selection's `pointInPolygon` already short-circuit on the height test. Silhouette scanline crossing uses its own inclusive boundary rules. Those consumers need no changes. The sheet helper serves hole validation in the shared detector, reached by geometry-worker measurements and analysis reports.

`src/sheet/inside.test.ts` compares the previous calculation over eight outlines, both windings and 121 query coordinates per winding. Cases include horizontal edges, vertices, concavity, repeated points, self-intersections, empty and degenerate outlines, signed zero, infinities and NaN. It checks source preservation and later edits. Existing `detectSheet.test.ts` and `sheetProjection.test.ts` retain complete profile coverage, including tilted and concave plates with through holes.

Instrumented rectangles with 300 and 600 edges have two height crossings for an interior query. Horizontal coordinate reads fall from 900 and 1,800 in the previous calculation to six. An above-outline query reads none, instead of 900 or 1,800. Source-derived intersection divisions fall from 300 and 600 to two for the interior query, and to zero above the outline. Every edge still receives its height comparison. These are deterministic operation counts, without wall-clock or complete detection latency claims. No cache, timeout, retry or quarantine changes apply.

No user action, label, visible state or manufacturing rule changes. Existing sheet help steps and screenshots remain accurate.

Changed-file validation passed formatting, lint, documentation, site copy for 295 pages, types and all 955 tests across 132 related files. The related run reported 49.75 seconds. The full log is `scratch/check-sheet-inside.log`. Copy accounting is net zero and preflight reports no findings. The [Cut parts from sheet](../../site/content/help/cut-parts-from-sheet.md) article still describes the same material assignment, qualifying geometry and exported outlines, so it remains unchanged.

## Mechanical drawings

Drawing geometry, hashing, feature measurement, projection, source STL writing, layout and compression run in an export-owned worker. Standalone preparation builds only selected solids and never requests assembly order. Kit uses the same producer and transfers both plate and drawing buffers to its compressor. Source edits, scene switches, cancellation and completion release operation-owned worker state.

Jobs admit at most 256 selected records, 100,000 triangles per part and 250,000 per job. Three views retain at most 12,000 edge intervals each and 36,000 across the job. BVH-assisted projected clipping stops at ten million triangle visits per view. A sheet has at most 128 feature dimensions. Expanded drawing output, including source STLs, is limited to 64 MB. Names are limited to 256 characters. There is no cross-export drawing cache. Shape preparation and projection happen once per new sheet after source identity and material reconciliation. Repeated records still prepare and fingerprint their geometry, but share projection, document pages and source STL output.

One local observation used an Apple M5 Pro, macOS arm64, Node 26.13.0 and headless Chrome through the existing Vite capture harness. The fixture is an 80 × 60 × 3 mm deck with four 4 mm through holes. Frame is Part, front plane XY and scale 1:1. The repeated job uses 128 distinct records with the same geometry and material, translated 100 mm apart. Both jobs produce one sheet, with quantities 1 and 128.

| Records | Projection ms | Geometry preparation ms | Layout ms | Compression ms | Main work ms | Dispatch ms | ZIP bytes | Isolated process peak MiB |
|---|---|---|---|---|---|---|---|---|
| 1 | 36.09 | 56.74 | 3.54 | 13.81 | 0.31 | 0.24 | 30,939 | 122.56 |
| 128 | 36.72 | 303.55 | 3.60 | 14.50 | 0.47 | 0.38 | 31,290 | 161.38 |

Browser stage times come from the actual disposable drawing worker. Geometry preparation includes projection and source STL generation. Main work sums synchronous input validation and dispatch work, excluding inventory I/O and worker execution. Dispatch is its worker handoff component. Bounded Performance entries retain only the newest main, dispatch and full preparation measurements. The two jobs' full elapsed times were 327.37 ms and 599.23 ms. Those include source snapshot hashing and worker startup in a development-server session that already exported the rover. They do not establish production cold-start latency. These are single observations on a shared host, not timing assertions or speed comparisons.

Peak memory is the operating system's maximum resident set for a fresh Node process running the same worker pipeline and input. It includes Node, imported code, source records, geometry and output. It is a conservative process footprint, not a browser per-isolate heap measurement. The benchmark bundle resolves asset URLs and production environment constants locally, without substituting geometry or export functions. Browser and isolated-process output sizes agree. The source STL frame is the existing millimeter, Z-up convention.

Raw evidence is retained in `scratch/drawing-browser-benchmark.json`, `scratch/drawing-capture-resume.log`, `scratch/drawing-benchmark-simple-resume.log` and `scratch/drawing-benchmark-repeated-resume.log`. The scratch benchmark sources and capture configuration identify the inputs. These measurements add no runtime gate, timeout, retry or scheduling delay.


## Drawing occlusion shares each projected triangle basis

The whole-app search found duplicate projected-basis preparation in `sheet/drawingVisibility.ts`. Its endpoint weight helper calculated the same triangle origin, projected edges and determinant twice per query. The shared clipper now prepares them once, retaining endpoint weights in scalars. This also removes two weight arrays per nondegenerate query and two depth arrays when projected clipping reaches the depth test. The interval array remains. Standalone and Kit drawing exports use this path for all three orthographic views. Other barycentric helpers sample surfaces or interpolate different geometry and do not repeat this endpoint preparation.

A deterministic scratch replay compared complete visibility interval arrays against the previous source across 12,000 edge queries. It used all ten generated drawing profiles, all three view axes and both directions of 200 seeded edges per profile and view. Every result matched exactly. Instrumenting `Vector3.getComponent` on a sloped one-triangle query counted 37 reads before and 23 after, including unchanged bounds preparation. The triangle projected-coordinate reads fall from twenty to six. These are operation counts, without measured heap usage, timing assertions or a claim about total export latency.

`drawingVisibility.test.ts` retains partial occlusion coverage and adds sloped depth clipping across the three view axes, both triangle windings and reversed edge directions, with unchanged source triangles. Existing drawing tests retain complete production export, PDF, SVG, STL, Kit, frame and refusal coverage. No timeout, retry or quarantine changes apply. Replay source, baseline, results and log live in `scratch/drawing-visibility.test.ts`, `scratch/drawingVisibility-before.ts`, `scratch/drawing-visibility-results.json` and `scratch/drawing-visibility.log`.

No action, label, screen state or exported drawing semantics change. The drawing help article and screenshots remain accurate.

Changed-file validation passed formatting, lint, documentation, site copy for 330 pages and types. The related run selected 15 files and 116 tests. Its 112 other drawing and Kit tests and existing partial-occlusion test passed. The three new analytical slope cases initially failed on `0.3506` versus `0.35059999999999997`, then passed after their computed boundaries used a fourteen-decimal comparison. The follow-up changed-file check passed all four visibility tests without changing production code. Logs are `scratch/check-drawing-visibility.log` and `scratch/check-drawing-test.log`. Copy accounting is net zero.

## Canonical sheet loops write rotated points directly

`sheet/profileLoops.ts` previously copied the simplified points into two slices and then copied both slices into the returned array. Rotated loops now write their point references directly into one result array. Already canonical loops return the freshly simplified array. For N retained points, rotation removes two temporary arrays and N intermediate reference writes. Already canonical loops remove three arrays and 2N reference writes. Simplification's own array remains, and source points remain shared by reference.

A whole-app search found one canonicalizer, called for the upper outline, upper holes and every lower loop in `sheet/detectSheet.ts`. Geometry-worker measurement and analysis reports share that detector. Other slice uses do not canonicalize polygons. No user action, screen state or manufacturing rule changes, so the existing sheet help article remains accurate.

A local Node source replay compared previous and current canonicalizers across 2,542 cases. It varied 3 to 160 vertices, four starting offsets, both input and requested windings, concavity, collinear points, tolerant start ties, empty and short loops, signed zero and nonfinite coordinates. Complete outputs and point identities matched. Inputs stayed unchanged, and changing a returned container did not affect later calls. Instrumenting array slices on a rotated rectangle counted two calls before and zero after. These are operation counts, without heap or timing measurements or a claim about total detection latency. Replay source and results are `scratch/canonical-loop-replay.mjs` and `scratch/canonical-loop-results.json`.

Existing `profileLoops.test.ts`, `detectSheet.test.ts` and `sheetProjection.test.ts` retain permanent coverage of boundaries, complete profiles, holes, concavity, winding, reordered faces, source preservation and edits. No timeout, retry or quarantine changes apply.
