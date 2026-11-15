# Captured-world renderer setup

Measured on 14 November 2026 for [#985](https://github.com/JamelHammoud/basecase/issues/985), against base `727e7e1f4`.
The original Linux failure is in [Check run 43687018679](https://github.com/JamelHammoud/basecase/actions/runs/43687018679/job/132729516720).

## Cause and change

`worldRender.test.ts` bundled its real rendering pipeline inside a 15,000 ms setup hook.
The import path `worldRenderFixture` → `worldImport` → `roomPlan` → `schema` → `console/format` reached `sim/inputSources`.
The mesh pipeline's platform bridge also reached Case validation through dataset storage.
Input registration imported live camera handlers and the dynamic speech path.
Vite built their worker assets before any captured-world assertion ran.

A separate diagnostic build of `worldRenderAcceptance.ts` produced a roughly 14.7 MB main chunk and three worker assets.
Those workers were roughly 9.8 MB for geometry, 116.3 MB for inference and 20.5 MB for operator pose.
After the declaration split, the main chunk was roughly 8.8 MB and only the roughly 4.0 MB geometry worker remained.
These are uncompressed generated sizes, not download or resident-memory measurements.

`sim/inputRegistry.ts` now owns input declarations and defaults without importing handlers.
Console validation, layout and camera-drive defaults read that module.
`registerInputSource` still registers its handler and declares its id for validation.
The handler map, input precedence and lifecycle functions retain their existing paths.

## Method

Both series used the same Debian Bookworm container, Node 26.13.0 and Google Chrome 157.0.8103.78.
The container ran x86-64 Linux through OrbStack on Apple Silicon.
Its CPU quota was three cores (`cpu.max` was `300000 100000`).
Four background Node processes continuously hashed 1 MiB buffers with SHA-256 throughout both series.
Dependencies lived on the container's Linux filesystem, while source files used the worktree bind mount.
Preliminary measurements made before correcting a dependency symlink mount are excluded from these tables.
These are local Linux load measurements, not timings from a native GitHub runner.

An instrumented scratch copy of `worldRender.test.ts` ran ten times before and ten times after.
Each run used a new Vitest process, Vite build, Chrome profile and worker.
The copy retained all four tests, assertions and 15,000 ms hook and test deadlines.
No test was marked skipped or given retries.
No extra warmups or persistent bundle caches were used.

The copied OffscreenCanvas helper recorded `performance.now()` after bundling, server listen, Chrome launch, page creation and navigation.
A worker-ready message separated module loading from the existing `init` call, which creates the renderer.
The same instrumentation ran in both series and remains outside the default unit suite.
Elapsed time covers the command and its cleanup.
After each command exited, any Chrome process left by a timed-out hook was removed before the next run.

## Results

Before, **0 of 10 suites passed**.
Every setup hook reached its 15,000 ms deadline before the renderer was ready, blocking all four tests.
Median bundle time was **9,365 ms**, with a range of **8,118–11,182 ms**.

After, **10 of 10 suites passed**, including all **40 correctness checks**.
Median bundle time was **2,228 ms**, with a range of **1,991–2,531 ms**.
The sum of the recorded setup stages had a median of **9,403 ms** and a range of **8,302–10,370 ms**.
All existing pixel equality, mesh fallback, fisheye, collider-depth and encoded-frame assertions remained unchanged.

Median command elapsed time was 20.862 s before and 25.464 s after.
The before commands ended early without running the four tests.
The after commands included all four, so those elapsed times do not compare equal completed work.

All stage columns below are milliseconds.
`unreported` means that stage had not reported completion when Vitest stopped the hook.
It is not a zero-duration measurement.

### Before

| Run | Bundle | Listen | Chrome | Page | Navigate | Worker import | Renderer | Elapsed (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 11182 | 14 | unreported | unreported | unreported | unreported | unreported | 22.683 |
| 2 | 9930 | 13 | 2321 | 2281 | unreported | unreported | unreported | 21.437 |
| 3 | 8930 | 12 | 2246 | 2301 | 927 | unreported | unreported | 20.644 |
| 4 | 11030 | 45 | 3117 | unreported | unreported | unreported | unreported | 22.153 |
| 5 | 9737 | 47 | 2202 | 2503 | 522 | unreported | unreported | 21.092 |
| 6 | 10363 | 9 | 2205 | 2195 | unreported | unreported | unreported | 20.940 |
| 7 | 8993 | 8 | 2007 | 2483 | 668 | unreported | unreported | 20.516 |
| 8 | 8118 | 7 | 1877 | 2299 | 1092 | unreported | unreported | 20.784 |
| 9 | 8683 | 7 | 1922 | 2273 | 1097 | unreported | unreported | 20.110 |
| 10 | 8587 | 59 | 2318 | 2106 | 903 | unreported | unreported | 20.339 |

### After

| Run | Bundle | Listen | Chrome | Page | Navigate | Worker import | Renderer | Elapsed (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 2247 | 8 | 1872 | 2174 | 905 | 1412 | 916 | 27.066 |
| 2 | 2472 | 5 | 2481 | 2297 | 808 | 1485 | 822 | 27.264 |
| 3 | 2209 | 57 | 1810 | 2082 | 628 | 1583 | 903 | 25.182 |
| 4 | 2531 | 7 | 1884 | 2063 | 794 | 1417 | 917 | 25.526 |
| 5 | 2186 | 4 | 1591 | 2307 | 382 | 1405 | 719 | 24.805 |
| 6 | 2289 | 4 | 1718 | 2280 | 823 | 1679 | 1395 | 26.496 |
| 7 | 2415 | 6 | 1778 | 2030 | 880 | 1415 | 1195 | 27.293 |
| 8 | 2034 | 3 | 1661 | 1915 | 882 | 1244 | 567 | 24.597 |
| 9 | 1991 | 4 | 1600 | 2007 | 877 | 1231 | 592 | 25.401 |
| 10 | 2140 | 4 | 1566 | 1905 | 785 | 1323 | 719 | 25.102 |

## Regression coverage

`cases/worldImportRuntime.test.ts` parses the kitchen collider and 1,024-point splat with live input registration forbidden.
It failed on the old `console/format` import and passes after the split.
`sim/inputSources.test.ts` checks declaration parity against all nine registered built-ins, Case parsing and an additional source reaching drive reads.
The existing console parser tests retain their missing-source and unknown-source refusal checks.
`datasets/worldRender.test.ts` retains the real OffscreenCanvas renderer and its four correctness tests without timing assertions.
The existing `e2e/worldImport.e2e.test.ts` covers the app's captured-world import and dataset export entry points.

`tools/quarantine.json` had no `worldRender.test.ts` entry on the base commit, so no quarantine removal was needed.
