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

## Editable appearance

The optional visual finish uses the existing part builder and scene asset transport. Its generated projection scale is a uniform, with one shader key per projection plane. Editing it replaces materials while retaining existing cached CAD and catalog geometry keys. GPU texture ownership is counted by content hash, mapping and color-space use. The final owner disposes the GPU texture. The bitmap cache closes evicted unused images above 8,388,608 pixels.

The focused render fixture uses a 4 × 4 local color texture on a 40 mm box at 64 × 64 output. It records preparation cost, encoded bytes, draw calls and retained texture resources while asserting pixels for UV orientation, changed scale, rotation and generated projection. This is a renderer integration measurement, not an input-to-display latency budget or a physical GPU throughput claim.

The editing walkthrough is declared in `e2e/appearance.e2e.test.ts`. It loads two parts, edits Appearance through ordinary Inspector controls, imports a local texture, changes scale, undoes and redoes, then saves and reloads the scene through IndexedDB. Linux and Windows browser delivery are left to CI. No device, account or discrete GPU is required.

An initial changed-file check selected broad existing physics and import tests through the shared part builder and scene types. Its inputs changed during implementation, so it is not evidence for the final revision. Its local log is retained in the task handoff, including timeout failures under concurrent host load. Three missing-world assertions exposed a registry fallback regression, which was corrected by retaining strict imported-world lookup. No timeout, retry or quarantine was changed.

The first focused run passed 17 acceptance checks. Its renderer assertions passed texture application, orientation, scale, rotation and projection, then exposed an incorrect zero-GPU-texture oracle. Three.js keeps a PBR-owned texture after an untextured draw. The fixture now records that baseline before requiring zero additional finish-owned textures after disposal. This does not relax the finish ownership assertion.

The article capture attempt failed in `openApp` at its existing 30-second navigation deadline while serving cold development modules. It produced no screenshot. No deadline or retry policy was changed.

The corrected focused check completed on macOS with six files and 33 passing tests. It included the ten-design finish matrix, local asset pipeline, renderer pixels and existing scene-file, saved-scene and world-asset tests. The related test phase took 5.66 seconds. This run preceded subsequent Inspector transaction typing and nested appearance validation changes, so final changed-file evidence remains separate.

Rendering transport uses worker-created Blob handles for texture entries. `renderMeshFiles` adds them only to rendering jobs. Engineering-only `sourcedMeshFiles` keeps binary component files without textures. Render workers read and verify image bytes locally. This replaces the initial buffer-slicing implementation, which could copy up to the full 32 MiB scene texture budget on the interaction thread for a render message. The removed copy count is an implementation fact, not a measured input-latency improvement.

Encoded texture content in the session registry is capped at 256 MiB. This is separate from per-scene bytes, per-scene pixels and unused decoded bitmap retention. Restoring a table checks its combined additions before registering entries. Current scenes and undo references keep their accepted content instead of being silently evicted.

The decoded-image ownership gap found during implementation is covered by preparation leases. A consumer pins every referenced image before preparation and releases it after material acquisition or cancellation. The concurrent-consumer regression prepares three 4,194,304-pixel images before creating any material, exceeding the idle budget. It asserts that all three maps survive, remain owned by materials and become evictable only after final disposal. Separate cases cover aggregate decoded reservation refusal, decode errors, forced builds waiting for images and disposed preparations. Geometry-only consumers no longer decode textures.

Main advanced while the draft was retained. Merge resolution preserves imported vertex colors together with UV coordinates, and uses the shared ModelMeshData declaration. Workbench identity omits visual appearance, with a physical-evidence preservation regression. The existing workbench changelog needed two contractions to pass the current site-copy rule. No test deadline, retry or quarantine changed.

The maximum accepted scene fixture prepares two distinct 2048 × 2048 PNG images in a real browser worker. A focused macOS run recorded 19.1 ms for decoding after hashing, 177,465 encoded bytes and 8,388,624 retained pixels including the earlier 4 × 4 fixture. Those pixels occupy 33,554,496 RGBA bytes before bitmap overhead or GPU upload. No decode reservation remained. Cold preparation for the 4 × 4 fixture recorded 205.2 ms, one draw call and zero additional GPU textures after disposal. The ten portable robot fixtures occupy 459–1,083 gzip bytes. These fixture measurements do not establish physical GPU throughput or process-wide memory use.

The production article walkthrough measured 64.6 ms from the native finish change event to the second animation frame under software rendering. No recorded long task overlaps that interval. The browser reported 33,335,492 used JavaScript heap bytes after the walkthrough. This is one observation, not a peak-memory or latency distribution. Startup and capture intervals separately recorded long tasks up to 5,653 ms, so the measurement does not claim the entire walkthrough stays responsive. The worker measurements and retained-group CPU samples cover the finish change itself. Logs and exact fixture outputs are referenced by `scratch/task-handoff.json`.

The full changed-input run after merging main passed static checks and 4,458 related tests, with 18 test timeouts, a renderer teardown timeout and a kit setup timeout across physics, reconstruction and replay consumers. The run used default local concurrency on a shared host. Every failed test reported its existing timeout, with no material-value or pixel assertion failure. A focused final feature run passed 33 tests across nine files, including history, ten designs, ownership, real renderer pixels, recreated selection arrays and workbench evidence. The production article capture passed and wrote both help states and the cover, although its server teardown reported the existing ten-second shutdown warning. No timeout, retry, skip or quarantine was added.

Mapping variants share decoded-image Sources. The image source version stays unchanged when another mapping is created, so a transform edit does not request another upload of unchanged pixels. The real worker renderer checks one retained GPU upload across two simultaneous scale variants, alongside final-owner disposal. Staged encoded Blob handles are also bounded to 256 MiB per rendering realm before registration.

A final profiled software-rendered walkthrough recorded 4,988 ms from the finish event to two animation frames, including a 1,689 ms long task. It reported 32,444,179 JavaScript heap bytes after capture. The CPU trace sampled 1,416 ms in `getProgramInfoLog`, 241 ms in `getShaderInfoLog` and 3,264 ms idle. These observations differ sharply from the earlier 64.6 ms sample and do not establish steady production responsiveness. The previous handoff retains those counters in `scratch/appearance-previous-handoff.json`. The current trace and summary at `scratch/appearance-finish.cpuprofile` and `scratch/appearance-finish-profile-summary.json` describe the later material-reuse implementation. Disabling shader diagnostics was not used as a shortcut. The texture preparation worker and material-edit CPU samples do not explain away the observed viewport stall.

The final scalar/GPU focused check passed 13 tests across two files, including the ten-design matrix, the untextured standard-program regression and real pixel/upload assertions. The broad one-worker changed-input run still reports existing physics and electrical-kit test timeouts. It does not establish a passing delivery check, so that run did not establish a passing launch. Article states and the cover were captured from the final production bundle without extending navigation, test or teardown deadlines.

The final one-worker changed-file run completed in 671.59 seconds. It passed formatting, lint, types, documentation, site checks and 4,489 tests across 585 passing files. Seven tests failed at their existing five-second deadlines: six electrical-kit cases and the Rough Ground hexapod case. One file and one test were skipped by existing configuration. All added appearance acceptance tests passed, including concurrent ownership, history, camera/physical fingerprints, shader reuse and GPU upload reuse. That required check failed. It provided no reason to raise a deadline, retry, remove a test or assert a passing launch.

## Appearance material program ownership

The slow finish trace exposed program ownership churn. An appearance-only part rebuild created new material objects and disposed the previous ones before the replacement draw. The renderer could consequently lose its last reference to a compiled program and query shader logs again. Appearance replacements now retain compatible mesh and edge material instances, transfer texture ownership and preserve the per-material projection uniform. Replacement texture initialization acquires the existing shared GPU image before prior texture handles release it. Shader diagnostics remain enabled.

The acceptance worker renders a selected box, applies Paint, Rubber and Original, and compares the actual program IDs after each draw. It then loads a planar image and changes its scale and rotation, comparing the compiled program IDs and the underlying WebGL texture handle. Fast tests also check material identity, native restoration, live uniform values and final disposal. This is a resource-identity proof, separate from the production walkthrough timing.

Main changed during continuation. Merge resolution preserves selected-object source filtering and real Case world preparation. Captured object snapshots now participate in appearance validation, asset budgets and portable export even without their original scene source. Body-analysis and nested readiness evidence use a shared appearance-free physical projection, while camera evidence includes nested finishes. The focused Case test exercises a real builder snapshot, ordinary saving, portable reopening and a malformed captured shader axis.

The material-reuse production walkthrough recorded 189.7 ms from the native finish event to two animation frames under software rendering. No recorded long task overlaps that interval. Neither shader-log nor program-log queries appear in its sampled finish trace. It reported 37,621,181 JavaScript heap bytes after capture. Startup and later texture/capture intervals still contained long tasks, including 5,562 ms before the finish event. These are separate single observations under uncontrolled shared-host load, not a paired latency rate or a full-application responsiveness claim.

The real worker fixture retained program IDs `[7, 8]` for Paint, Rubber and Original. Adding a texture produced `[7, 8, 9]`, and changing its scale and rotation retained those IDs and the same WebGL texture handle. The worker's preparation sample was 228 ms for the small cold texture and 73.6 ms for the two-image maximum scene fixture, with 177,465 encoded bytes and 33,554,496 decoded RGBA bytes including the earlier tiny fixture. It retained one draw call and zero additional finish GPU textures after disposal. Timing observations include host contention and are not CI throughput guarantees.

The first full material-reuse run passed static checks and 5,560 tests. One unchanged training-resource declaration timed out while rescoring 1,000 retained predictions. Its isolated changed-file diagnostic then passed both cases in 632 ms total. That establishes intermittent execution under different load, not a repaired training test or a failure rate. The earlier electrical-kit and Rough Ground failures did not recur in this run. Capture and full-test work overlapped, so final verification runs without a concurrent capture workload. No retry policy, timeout, assertion or quarantine changed.

Final verification without concurrent capture passed formatting, lint, TypeScript, documentation, site checks and 5,561 tests across 756 passing files. One file and one test remain skipped by existing configuration. The related run took 518.50 seconds with two local workers. Its exact input hashes and log are `scratch/appearance-shipping-inputs.json` and `scratch/appearance-shipping-check.log`. No source code changed after that run began. Final reporting and help wording were checked separately. Linux and Windows ordinary-entry delivery remains declared in `e2e/appearance.e2e.test.ts` for CI, as instructed. No test assertion, deadline, retry or quarantine changed.

### Appearance browser export failure

Pull request #1987’s Linux Check on November 21, 2026 failed after the saved-scene reload, while polling for the exported `.basecase` download. The hook returned no download name. The job reported 203,243 ms including its configured retry and a separate 180,000 ms test timeout. The aggregate Check failed solely because `e2e-changed` failed. This log does not establish a production export defect or identify which export preparation boundary stalled.

The duplicate export and file-drop segment was removed from the browser walkthrough. `appearance/assets.test.ts` still encodes and decodes real portable files with texture content, checks asset deduplication and complete part equality, and exercises ordinary and history round trips. `appearance/appearance.test.ts` retains the ten-design portable-file matrix. The browser declaration keeps ordinary Inspector multi-selection, cancellation, import, scale, undo/redo, IndexedDB save and page reload. It no longer confirms the Appearance-to-Export-menu-to-file-drop path in a browser. There is no quarantine, added retry or increased deadline. Browser execution remains with CI.

### Appearance review corrections

Review found that a base-color image on a finish with opacity 1 stayed on the opaque material path. Its zero-alpha pixels therefore covered the background, and the instance pass had no positive alpha threshold. Color maps now enable transparency and disable depth writes. The real worker fixture adds a transparent quadrant to the existing 4 × 4 image, checks the exposed magenta background and retains an opaque green control quadrant. Normal and roughness/metalness maps alone do not change transparency.

The capture readiness helper waited only for authored parts. A captured Case object's world layer could still be preparing its image. The helper now awaits both layers for captures and mesh-readiness queries. `three/viewport/captureReadiness.test.ts` holds a real world part's bitmap decode, requires both entry points to remain pending, then checks material acquisition and released preparation leases.

Mixed selection hid finish fields when the primary part used Original. Texture fields also displayed only that part's mapping and slot state, while the preset selector treated color and mapping differences as different presets. Selection-wide controls now retain common scalar values, show differing numeric values as blank and expose Mixed for differing mapping or normal orientation. Texture slot actions and missing-asset notices visit every selected part. Import progress uses the existing Spinner.

Browser declarations measure labels, option text, entered values and units for clipping and overlap at the Inspector's supported 290 px minimum. They cover the empty, importing, textured, mixed and single-part Appearance states, keyboard scalar editing and Undo. The mixed fixture includes a missing normal map and maximum scale and rotation values. Linux and Windows browser execution remains with CI. These additions make no latency or memory improvement claim and change no timeout, retry, skip or quarantine. Scene-tabs documentation now describes saved-scene browser reload coverage and portable-file integration coverage separately.

The review's two-worker related selection passed 2,460 tests across 304 files in 264.66 seconds, including the new worker alpha assertion and Case world readiness regression. One file and one test stayed skipped by existing configuration. The initial command failed only the new browser layout helper's complexity lint. Splitting its text and input measurement functions resolved that finding, and its targeted changed-file check passed. Inspector changed-file validation then passed formatting, lint, TypeScript, all 366 site pages and 13 related tests across seven files. Separate documentation validation passed. Logs are `scratch/review-1987-check.log`, `scratch/review-1987-layout-check.log`, `scratch/review-1987-inspector-check.log` and `scratch/review-1987-docs-check.log`. The final browser declaration's static check is recorded in `scratch/review-1987-browser-declaration-check.log`. No application walkthrough or visual judgment was run during review.

## Rendered robot composition

The native composition renderer uses the existing prepared geometry and appearance path in its own OffscreenCanvas worker. The ten generated appearance fixtures are reused, including the shipped Camera Module 3 GLB, imported UV geometry, custom nodes, repeated modules and articulated pose deltas. Tests decode the exported PNGs rather than reading only the source canvas.

On 20 November 2026, `check:changed` ran the focused production renderer bundle in Chrome with SwiftShader on the shared macOS host. All ten designs passed exact matrix, material, framing, helper-exclusion, transparent-background and repeated-pixel assertions. The transparent enclosure also retained partial alpha. Opaque background pixels matched sRGB `[128, 128, 128]`. Controlled lighting and environment rotation exceeded the test's changed-pixel thresholds. Missing textures refused rendering.

At 96 × 64 output with a prepared shared test stage and catalog asset, the rover sample prepared in 1.9 ms, rendered and copied in 3.5 ms, and encoded in 158.1 ms. The mixed imported/custom sample prepared in 0.2 ms, rendered and copied in 2.4 ms, and encoded in 136.2 ms. These are single observations under uncontrolled shared-host load, without a paired before/after comparison or throughput guarantee. Worker startup, environment initialization and main-thread message cloning are outside those prepared-stage durations. The retained observation is `scratch/composition-prepared-metrics.json`. Per-run records are `scratch/composition-design-0.json` through `scratch/composition-design-9.json`.

The 500-module fixture prepared in 14.3 ms, rendered and copied in 20.9 ms, and encoded in 141.6 ms with that prepared stage. It issued 500 draws and retained zero appearance texture owners after disposal. The logical canvas and bitmap payload allowance was 73,728 bytes, with environment, multisampling, depth and renderer storage additional. Decoded texture storage in the shared test realm was four pixels from the earlier texture fixture. These ownership counts and payload sizes are not measurements of total process or GPU peak memory. The retained observation is `scratch/composition-prepared-metrics.json`, with the latest run in `scratch/composition-large.json`.

The first cold-stage matrix run took 42.17 seconds with one 5-second case timeout. A later cold-stage run under shared-host contention had cascading timeouts across all 13 cases. The matrix now prepares one production stage during its existing 15-second setup and restores absolute lighting settings between jobs. It retains two PNG exports and exact repeated-pixel assertions per design. The ordinary export still owns and disposes its worker stage, and the scalar-alpha case exercises that cold path. The first prepared-stage check passed 19 tests across four selected files in 34.04 seconds. A broader run then hit the same 5-second deadline on the catalog-camera design. Its fixture re-provided identical binary handles before geometry checks and both exports, invalidating prepared meshes each time. Setup now prepares that catalog asset once, and the test jobs reuse its existing prepared mesh instead of resubmitting it. Production mesh-provider semantics remain unchanged. After the fixture correction, the renderer and download guards passed 27 tests across five selected files in 9.81 seconds. Setup and test deadlines are unchanged. No retries or quarantine were added. These runs used different host loads and do not establish a timing rate or a product latency improvement.

The browser declaration records `composition:export` details, main-thread long tasks, pointer-to-two-frame intervals, maximum frame gap and sampled main-heap high water during PNG delivery while selecting ordinary Layers rows. The client adds synchronous dispatch time and end-to-end job latency. Sampling ends when the download arrives and never changes the product render loop. CI's production walkthrough writes `scratch/render-composition-browser.json`. Linux and Windows results remain CI observations, not local claims. No full-studio production responsiveness or process-memory observation was made locally.

Article captures used the ordinary toolbar, Frame Scene, Transparent and Preview controls through `openApp` and `captureArticle`. They used the development server only for documentation capture. Their timing does not establish production responsiveness. The captures are committed under `site/public/help/render-a-robot-image/` and `site/public/changelog/render-robot-images/`.

The worker enforces 64–4096-pixel sides and 8,388,608 output pixels before creating WebGL resources. It retains the existing scene texture budget. The studio permits one composition job, terminates superseded workers and has no main-thread renderer fallback. Source edits, poses, settings, scene replacement and closure refuse delivery in `workspace/useRenderComposition.test.ts`. Existing screenshot helper contracts remain in `viewport/captures.test.ts` and `viewport/captureReadiness.test.ts`. Camera and dataset renderers are unchanged.

### Composition review repairs

The next Linux changed-browser run on 21 November 2026 passed PNG delivery and saved-settings restoration again. The narrow-canvas declaration reached palette dismissal and failed at line 172 because Render image had also closed, receiving zero panels instead of one in both recorded attempts. The palette prevented the default Escape action but let the event reach the workspace after closing itself. It now stops propagation before closing. The existing browser assertion remains unchanged, including the later worker cancellation and empty-scene recovery checks. The aggregate Check failed solely because the changed-browser job failed. Browser execution of this repair remains with CI.

The pull request's Linux changed-browser run on 21 November 2026 passed PNG delivery and saved-settings restoration. The narrow-canvas declaration failed its unchanged readability assertion on `2C2C2C`, the Background hex value, in both recorded attempts. Background shared a row with an 88px label column, leaving too little space for the swatch and hex input. It now uses the existing stacked FieldRow layout. The same browser declaration retains text-width, overlap, containment and cancellation assertions. The aggregate Check failed because this browser job failed, with no separate static failure. Local revision validation uses changed-file checks, and browser verification remains with CI. No assertion, timeout, retry or quarantine changed.

Review found that composition's fixed 340px width and unwrapped controls could exceed a narrow canvas, and the containing toolbar could clip its Render Image entry when the Inspector was wide. The panel and toolbar now constrain themselves to 12px canvas insets and wrap their action rows. The panel uses the shared matte surface and its own error boundary. Esc previously closed the panel while NumberInput was cancelling its draft. It now leaves the panel open until the next Esc, and modifier shortcuts can reach the workspace palette from panel controls. The shared ColorField also committed an escaped draft through its synchronous blur handler. It now guards that blur, with a browser assertion that the Background field retains its prior value. The renderer quality and dimension footnote was removed from the controls. The help article retains the limits.

Preview validity previously checked parts, project pose and scene identity, leaving an old preview visible after settings or joint edits outside the panel. Delivery also compared only project pose identity, missing viewport-only animation. `workspace/compositionSource.test.ts` covers external settings and joint changes while retaining selection independence. `workspace/useRenderComposition.test.ts` checks live-pose refusal, cancellation through the existing viewport render notification and listener cleanup. Only authored solid part matrices participate, so revealing operand helpers through selection does not cancel an otherwise current export. `useCompositionPreview` discards previews on live pose changes through the same notification, without requesting additional renders. No interaction latency improvement or total-memory measurement is claimed for these repairs.

`composition/scene.test.ts` now covers empty CAD, imported mesh, boolean and component geometry mixed with an ordinary solid. These inputs previously could produce incomplete output, except for components with an explicit placeholder marker. They now refuse the export. Documentation distinguishes missing Appearance assets from SimReady visual textures, which this worker does not load and which therefore remain a rendering limit.

`e2e/renderComposition.e2e.test.ts` adds measured text, entered-value and unit bounds in ordinary, preview, pending and empty-source error states. The narrow declaration uses the minimum 1240 × 720 window and a 620px Inspector, then checks panel and toolbar containment, button hit areas, keyboard draft cancellation, palette access and cancellation during worker loading. It reuses the Appearance layout measurement helper and strengthens its existing parent-text bounds. Browser execution remains with CI. No preview server, screenshot judgment, retry, timeout increase or quarantine was used during review.

Review validation passed the 18-file changed check with types, lint, docs, all 370 site pages and 33 related tests across 11 files. The later shared ColorField repair and its browser declaration passed their four-file changed check with the same static checks and 146 related tests across 42 files. Those selections overlap and are not a combined unique-test count. Logs are `scratch/review-1996-final-check.log` and `scratch/review-1996-color-check.log`. Browser assertions were written and statically checked but were not executed locally.

## Transform attachment removal

Windows Check 44878070469 completed both parameter-bound dimension updates, then its empty-console assertion found two `TransformControls: The attached 3D object must be a part of the scene graph` errors. The same declaration passed on both platforms in the last full green 44792356422. Mesh rebuilds replace the selected group, while TransformControls can still hold the old group until the normal completed-build refresh. Its scene-helper update reports that detached parent.

The gizmo now watches only its current attachment's `removed` event. Removal detaches synchronously, selection changes release the previous listener, and disposal releases the current listener. The completed-build path still owns reattachment. No scene rebuild, geometry identity, render cadence or main-thread scheduling changes. `gizmoAttachment.test.ts` uses real Three controls and covers selection changes, removal before drawing, no console error and watcher disposal. The existing dimension browser assertion stays intact on every platform. This is lifecycle evidence, not a measured performance improvement or a hosted candidate result.

Review extends the dimension-binding browser declaration to wait for the selected Mount mesh to measure 104 mm wide after the shared parameter changes, before checking the unchanged empty-console assertion. The earlier document-state predicate alone could finish before the viewport installed replacement geometry. The added measurement uses the existing production triangle reader. It does not force pending builds to complete. Browser execution remains with CI.

## Windows composition download observation

Check 44878070469 reported all three composition declarations as passed after retries but retained an unhandled 30000 ms download rejection from line 80 of the PNG story. Its first attempt opened the finished arm and composition controls. The log does not establish whether worker computation, captured-source guards, export dispatch or download delivery stalled. A late handler for an event promise can report an unhandled rejection before a later retry passes.

Only that Windows declaration is quarantined through 28 November under priority [#2022](https://github.com/JamelHammoud/basecase/issues/2022). Linux passed all three stories. Windows retains field readability and cancellation, saved settings and fast composition renderer coverage, with a temporary gap in combined transparent PNG delivery and unchanged editing state. Restore after a demonstrated cause and ten baseline and ten candidate equal-load Windows observations with retries disabled. Preserve dimensions, filename, alpha, visible pixels, selection, source identity and all current deadlines. No rate was measured here.

## Windows Appearance reload

Check 44885120824 at `49bc213c8ddd9462ea323dacd07a1378b94783f5` failed the combined Appearance story on Windows after Undo, Redo and Save. Its live scene and IndexedDB equality checks had already observed both parts at texture scale 25. After reload, both returned with scale 10 at line 144. Another attempt exhausted the unchanged 180000 ms callback deadline without a final stage trace. Linux passed at the same revision. The final writer and restoration source are unresolved. A save or reload timeout does not identify an import, scalar-control or rendering cause.

Only that combined Windows declaration is quarantined through 28 November 2026 under priority [#2028](https://github.com/JamelHammoud/basecase/issues/2028). Linux and macOS retain it. Windows retains the Original-first mixed-finish browser declaration and real appearance assets, history and portable-file matrices. These do not replace its combined ordinary texture, Undo/Redo, IndexedDB and reload story. The owner must separate current document, pending autosave draft, version and preview writes, transaction completion and reload restoration. Preserve complete part equality and both scale values. Restore only after a demonstrated correction and ten baseline and ten candidate observations at equal Windows load, with retries disabled and current assertions and deadlines intact.

A focused same-revision Windows observation is retained under ticket `6ed9843e-c3f8-4ccb-953a-f3e0fc839729`, [diagnostic 44886986248](https://github.com/JamelHammoud/basecase/actions/runs/44886986248). It uses one worker, one independent process, quarantine off and retries disabled. Its verified result passed the exact declaration in 10,106.9 ms, with 36,430 ms for the process and 5.53 elapsed job minutes including preparation. It used Windows image `20261116.315.1`, x64 Node 26.13.1 and four CPUs. The artifact is retained in `scratch/diagnostics/6ed9843e-c3f8-4ccb-953a-f3e0fc839729/`. A pass and failure at the same workload revision establish intermittency, without identifying the final writer or measuring a rate. No candidate improvement is claimed.

## Linux composition renderer deadlines

Check 44887426902 passed shared worker setup and twelve renderer declarations, then exhausted the unchanged 5000 ms callback for scalar cover alpha and hidden/reference exclusion. [Exact-revision diagnostic 44889750784](https://github.com/JamelHammoud/basecase/actions/runs/44889750784) instead exhausted the unchanged 15000 ms beforeAll deadline before any assertion, in a 16020 ms process. It used one worker, quarantine off, retries disabled, x64 Node 26.13.1 and four CPUs on Ubuntu image `20261116.202.1`. The callback and hook are different observed failures. Bundling, server startup, Chrome launch, worker readiness, catalog loading, shader warming, stage creation, rendering and PNG encoding have no separate trace. Recreating the scalar test's stage is a hypothesis, not an established cause.

The whole Linux `composition/render.test.ts` file is quarantined through 28 November 2026 under existing composition owner [#2022](https://github.com/JamelHammoud/basecase/issues/2022), with shared worker coordination through #1400. Windows and macOS retain all 13 pixel declarations. Linux retains composition scene, settings, client and workspace lifecycle checks and the composition browser stories, which do not replace decoded scalar alpha, ten-design repeatability or GPU cleanup. Restore the Linux hook and scalar path only after a demonstrated correction and ten baseline and ten candidate equal-load observations for each affected path with retries disabled and unchanged assertions and deadlines. Ticket `dc8e9dbe-d427-4503-ba7c-3c372102d1df` retains the collected artifact. The collector marks it `verified: false` because setup failed before selecting an assertion. It remains hook-failure evidence, not a scalar-alpha observation. No rate or performance improvement is claimed.

## Linux Appearance reload in Check 44887426902

The combined Appearance declaration observed live and stored texture scale 25 before reload, then restored both parts with scale 10. Another attempt exhausted 180000 ms without a final stage trace. Existing owner [#2028](https://github.com/JamelHammoud/basecase/issues/2028) now owns the Linux declaration as well as Windows, with separate writer, autosave, transaction and restoration evidence per platform. It is quarantined through 28 November 2026. macOS retains the combined story, and Linux and Windows retain Original-first mixed editing and the real assets, history and portable-file matrices. These do not replace the combined reload path. Preserve complete part equality and both scale values, and restore only after a demonstrated fix and ten baseline and ten candidate equal-load observations on each excluded platform with retries disabled and current deadlines intact.

[Exact-revision Linux diagnostic 44889803768](https://github.com/JamelHammoud/basecase/actions/runs/44889803768) passed the combined Appearance declaration in 14177.22926 ms, with a 39522 ms process, one worker, quarantine off and retries disabled. It used x64 Node 26.13.1 and four CPUs on Ubuntu image `20261116.202.1`. Ticket `9c3fecd6-6fd7-403a-a2c5-cd5f2a0ed68b` retains its verified artifact. This confirms Linux intermittency without a rate or a shared Windows cause. It does not establish candidate completion.
