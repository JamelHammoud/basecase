# Viewport rendering performance

Implementation: [Viewport rendering](../guide/canvas.md#performance-viewport-rendering). Shared requirements: [Performance](../guide/performance.md).

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

Local validation on macOS arm64 with Node 26.13.0 passed formatting, ESLint, documentation, site copy and TypeScript through `check:changed`. Its related-test selection produced no test output after 8 minutes 5 seconds and was stopped, leaving that combined command incomplete. A direct run of `selectionScreenRect.test.ts` passed all three tests in 316 ms. This is local selector evidence on a shared host, not a failing test or a CI result. The remaining verification gap is completion of related-test selection in CI. No timeout, retry or quarantine was added.
