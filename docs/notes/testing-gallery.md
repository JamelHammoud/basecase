# Gallery testing evidence

Coverage: [cases](../guide/cases.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Windows gallery navigation

Three tests in `e2e/gallery.e2e.test.ts` are quarantined only on Windows through 28 November 2026 under [#1139](https://github.com/JamelHammoud/basecase/issues/1139): phone landing and missing links, shared joystick and HUD, and shared code panel isolation. Run 43736502131 saw no missing-link message on the first attempt, then timed out navigating on retry. Both shared-panel tests timed out navigating on both attempts before their assertions. All five gallery tests passed on Linux at that commit in 21.226 s and on Windows in the preceding run 43735086890 in 34.826 s. Only benchmark tests and their guide changed between those runs. Attempts share one browser and close pages only after success, so failed pages can remain active. The initial navigation or resource bottleneck is not established. Restoring the three Windows tests requires startup and cleanup traces and at least ten runs before and after at equal load, keeping their existing assertions and deadlines.

## Gallery training

The overlapping hexapod browser test was removed after taking 39 s in run 43642970706 (#861).

## Shared Case code panels

The duplicate Run Case sequence was removed after the combined test took 33 s in run 43715791435 ([#1085](https://github.com/JamelHammoud/basecase/issues/1085)).

## Leagues

Review found that browser replay passed no mesh files into `headlessParts`, which awaited only supplied file keys. Catalog components could therefore be measured as placeholder boxes while their downloads ran. Replay now loads all referenced catalog meshes before building or measuring and refuses a failed download. The real replay test compares browser-fetched geometry with adjudication-supplied geometry and exercises a failed model download.

The original workflow checked out the latest dispatch commit for adjudication despite the manifest’s fixed runner version label. Creation now binds `engine.commit`, replay checks out that commit, and frozen verification refuses provenance from another commit. The shipped fixture retains its versioned local runner and seeded measurements.

The browser tests cover a failed seed, clearing stale verdicts when selecting another seed, Open Scene preservation, mismatched-Case refusal and a successful immutable submission through the palette. Browser tests were updated for CI and were not run locally during review. No live Hub publication or workflow dispatch was performed.
