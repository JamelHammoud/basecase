# Recorded-video worker setup

Measured on 15 November 2026 for [#1069](https://github.com/JamelHammoud/basecase/issues/1069), against base `f3c9acff4`.
The original Linux failure is in [Check 43710741335](https://github.com/JamelHammoud/basecase/actions/runs/43710741335/job/132801516102).
The [preceding Check](https://github.com/JamelHammoud/basecase/actions/runs/43708315996) passed the video test in 3,248 ms.

## Cause and change

The original helper bundled the worker, started an HTTP server, launched Chrome without a window, created a context and blank page, navigated to the server, then installed worker handlers.
It returned before the worker module finished importing.
Three concurrent browser fixtures reproduced the unchanged 15,000 ms setup timeout before any video assertion ran.
In the failed target run, bundling took 1,519 ms, server startup 5 ms, Chrome launch 4,286 ms, page creation 5,798 ms and navigation 3,298 ms.
Handler installation had not completed when the hook stopped waiting.
The existing failure log cannot establish whether that CI instance stalled in the same stage.
The reproduction demonstrates cumulative browser startup and navigation cost under contention.

`openOffscreenWorker` now uses a fresh temporary persistent Chrome context whose initial page opens directly on the test server through `--app`.
It omits the default `about:blank` page and keeps the existing SwiftShader flags.
There is no separate `newPage()` or `goto()` operation.
Setup also waits for a ready message posted after the worker module imports and installs its request handler.
A probe using a persistent context with its ordinary blank page did not materially reduce setup time, so that approach was not used.

Both helper callers pass a setup abort signal and abort it from `afterAll`.
They await the pending setup and its cleanup even when `beforeAll` timed out before returning the worker handle.
Chrome launch receives only the unused fraction of the existing 15,000 ms setup budget.
If Chrome launch returns after cancellation, the helper closes that context before rejecting.
Server cleanup closes connections and awaits socket closure, including when Chrome cleanup rejects.
No timeout was increased and no retry was added.

## Method

Both series used the same Debian Bookworm container with Node 26.13.0 and Google Chrome 157.0.8103.78.
It ran x86-64 Linux through OrbStack on Apple Silicon, with a three-core quota (`cpu.max` was `300000 100000`).
The source and dependencies lived on the container's Linux filesystem.
`CI=true` and `BASECASE_QUARANTINE=off` were set.
Four background Node processes continuously hashed 1 MiB buffers with SHA-256 throughout both series.
These are local Linux load measurements, not native GitHub runner timings.

A preliminary ten-run series with one browser fixture passed all ten runs.
The comparison below ran three copies of the real video test concurrently with `--maxWorkers 3`, adding browser startup contention.
Each of ten rounds used a fresh Vitest process, three fresh bundles, three Chrome profiles and three module workers.
The after series changed the shared helper for all three copies and retained the same workload.
No round was discarded from either ten-round series.
Every measured round rebuilt its bundles without retries or assertion changes.
The unchanged 15,000 ms setup and 5,000 ms test deadlines applied to every copy.
All six frame brightness checks, JPEG dimensions and minimum sizes, rotated dimensions and end pixels, and exact video request paths were retained.
The fixture continued to encode and decode its own VP9 MP4 through Mediabunny.
A process check after the comparison found no live Chrome processes.

Scratch copies recorded stages with `performance.now()`.
Before, a ready message recorded worker import separately without waiting for it in setup.
After, worker initialization includes that ready handshake.
The after launch stage includes initial page creation and navigation, which now happen inside `launchPersistentContext()`.
The page and navigation columns say `in launch` because no separate operations remain.
Elapsed time covers the whole three-fixture Vitest command and cleanup.
Tables show the designated target copy from each round.

## Results

Before, **9 of 10 rounds passed**, with **27 of 30 video tests passing**.
All three copies exceeded their setup hooks in the failed round, so none of their video assertions ran.
After, **10 of 10 rounds passed**, with **30 of 30 video tests passing**.
The target's completed setup stages had a median of 13,145 ms before and 11,609.0 ms after.
Before excludes the setup that never completed.
After includes worker readiness, which the original setup did not await.
The target's browser launch, page and navigation stages together had a median of 11,053.5 ms before and 8,531.5 ms after.
After setup ranged from 10,602 to 12,875 ms.
These samples demonstrate the measured improvement, not an absence of all possible scheduler stalls.

All stage columns below are milliseconds.
`unreported` means the stage had not completed before the setup timeout.
It is not a zero-duration measurement.

### Before

| Run | Bundle | Listen | Chrome | Page | Navigate | Install handlers | Worker import | Elapsed (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1519 | 5 | 4286 | 5798 | 3298 | unreported | unreported | 21.787 |
| 2 | 1412 | 4 | 3477 | 5501 | 2409 | 1518 | 514 | 22.690 |
| 3 | 1319 | 4 | 2984 | 5308 | 2500 | 794 | 1134 | 21.761 |
| 4 | 1331 | 61 | 3318 | 5103 | 2296 | 809 | 1800 | 22.240 |
| 5 | 1413 | 5 | 3776 | 5107 | 1103 | 903 | 3026 | 22.800 |
| 6 | 1390 | 4 | 3414 | 5203 | 2506 | 803 | 1306 | 22.596 |
| 7 | 1314 | 3 | 3299 | 5107 | 2590 | 1510 | 665 | 22.185 |
| 8 | 1413 | 4 | 3288 | 4795 | 3111 | 2011 | 488 | 23.512 |
| 9 | 1298 | 3 | 3383 | 5196 | 2310 | 894 | 1701 | 22.708 |
| 10 | 1217 | 4 | 2993 | 7003 | 1115 | 813 | 1110 | 22.000 |

### After

| Run | Bundle | Listen | Chrome with initial page | Page | Navigate | Worker ready | Elapsed (s) |
| --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| 1 | 1412 | 4 | 8809 | in launch | in launch | 1481 | 20.518 |
| 2 | 1236 | 60 | 7712 | in launch | in launch | 1612 | 18.717 |
| 3 | 1324 | 4 | 7686 | in launch | in launch | 1688 | 18.974 |
| 4 | 1393 | 3 | 8490 | in launch | in launch | 1313 | 19.124 |
| 5 | 1510 | 3 | 8573 | in launch | in launch | 1926 | 20.303 |
| 6 | 1569 | 4 | 9893 | in launch | in launch | 1409 | 21.000 |
| 7 | 1407 | 4 | 8111 | in launch | in launch | 1990 | 19.760 |
| 8 | 1291 | 4 | 8692 | in launch | in launch | 1805 | 20.047 |
| 9 | 1388 | 3 | 8802 | in launch | in launch | 1691 | 20.512 |
| 10 | 1396 | 4 | 7510 | in launch | in launch | 1692 | 19.167 |

## Regression coverage

`offscreenWorker.test.mjs` checks cancellation before resource acquisition, cancellation during Chrome launch, late launch completion, cancellation during worker initialization, and cancellation racing with readiness.
It also checks the remaining Chrome launch budget, initial-page use, ownership after initialization, launch failure and server cleanup when Chrome cleanup rejects.
`offscreenWorkerBundle.test.mjs` checks the ready message before real worker results and errors.
`src/vision/tryFrameVideo.test.ts` retains every real video assertion and both existing deadlines on all platforms.
`src/datasets/worldRender.test.ts` uses the same cancellation lifecycle and retains all four WebGL renderer checks.
`src/vision/tryFrameMedia.test.ts` retains clip offsets, boundaries, sample drawing and disposal checks.
`src/vision/tryFrames.test.ts` retains saved-try extraction, MCAP timestamps, labels and source validation.

`tools/quarantine.json` had no entry for `tryFrameVideo.test.ts` on the base commit, so no entry needed removal.
The video test has no platform exclusion.
No help article or changelog entry is needed because this changes test setup rather than a product workflow.
