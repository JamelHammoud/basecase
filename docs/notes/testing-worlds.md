# Worlds testing evidence

Coverage: [cases](../guide/cases.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Scan maps

The combined browser story took 32 s in run 43642970706 (#866).

### Windows corridor import and playback

[Check 43938326448](https://github.com/JamelHammoud/basecase/actions/runs/43938326448) at `fb3bbfdf9134497770b7414be3c19858a0c522c8` failed the focused Scan Matching walkthrough on both Windows attempts. The first reached the imported corridor tile but observed zero map points at `importCorridor` line 55. The second observed no `Imported 1 try` confirmation at line 51. Neither reached the Scan Matching command. Linux passed the same walkthrough at that revision in 11,330 ms. The test and `src/dataLayers/` inputs did not change between full green Check 43864963744 and this failure.

Classification: intermittent Windows import or playback setup with an unresolved stage. The same shared helper already failed at these two stages in the saved-world walkthrough under #995. No single causative merge or environment change is established, so this repair changes no app code, assertions, deadlines or retries. The focused walkthrough joins the existing Windows quarantine through 28 November 2026 under [#995](https://github.com/JamelHammoud/basecase/issues/995). Other platforms retain it. Windows temporarily lacks the combined import-to-rendered-map Scan Matching browser assertion, while the map fusion, matching settings, cache separation and rendered-layer pipeline tests remain active.

The existing owner must trace import completion, playback loading, worker readiness and errors, map reconstruction and cleanup from page boot with isolated attempts. Preserve the initial point bound, enabled matching state, actual Layers menu action, disabled matching state, increased point count and empty app errors. Restoration requires at least ten baseline and ten candidate runs at equal load with retries disabled. This repair performs no repeated flake-rate measurement.

One focused Windows observation at the failed revision passed the exact Scan Matching walkthrough in 54,467.0811 ms through ticket `efd61e99-ca61-450f-9b6d-695b612782d5`, [diagnostic 43942484131](https://github.com/JamelHammoud/basecase/actions/runs/43942484131). It used one worker, zero retries and quarantine off. The process took 66,820 ms, and the diagnostic job took 4.767 elapsed minutes including preparation. The verified manifest records Windows image `20261103.298.1`, Node v26.13.0 and four CPUs. This confirms a pass and failure at the identical workload revision without identifying the responsible stage or measuring a flake rate. The existing #995 issue also owns reducing this long walkthrough while preserving its user-visible assertion.

## Captured worlds

The Windows corridor-world walkthrough is quarantined through 28 November 2026 under [#995](https://github.com/JamelHammoud/basecase/issues/995). Run 43693830979 failed both attempts at different import or playback stages. Its failing worker stage is not established. Restoring it requires Windows traces and at least ten runs before and after at the same load. The kitchen import setup in `e2e/worldImport.e2e.test.ts` was simplified under [#1142](https://github.com/JamelHammoud/basecase/issues/1142) after taking 37 s in run 43739315274. The duplicate kitchen recording and export test was removed under [#1145](https://github.com/JamelHammoud/basecase/issues/1145) after passing in 75.124 s in run 43739315274. Its Windows quarantine was removed with it. `datasets/worldRender.test.ts` remains quarantined on all platforms through 28 November 2026 under [#985](https://github.com/JamelHammoud/basecase/issues/985) after render-worker setup timed out.


### Focused kitchen import walkthrough

[#1781](https://github.com/JamelHammoud/basecase/issues/1781) reported the kitchen import walkthrough above 30 seconds. [Check 44245137178](https://github.com/JamelHammoud/basecase/actions/runs/44245137178) recorded 31,377 ms on Windows and 25,871 ms on Linux for `opens New Case with its splat and separate colliders without adding scene parts`. The complete three-test file took 50,335 ms and 36,922 ms respectively. The retrieved log is retained locally in `scratch/issue-1781-ci.log`.

The test combined world import with a second Run Case camera workflow. The repair removes that second workflow, including camera startup, two worker captures, PNG decoding and pixel-difference polling. The remaining walkthrough keeps the real drop, selected Kitchen and Reach a Spot choices, Make Case, active Case, loaded world, registered hash, rendered splats, bounded colliders, unchanged scene part count and empty app errors. Mesh fallback and splat-only refusal remain separate browser tests. No timeout, retry or quarantine changes are made.

`three/viewport/importedWorld.test.ts` covers Spark setup, collider transforms and cleanup. `datasets/worldRender.test.ts` contains the captured-pixel and floor-baseline assertions through the real worker pipeline, but remains quarantined under #985. Its restoration conditions are unchanged. Removing the live Scene-tile comparison leaves that combined captured-world camera path without an active browser assertion. This is a deliberate scope reduction for the slow import walkthrough, not evidence that the quarantined renderer checks are passing.

No candidate browser timing was measured locally because this lane runs only changed-file checks. The CI values above measure the original whole test, not the removed camera phase. Candidate timing and cross-platform browser results remain for pull request CI.

## Topic-only import map regression

[Check 44227652023](https://github.com/JamelHammoud/basecase/actions/runs/44227652023) at `8416f27ec38e9271d3cb3cf10b28848cf4a81e4d` failed both Linux corridor walkthroughs before either Layers action. Import completed and the saved try opened, but map points stayed zero. Commit `3ad17140d` (#1766) changed every source without joint columns into a model-free saved source, even when a robot was already in the scene. Its independent timeline exposes no recording to `useMapLayer` or `useMapWorld`, bypassing the existing reconstruction pipeline.

Classification is a commit regression with a code-established cause. A reverse-apply check of the complete feature conflicts in its help and changelog pages, retained in `scratch/comparison-revert-check.log`. The forward repair connects a single opened saved source to the existing Map and Make World consumers. The comparison worker reuses its prepared topic index for map fusion and its retained recording for world reconstruction. Derived map arrays and prepared world geometry transfer to the renderer. Source bytes remain in their owning worker, no physics preparation is introduced, and imports and comparison reopening keep their independent-source behavior. Closing or replacing the source invalidates map publication and world completion.

`cases/comparison/comparisonMap.test.ts` imports generated corridor MCAP through real model-free import handlers, opens the resulting saved bytes through the production worker jobs and requires more than 360 mapped points. Disabling matching must increase points. World preparation requires a registered hash, bounded collision pieces, floor estimate and the exact imported source id. Source hashes stay unchanged after both jobs. The focused changed-file run passed 17 tests across seven files in 1.16 seconds, including both new real-pipeline cases. This is local correctness evidence, not a Linux or Windows browser rate.

Both browser corridor declarations keep their exact point bounds, Scan Matching and Make World assertions. World provenance is strengthened from a truthiness assertion to the exact tile id. Existing Windows quarantines under #995 remain because their earlier import and playback intermittency is separate. Linux browser confirmation belongs to CI.

The combined changed-file validation passed 167 tests across 26 files, plus formatting, lint, types, documentation, site copy and quarantine validation. The Make World action test also checks source-owned reconstruction dispatch, duplicate-action exclusion and result delivery. Its log is `scratch/repair-final-check.log`. Preflight identified existing help coverage. Mapping instructions now describe whole-run map retention without promising simulated robot movement for an independent source. The Build, Strength, blocker and comparison articles keep their existing controls and steps.
