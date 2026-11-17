# Viewport rendering performance

Implementation: [Viewport rendering](../guide/canvas.md#performance-viewport-rendering). Shared requirements: [Performance](../guide/performance.md).

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

## Captured-world camera rendering stays in workers

On demand, `node tools/perf/worldVideosBench.mjs` measures rendering and encoding a 10 s, 30 fps, two-camera kitchen episode against Open Floor, including stage creation. It prints both times and fails above a 3× ratio. Timing never runs in Check.

## Parts draw in batches, not one draw call each

`my-robotics-design` (488 parts) went from 1,273 GL calls per orbit frame to 9, main-thread work from 3.2 to 0.9 ms and GPU-process time from 1.5 to 0.9 ms. An edit to one part once stalled `look` for 284 ms.

## Sculpt brushes reuse per-stroke workspaces

`sculptStroke.test.ts` checks all six brushes' displacement, falloff, mirrored regions and input preservation, and bounds vector clones at three for 300 and 600 vertices without symmetry. The previous 300-vertex fixture cloned 203 vectors for each of the four direction brushes. This is an allocation count, not a wall-clock measurement.

## Sculpt applies independent brushes during the radius scan

Inflate, Carve, Flatten, Pinch and Grab no longer collect affected indices and falloffs or calculate an unused affected center. Each moves a vertex immediately after its radius test. Smooth still gathers affected vertices before moving them, preserving its original center and avoiding a second whole-mesh scan for sparse brushes.

`src/three/sculptStroke.test.ts` checks all six brush results, untouched vertices, symmetry and stroke input preservation. Its 300- and 600-vertex fixtures affect 200 and 400 vertices. For each of the five independent brushes, position reads including normal recomputation fall from 800 and 1,600 to 600 and 1,200. Each stroke also removes two growing arrays with 200 or 400 entries apiece and the corresponding center additions. The read counts are asserted, and array and center counts follow from the removed code. These are operation counts, without timing assertions or a complete interaction speedup claim. Stroke start and drag share this path. No workflow or visible state changes, so help instructions and browser coverage stay unchanged.

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
