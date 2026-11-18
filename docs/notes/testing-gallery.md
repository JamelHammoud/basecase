# Gallery testing evidence

Coverage: [cases](../guide/cases.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Windows gallery navigation

Three tests in `e2e/gallery.e2e.test.ts` are quarantined only on Windows through 28 November 2026 under [#1139](https://github.com/JamelHammoud/basecase/issues/1139): phone landing and missing links, shared joystick and HUD, and shared code panel isolation. Run 43736502131 saw no missing-link message on the first attempt, then timed out navigating on retry. Both shared-panel tests timed out navigating on both attempts before their assertions. All five gallery tests passed on Linux at that commit in 21.226 s and on Windows in the preceding run 43735086890 in 34.826 s. Only benchmark tests and their guide changed between those runs. Attempts share one browser and close pages only after success, so failed pages can remain active. The initial navigation or resource bottleneck is not established. Restoring the three Windows tests requires startup and cleanup traces and at least ten runs before and after at equal load, keeping their existing assertions and deadlines.

## Windows rover driving

The rover-driving walkthrough is quarantined only on Windows through 28 November 2026 under [#1403](https://github.com/JamelHammoud/basecase/issues/1403). [Run 43851640785](https://github.com/JamelHammoud/basecase/actions/runs/43851640785), at `f96f5b9e362aadc2ab0563657caa477be2e16eba`, reached forward movement but measured RTF 0.8791354659462937 against the unchanged greater-than-0.9 assertion at line 140. Retry exhausted the unchanged 30 s navigation deadline at line 106 for `/c/rover-reach-the-flag`. Both attempts took 79.911 s together. The log establishes neither the initial throughput cause nor the navigation stall. Pages close only after success and share a browser, so a failed attempt can retain a running simulation.

The preceding [run 43847119378](https://github.com/JamelHammoud/basecase/actions/runs/43847119378), at `20de3136695df8ff456133ecd010e37b27ffedf6`, passed this Windows test only on retry in 86.627 s. Linux passed in 4.808 s. Gallery, camera, browser-test, dependency and e2e configuration files were unchanged between these runs. This is classified as intermittent Windows behavior rather than attributed to a merge. No local flake-rate measurements were taken during repair.

Linux and macOS retain rover driving, and Windows retains Open Scene. Route and shared-bundle validation remain in `gallery.test.ts` and `sharedRobot.test.ts`. Windows loses the browser movement and real-time-factor check while this entry is active. Restoration requires traces from page load through simulation stepping, RTF sampling and attempt cleanup, plus at least ten runs before and ten after at equal load. Keep correctness assertions and deadlines intact. Timing budgets belong on demand if the fix replaces this story with deterministic browser coverage. Coordinate shared-browser ownership with #1139.

## Gallery training

The overlapping hexapod browser test was removed after taking 39 s in run 43642970706 (#861).

## Shared Case code panels

The duplicate Run Case sequence was removed after the combined test took 33 s in run 43715791435 ([#1085](https://github.com/JamelHammoud/basecase/issues/1085)).

## Leagues

Review found that browser replay passed no mesh files into `headlessParts`, which awaited only supplied file keys. Catalog components could therefore be measured as placeholder boxes while their downloads ran. Replay now loads all referenced catalog meshes before building or measuring and refuses a failed download. The real replay test compares browser-fetched geometry with adjudication-supplied geometry and exercises a failed model download.

The original workflow checked out the latest dispatch commit for adjudication despite the manifest’s fixed runner version label. Creation now binds `engine.commit`, replay checks out that commit, and frozen verification refuses provenance from another commit. The shipped fixture retains its versioned local runner and seeded measurements.

The browser tests cover a failed seed, clearing stale verdicts when selecting another seed, Open Scene preservation, mismatched-Case refusal and a successful immutable submission through the palette. Browser tests were updated for CI and were not run locally during review. No live Hub publication or workflow dispatch was performed.

## Windows League creation deadline

[Check 44218519123](https://github.com/JamelHammoud/basecase/actions/runs/44218519123), workload `88795454ecb795f17e855d5ca2b50a3f95b1be14`, exhausted the unchanged 5,000 ms callback deadline in `tools/leagues/prepare.test.mjs`. Previous Windows Check 44214681066 at `505f2d5b599f005dfaf201ce6dbe863f762916d4` passed the same CLI creation in 2,327 ms. Creation, CLI preparation, fixture, dependency lock and unit configuration are unchanged between those revisions. No causative merge or environment change is established.

[Diagnostic 44220727583](https://github.com/JamelHammoud/basecase/actions/runs/44220727583), ticket `09ef2f3f-513c-4bfd-b6e3-7d8fdfc4e113`, passed the exact test at the failed revision in 1,242.1862 ms. Its process took 1,935 ms. The collected artifact verifies Windows x64, Node v26.13.0, image `20261103.298.1`, four CPUs, one worker, zero retries and quarantine off. This establishes intermittent execution, without distinguishing temporary setup, the Node child, jiti imports, MuJoCo startup, output writes and cleanup.

Quarantine only that exact declaration on Windows through 28 November 2026 under [#1762](https://github.com/JamelHammoud/basecase/issues/1762), opened with fix, next and priority labels. Windows temporarily lacks the combined CLI, pinned manifest and exact workflow checkout-output assertion. `src/leagues/create.test.ts` and `league.test.ts` retain creation and validation checks. Other platforms retain the CLI path. Restoration requires stage and cleanup tracing, an established fix and at least ten baseline and ten candidate Windows observations at equal load with retries disabled. Preserve the real CLI, exact manifest, empty entries and exact checkout output. Evidence is in `scratch/diagnostics/09ef2f3f-513c-4bfd-b6e3-7d8fdfc4e113/`. No repeated rate measurement or local browser run was performed.
