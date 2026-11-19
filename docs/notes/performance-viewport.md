# Viewport rendering performance

Implementation: [Viewport rendering](../guide/canvas.md#performance-viewport-rendering). Shared requirements: [Performance](../guide/performance.md).

## Capture preset directions normalize once

Whole-app searches for `viewDirection`, `VIEW_DIRECTIONS` and clone-then-normalize calls found one fixed capture direction table in `three/viewport/captures.ts`. Build-guide framing accepts arbitrary direction tuples and normalizes them at that boundary. Other clone-then-normalize sites use variable geometry or axes. Every named-view capture uses the capture helper, including ordinary, silhouette, grid and labeled requests. Silhouette fitting supplies custom angles and keeps its existing trigonometry.

The five preset vectors now normalize at module load, replacing normalization on every preset request. Each request still returns a fresh vector, so caller mutation cannot change later captures. Unknown view names retain the isometric fallback.

`captures.test.ts` makes 600 requests across all five presets and the unknown-name fallback. It compares exact coordinates with the former calculation and mutates every result before the next request. A restored spy asserts zero request-time normalizations, down from 600. Five module-load normalizations replace that repeated work. These are operation counts, without wall-clock or heap measurements or a claim about complete capture latency.

Five custom-angle cases cover signed azimuths, fractional angles and both elevation clamps. Existing tests cover frame copying, worker encoding, helper restoration and part isolation. GPU rendering and image output are outside this CPU coverage. No label, user action or visible state changes, so help instructions and screenshots remain accurate. No timeout, retry or quarantine changes apply.

## Camera zoom uses scalar offsets

A whole-app search found one perspective orbit zoom helper, `zoomCamera` in `three/viewport/wheel.ts`. Modifier-wheel pinch, Zoom Scroll and the viewport's programmatic `zoomBy` call it. Part previews install the same wheel listener. Sketch's pointer-centered 2D zoom has separate coordinates and does not use this calculation.

Previously each call cloned the camera position before scaling its offset from the orbit target, including calls rejected by distance limits. Scalar offsets remove that vector while retaining subtraction, multiplication, squared length, square root and target addition in the same order. No workspace or cache is added.

`wheelZoom.test.ts` compares 600 calls across two independent rigs against the previous vector calculation and asserts zero vector clones during the new calls, down from 600. This is an allocation count, not a timing or complete interaction latency measurement. Cases include moving targets, zero offsets, negative factors, underflow, overflow, infinity and NaN. Additional cases cover inclusive limits, Ctrl and Meta pinch, capped Zoom Scroll, event prevention and listener removal. Existing `wheel.test.ts` covers pan and orbit paths.

GPU rendering and physical trackpad delivery are outside these CPU tests. No workflow, label or visible state changes, so existing navigation help and screenshots remain applicable. No timeout, retry or quarantine changes apply.

## Solid marks omit dash preparation

A whole-app search found one `computeLineDistances` call, in `three/viewport/markLayer.ts`. Its shared builder creates saved annotation strokes, live drawing previews and selection halos. None enables dashed materials. The installed Three.js `LineMaterial` reads distance attributes only under `USE_DASH`. Removing the call therefore removes unused preparation across every caller without changing line geometry or rendering inputs used by solid lines.

For N points, Three.js previously visited N − 1 segments, calculated that many Euclidean distances and allocated an eight-byte distance pair per segment. Each line also created one interleaved buffer and two attribute wrappers. At 300 and 600 points, each build removes 299 and 599 distance calculations and 2,392 and 4,792 bytes of distance storage. One build of each of the three line states removes 897 and 1,797 calculations and 7,176 and 14,376 bytes. These are source-derived operation and allocation counts, without wall-clock, heap or complete drawing latency measurements. Position buffers and other line allocations remain.

`src/three/viewport/markLayer.test.ts` checks all three states at both sizes with exact Float32 endpoints, solid materials, absent dash attributes, movement, deselection, preview removal and disposal. Existing cases cover picking, erasing, ties, reach boundaries, camera changes and viewport changes. GPU rendering is outside this unit coverage. No timeout, retry or quarantine changes apply.

No action, label or visible state changes. The [Comment and mark up the scene](../../site/content/help/comment-and-mark-up-the-scene.md) instructions and screenshots remain applicable, so no help edit or capture is needed.

## Part-isolated captures index requested ids once

The whole-app search found the repeated isolation membership scan in `three/viewport/captures.ts`. Both `captureViews` and `fitCapture.ts` use `hideForViews`, so agent views and silhouette fitting share the refinement. Each request indexes its nonempty id list once, then checks scene children through the set. No index survives the call.

`src/three/viewport/captures.test.ts` uses 600 scene children and 300 requested ids, selecting every other child. The previous `includes` loop reads 135,150 id elements for this fixture. Set construction reads 300, asserted through element getters. These are deterministic operation counts, without timing assertions or a claim about complete capture latency. Rendering, GPU readback and encoding are outside this test.

The same tests cover absent and empty requests, duplicates, missing ids, image-plane exclusion, previously hidden parts and worlds, repeated restoration, unchanged inputs and edited requests. Existing current-view tests retain frame-copy and worker-encoding coverage. No control, workflow or visible state changes, so help instructions and screenshots stay applicable. No quarantine applies.

## Line batches retain transform storage

`LineBatch.setMatrix` previously cloned a Matrix4 and its 16-element array on every transform update. It now clones once when an instance first receives a matrix, then copies later values into that snapshot. Removal deletes the snapshot. The matrix texture and visibility behavior stay unchanged.

`src/three/viewport/lineBatch.test.ts` exercises 300 and 600 instances through eight poses, alternating visibility. Both sizes exceed the initial 256-instance texture capacity. Initial creation still clones 300 and 600 matrices. Subsequent poses clone zero, down from 2,400 and 4,800 matrices and the same number of element arrays under the previous implementation. These are asserted clone counts and source-derived array counts, not timings. The tests run on the CPU without WebGL.

The lifecycle test reads uploaded Float32 matrix values and checks independent instances, movement while hidden, restoration after source mutation, removal and reuse of an instance id. Existing `partBatches.test.ts` covers shared edge batching and movement through PartLayer. This changes no workflow or visible state, so help instructions remain applicable. GPU rendering, texture-upload costs and complete interaction latency are outside these checks.

## Mark hit tests stream projected endpoints

Mark selection, hover, drag start and erasing share `MarkLayer.distances`. Previously each unlabeled stroke query constructed a projected point array and one pixel tuple per point. The distance scan now holds two pixel tuples per stroke and projects directly into them. The query's projection vector and the returned mark-distance list remain unchanged.

At the drawing limit of 400 points, this removes the 400-element projected list and replaces 400 pixel tuples with two. At 800 points, it replaces 800 tuples with two. These are source-derived allocation counts, not timings or a measurement of complete pointer latency. Saved scene data may exceed the drawing limit.

`markMath.test.ts` checks one projection per point and exactly two reused output tuples at both sizes. It also covers repeated endpoints, empty or single-point input and subsequent point edits. `markLayer.test.ts` checks selection and eraser output, first-hit ties, the inclusive 10 px boundary, current camera and viewport reads, and dragged positions. A spy on the stroke's `map` method confirms both selection and eraser queries avoid the previous mapped projection. Label rendering and GPU frame time are outside this check's scope.

## Mark hit tests reject distant segments before measuring length

Whole-app search found one projected mark-to-segment distance loop, in `three/viewport/markMath.ts`. Selection, hovering, drag start and erasing reach it through `MarkLayer.distances`. Segment projection and clamping stay unchanged. Squared coordinate offsets bound the squared Euclidean distance from below. A bound above the best squared distance plus an eight-epsilon margin skips the sum. Remaining candidates compare squared distances and retain the nearest offsets for one final `Math.hypot`. Near ties and squared overflow or underflow use the original exact comparison. [Combined normalization evidence](performance-annotations.md#mark-picking-normalizes-only-the-nearest-distance) records the numerical guards and storage.

`markMath.test.ts` compares exact outputs with the previous loop across 400-point curved strokes in both orders, repeated points, empty and single-point strokes, extreme finite scales and nonfinite projections. On horizontal strokes of 400 and 800 points with the pointer ten pixels above the first endpoint, `Math.hypot` calls fall from 399 and 799 to one each. The test asserts those counts through a restored spy. These are operation counts, not timings or a claim about complete pointer latency. Reversing both horizontal fixtures makes successive segments improve the nearest distance and still requires only one normalization. Near ties and extreme scales can require additional exact comparisons.

Existing `markLayer.test.ts` covers selection and eraser output, first-hit ties, the inclusive 10 px boundary, dragged positions and current camera and viewport reads. GPU rendering is outside these checks. No action, label or visible state changes, so the existing mark help instructions and screenshots remain applicable. No browser walkthrough, timeout, retry or quarantine changes apply.

## Captured-world camera rendering stays in workers

On demand, `node tools/perf/worldVideosBench.mjs` measures rendering and encoding a 10 s, 30 fps, two-camera kitchen episode against Open Floor, including stage creation. It prints both times and fails above a 3× ratio. Timing never runs in Check.

## Parts draw in batches, not one draw call each

`my-robotics-design` (488 parts) went from 1,273 GL calls per orbit frame to 9, main-thread work from 3.2 to 0.9 ms and GPU-process time from 1.5 to 0.9 ms. An edit to one part once stalled `look` for 284 ms.

## Sculpt brushes reuse per-stroke workspaces

`sculptStroke.test.ts` checks all six brushes' displacement, falloff, mirrored regions and input preservation, and bounds vector clones at three for 300 and 600 vertices without symmetry. The previous 300-vertex fixture cloned 203 vectors for each of the four direction brushes. This is an allocation count, not a wall-clock measurement.

## Sculpt applies independent brushes during the radius scan

Inflate, Carve, Flatten, Pinch and Grab no longer collect affected indices and falloffs or calculate an unused affected center. Each moves a vertex immediately after its radius test. Smooth still gathers affected vertices before moving them, preserving its original center and avoiding a second whole-mesh scan for sparse brushes.

`src/three/sculptStroke.test.ts` checks all six brush results, untouched vertices, symmetry and stroke input preservation. Its 300- and 600-vertex fixtures affect 200 and 400 vertices. For each of the five independent brushes, position reads including normal recomputation fall from 800 and 1,600 to 600 and 1,200. Each stroke also removes two growing arrays with 200 or 400 entries apiece and the corresponding center additions. The read counts are asserted, and array and center counts follow from the removed code. These are operation counts, without timing assertions or a complete interaction speedup claim. Stroke start and drag share this path. No workflow or visible state changes, so help instructions and browser coverage stay unchanged.

## Sculpt prepares strength blends once per stroke

A whole-app search for the four strength expressions found them only in `three/sculptStroke.ts`. Flatten, Smooth, Pinch and Grab all use that engine for stroke start and drag, including mirrored strokes. Their multiplier and cap depend only on brush kind and strength, so the engine now prepares one blend per stroke instead of recalculating it for every affected vertex. Inflate and Carve prepare no blend clamp. Displacement multiplication order and Smooth's center calculation stay unchanged.

The retained `sculptStroke.test.ts` fixtures contain 300 and 600 vertices with 200 and 400 affected vertices. For each of the four brushes, strength multiplication and clamp counts fall from 200 and 400 to one per stroke. The test asserts the clamp count and displacement at strengths 0, 0.5 and 3, covering zero, ordinary and capped blends. Existing tests cover falloff, symmetry, untouched vertices, normals and input preservation.

A local scratch comparison against the pre-change module checked exact complete Float32 position and normal buffers for 432 stroke applications. It covered all six brushes at strengths -0.5, 0, 0.5, 1, 2 and 5, with symmetry and inversion both on and off, and three consecutive strokes on each 20 by 16 sphere fixture. All buffers matched. These are operation counts and output comparisons, not interaction timings or CI results. No user workflow or visible state changes, so help instructions and screenshots remain current.

The local scoped check on this change selected 239 related test files. Static checks passed, and 225 test files passed. Thirteen files failed with 24 failed tests, and one file was skipped. Failures included five-second simulation deadlines in Case construction, contact probes, household chores, handoff, slots, terrain, imported worlds, league replay and passive parity. Lighten's pipeline exceeded its 30-second deadline. Map-world setup exceeded its ten-second hook deadline. Classroom carry-cup seed batches exceeded five seconds, leaving both grading assertions at 15 runs instead of 20. These failures remain unresolved and were not reproduced against the base revision. No deadlines, retries or quarantine entries changed. The focused `check:changed` on `sculptStroke.test.ts` passed all 28 tests in 170 ms, along with formatting, lint, site copy and types. A separate scoped check passed for the two documentation files.

## Shaders are compiled before they're needed

On software GL, each program's link blocks the main thread, and the idle callbacks' 2 s timeout let them run mid-work: driving the G1 with the camera on 2 CPUs, warm-up held the main thread for 20 to 850 ms at a time for about 12 s after the command, and 92% of a 35 s window under heavy load.

## Render on demand

- In a Linux container like CI's (software GL), these redraws ran during a LiDAR Case's dataset export and slowed it from about 40 s to over 200 s.

## Ready part builds drain without shifting the queue

The ready queue in `PartLayer` previously shifted its array after every build. An insertion-ordered set now deletes the consumed record without reindexing the remaining records. All ready-build producers use that same set, including component replacements, worker completion and whole-scene flushes.

A local queue-only probe on macOS arm64 with Node 26.13.0 compared array copying plus shifting against set construction plus ordered deletion. Each record held an integer id, and both drains produced the same checksum. Five warmup rounds preceded 11 measured rounds, alternating implementation order. Median milliseconds were:

| Records | Array shift | Set deletion |
| --- | --- | --- |
| 1,000 | 0.0196 | 0.0431 |
| 10,000 | 0.1679 | 0.3733 |
| 30,000 | 44.3427 | 1.2306 |

The set costs more on smaller queues in this probe. The change avoids the large-array shift cost without changing when builds run. These measurements include queue construction but exclude mesh preparation, GPU uploads and rendering. They are local measurements on a shared host, without a CI timing assertion or a claim about complete scene-load time.

`src/three/viewport/partLayer.test.ts` uses a controlled clock to verify ordered draining across frame budgets, unchanged behavior for zero and NaN budgets, replacement of unfinished work after scene sync, retained part identity and empty-queue flags after a whole-scene flush. Existing tests cover selection rebuilds, transform-only edits, hidden parts and posed measurements. GPU upload performance and asynchronous worker preparation are outside the new test's scope.

## Selection outline bounds reuse one projection workspace

The shared outline rectangle calculation previously created eight corner vectors, eight arrays (corner indices, corners, camera-space points, projected points and four coordinate lists), a box, a result rectangle and a padding vector per ordinary frame. It now retains one box, corner vector, rectangle and padding vector per outline instance. Bounds expand from current objects on every call. The corner loop accumulates projected extrema directly, without point or coordinate arrays.

For an ordinary eight-corner projection, each frame removes eight corner-vector constructions, eight array constructions, one box construction, one rectangle construction and one padding-vector construction. The old box constructor also created its two bound vectors. These are source-derived allocation counts, excluding Three.js internals, not wall-clock or GPU measurements. Frames encountering the near plane can stop before projecting all corners and still use the existing full-screen fallback.

`src/three/viewport/selectionScreenRect.test.ts` compares exact rectangles with the previous calculation across 40 transformed single- and multi-group selections with changing cameras, aspect ratios and padding. It also covers empty geometry, offscreen bounds, near-plane crossing, objects behind the camera, reset after these states, distinct outline instances and reuse of one projection vector across 16 corner projections over two calls. GPU mask rendering and total interaction latency are outside these checks. This changes no visible state or workflow, so existing help instructions and browser walkthroughs remain applicable.

Initial local validation on macOS arm64 with Node 26.13.0 passed formatting, ESLint, documentation, site copy and TypeScript through `check:changed`. Its related-test selection produced no test output after 8 minutes 5 seconds and was stopped, leaving that combined command incomplete. A direct run of `selectionScreenRect.test.ts` passed all three tests in 316 ms.

Review validation on the merged head completed `check:changed` for all five changed files on macOS arm64 with Node 26.13.0. Formatting, ESLint, documentation, site copy, TypeScript and all nine related tests across four files passed. Vitest reported 345 ms for the related tests. This closes the local related-test selection gap without claiming a CI result or a complete interaction speedup. No timeout, retry or quarantine was added.

## Camera redraws retain unchanged projection matrices

The whole-app search found one unconditional camera-follow projection update in `three/viewport/renderLoop.ts`, shared by all studio viewports. It now compares the calculated near plane with the camera's current value before rebuilding the projection and its inverse. Resize, thumbnail, plate, lens and capture paths change projection inputs and retain their explicit updates. Camera presets and Look Through change position and target, which the shared loop reads on its next render.

`renderLoop.projection.test.ts` drives the real loop with Three.js perspective cameras and lights, replacing only rendering, grid and orbit integration. After the first distance update, 600 equal-distance redraws reduce perspective projection updates from 600 to zero, while all 600 frames still render. Movement within the 0.5 mm near-plane floor also performs no projection update. Distance changes above the floor rebuild both matrices immediately. Tests compare projection and inverse matrices with fresh calculations, preserve external aspect and field-of-view updates, restore an externally changed near plane and check independent viewports.

These are deterministic operation counts, without timing assertions or a claim about full interaction latency. GPU rendering and browser navigation remain outside this unit coverage. No visible state, control or workflow changes, so help instructions and screenshots stay applicable. No quarantine applies.

## Robot camera following reuses one workspace

The whole-app search found one robot camera follower, `three/viewport/followCamera.ts`, attached to each studio engine's before-render callbacks. Its previous update constructed a world-position vector and cloned it into a displacement vector whenever the followed object existed. The update now reads world position into an instance-owned vector and converts it directly into the displacement. Each viewport retains one additional vector instead of creating two on every update, including updates below the movement threshold.

For 600 updates in each of two viewports, the source-derived temporary vector count falls from 2,400 to zero. `followCamera.test.ts` observes 1,200 world-position reads into exactly two distinct destinations and zero vector clones during these updates. The fixture moves for 300 frames and then remains stationary. These are deterministic operation counts, not timings or a claim about complete frame latency. Three.js internal work and GPU rendering are outside this count.

The motion test compares exact camera and orbit-target coordinates with the previous calculation across 600 updates. It includes a translated, rotated and scaled parent, settling, replacing an object under the same id, disabling following, a missing object and restarting following. Source object positions remain unchanged. The lighting follower in `renderLoop.ts` moves lights relative to the camera rather than tracking a robot. Operator hand and pose followers produce robot targets rather than camera movement.

No visible state or workflow changes, so help instructions and screenshots stay applicable. Browser navigation and render scheduling remain outside this focused coverage. No quarantine applies.

## Camera-follow lighting omits temporary vectors

Whole-app search found one camera-relative studio lighting update in `three/viewport/renderLoop.ts`. Robot camera following tracks objects separately. Thumbnail and plate lights use their own fixed arrangements. All studio redraws share the changed lighting update.

Previously each redraw cloned the key light position for change detection and the camera up vector for the fill offset. Scalar coordinate snapshots and `addScaledVector` remove both clones without adding retained storage. Arithmetic order and exact equality checks remain unchanged.

`renderLoop.lighting.test.ts` drives two independent viewports through 300 and 600 camera positions, rendering each position twice. These fixtures render 1,200 and 2,400 frames and assert zero vector clones, down from 2,400 and 4,800 clones in the previous path. They compare exact fill and key positions, preserve source up vectors and orbit targets, and check that unchanged frames do not dirty shadows. Separate coverage checks interaction-held lights, robot following during interaction, settling, changed shadow spans and explicit invalidation.

These are deterministic clone counts and source-derived previous counts, without timings, heap measurements or a complete frame latency claim. The tests use real Three.js cameras and lights with renderer, orbit integration and grid boundaries stubbed. GPU rendering and browser navigation are outside this coverage. No timeout, retry or quarantine changes apply. No user action, label or visible state changes, so help instructions and screenshots remain accurate.

Local `check:changed` validation on November 17, 2026 passed formatting, lint, documentation, site copy, TypeScript and all 12 related tests across six files. Copy diff reports zero added, changed or removed user-facing strings.

## Wheel panning reads camera basis coordinates directly

Whole-app search found one wheel-pan implementation in `three/viewport/wheel.ts`. Pan Scroll and Shift-scroll share it through `listenToWheel`, including studio viewports and part previews. The pan calculation now reads the first two camera-matrix columns directly and adds the scalar offset to the camera and orbit target. It no longer constructs right, up, unused forward and offset vectors. Zoom and orbit paths keep their existing calculations.

The affine determinant check retains Three.js's identity-basis fallback for singular matrices. Reading columns alone changed a `(2, 3, 0)` camera scale with horizontal and vertical offsets of 2 and 3 from `(2, 3, 0)` to `(4, 9, 0)`. The direct calculation preserves the former offset without vectors.

For 300 and 600 events in each of two viewports, this removes 2,400 and 4,800 temporary vector constructions. These are source-derived allocation counts, without timing or heap measurements and without a claim about complete interaction latency. No retained workspace is added.

`src/three/viewport/wheel.test.ts` compares exact camera and target coordinates with the previous vector calculation after every event. It varies rotation, scale, distance and positive, negative and zero deltas across independent viewports, including zero scales that exercise the singular-matrix fallback. It covers Pan Scroll and Shift-scroll, unchanged camera matrices, one orbit update per event, default prevention and listener removal. A spy verifies that panning no longer calls `extractBasis`. Browser event delivery, orbit integration and GPU rendering remain outside this focused test. No retry, timeout or quarantine changes apply.

No user action, label or visible state changes, so existing navigation help and screenshots remain accurate.

## Sculpt prepares source normals only when needed

Whole-app search found one shared stroke engine in `three/sculptStroke.ts`. Both stroke start and drag call it from `viewport/sculptInput.ts`. Inflate and Carve need source vertex normals. Flatten, Smooth, Pinch and Grab already skipped reading them, but still generated them when missing. They now skip that preparation as well. Every brush still recomputes final normals after all mirrored strokes.

On November 17, 2026, `sculptStroke.test.ts` compares complete position, normal and index buffers with explicitly prepared source normals. Its six brush cases each cover indexed and unindexed 16 by 12 spheres, inversion on and off, and both mirrored regions. A restored spy checks that missing-normal Flatten, Smooth, Pinch and Grab call `computeVertexNormals` once instead of twice. Inflate and Carve retain both calls. This removes one complete face accumulation and vertex normalization pass for the four brushes when source normals are absent.

These are asserted operation counts, not timings or a claim about ordinary pointer latency. Existing sculpt-data reconstruction already supplies normals, so that path saves no pass. Existing fixtures retain displacement, falloff, untouched vertices, input preservation and attribute-read coverage. No labels, actions or visible output change. [Sculpt a part](../../site/content/help/sculpt-a-part.md) remains accurate, so no help edit, screenshot or browser-test change applies. No timeout, retry or quarantine changes apply.

Scoped `check:changed` validation passed formatting, lint, docs, site copy for 323 pages and types. Its related selection passed 248 files and 1,743 tests, with one file and test skipped by existing configuration, in 81.28 seconds. The log is `scratch/check-sculpt-normals.log`. Copy diff net is zero.

## Wheel orbiting retains one workspace per listener

Whole-app search found one wheel-orbit implementation in `three/viewport/wheel.ts`. Studio viewports and part previews install it through `listenToWheel`. This change removes the per-event offset-vector clone and spherical-coordinate construction. Each listener retains those two objects until removal. Camera and orbit-target coordinates overwrite the workspace on every orbit event. Zoom and pan retain their current calculations.

`wheel.test.ts` compares exact camera coordinates with the previous calculation after every event across two independent listeners, for 300 and 600 events each. Targets move between events, offsets periodically collapse to zero, and large positive and negative vertical deltas exercise both polar limits. The tests preserve targets, default prevention, one orbit update per event and listener removal. A restored spy checks that all orbit conversions use exactly two spherical objects and two offset vectors across the two listeners.

The source-derived temporary construction count falls from 1,200 and 2,400 objects to zero for those fixtures. Four retained objects replace them across the two listeners. These are deterministic operation counts, without timing or heap measurements or a claim about complete interaction latency. Browser event delivery, OrbitControls integration and GPU rendering remain outside this focused coverage. No timeout, retry or quarantine changes apply. No user action, label or visible state changes, so existing navigation help and screenshots remain accurate.

Local scoped validation on November 17, 2026 passed formatting, lint, documentation, TypeScript and all 10 related tests across four files. The combined command failed at site copy because the unchanged `site/content/changelog/2026-11-17-export-electronics-with-a-robot-kit.md` line 15 contains “does not” instead of “doesn’t”. The same text is present in HEAD. No site policy changed. The log is `scratch/check-wheel-orbit.log`. Copy diff net is zero. Preflight flags the unchanged [Trackpad and mouse controls](../../site/content/help/trackpad-and-mouse-controls.md) article through its `covers` field. Its gestures, scroll modes and shortcuts remain accurate because this change only retains internal scratch storage.

## Agent frames emit segments directly

Repository searches for `cornerSegments`, `edgeSegments` and `agent-frames` found both segment builders in `three/viewport/agentFrames.ts`. They serve every subagent frame, including the focus outline. Both now append coordinates directly to their final lists.

Per changed focused frame, the previous bracket builder created eight temporary 18-coordinate lists. The outline builder created eight source-point lists, eight endpoint containers, twelve endpoint lists, twelve segment lists and eight flattened corner lists. Both output lists still exist, and Three.js still prepares its GPU attributes. These are source-derived allocation counts, not heap measurements or timings. Unchanged bounds already skip both builders.

`agentFrames.test.ts` compares complete bracket and outline coordinates against the former calculation for 60 translated, rotated, reflected and collapsed-axis poses. It checks all three emphasis states, unchanged bounds without geometry writes, missing targets, restoration and disposal. Rendering and GPU timing are outside this unit check. No user action, label or visible result changes, so help instructions and screenshots remain accurate.


## Frame-label hover streams projections

Repository searches for `nearestFrame`, `FrameLabel` and `projectPoints` found one frame-label hover path in `three/viewport/frameLabel.ts`, installed by `stageOverlays.ts` for studio viewports. Other projection callers produce measurements, marks, guide positions or Case trails rather than frame labels. Their output lists remain in use.

The frame picker now projects each matrix origin and immediately compares its screen distance with the current winner. Each label instance retains one vector and two screen coordinates. For N frames, each pointer move previously constructed two arrays, N coordinate triples, N projected-point objects and one projection vector. Those temporary constructions fall to zero within projection and selection. The pointer object and DOM rectangle read remain. These are source-derived allocation counts, without heap or timing measurements and without a claim about full pointer latency.

`src/three/viewport/framePicker.test.ts` compares exact winners and winning coordinates with the previous projection-list calculation across 120 queries over 64 frames. Camera position, view direction and both container and canvas sizes change between queries. Separate cases cover the inclusive 12-pixel boundary, later-frame ties, behind-camera and far-plane clipping, empty queries and recovery. Source matrices remain unchanged. Across 300 queries in each of two picker instances with three frames, a restored spy observes 1,800 projections using exactly two vector destinations.

DOM event delivery, label painting and GPU rendering remain outside this unit coverage. No user action, label or visible result changes, so help instructions and screenshots remain accurate. No timeout, retry or quarantine changes apply.

Local `check:changed` validation on November 17, 2026 passed formatting, lint, documentation, site copy for 330 pages, TypeScript and all nine related tests across four files. Vitest reported 372 ms for the related run. The log is `scratch/check-frame-picker.log`. Copy diff reports zero added, changed or removed user-facing strings.
