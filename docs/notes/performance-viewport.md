# Viewport rendering performance

Implementation: [Viewport rendering](../guide/canvas.md#performance-viewport-rendering). Shared requirements: [Performance](../guide/performance.md).

## Captured-world camera rendering stays in workers

On demand, `node tools/perf/worldVideosBench.mjs` measures rendering and encoding a 10 s, 30 fps, two-camera kitchen episode against Open Floor, including stage creation. It prints both times and fails above a 3× ratio. Timing never runs in Check.

## Parts draw in batches, not one draw call each

`my-robotics-design` (488 parts) went from 1,273 GL calls per orbit frame to 9, main-thread work from 3.2 to 0.9 ms and GPU-process time from 1.5 to 0.9 ms. An edit to one part once stalled `look` for 284 ms.

## Sculpt brushes reuse per-stroke workspaces

`sculptStroke.test.ts` checks all six brushes' displacement, falloff, mirrored regions and input preservation, and bounds vector clones at three for 300 and 600 vertices without symmetry. The previous 300-vertex fixture cloned 203 vectors for each of the four direction brushes. This is an allocation count, not a wall-clock measurement.

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
