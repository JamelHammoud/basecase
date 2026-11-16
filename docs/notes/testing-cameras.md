# Cameras test evidence

Current coverage: [owning guide](../guide/cameras.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Camera refusal on first launch

The refusal walkthrough in `e2e/firstLaunch.e2e.test.ts` supplies `NotAllowedError`. Run 43721538732 on Windows stayed at Opening the camera for 15 s while the test relied on the host rejecting capture. Its retry then read an autosave from the shared app. Run 43728033376 then timed out in the new app's navigation before testing refusal, with the shared rover app still running. Its retry logged readiness after 113.411 s and exceeded the unchanged 180 s test budget. The cause is not established. This walkthrough is quarantined only on Windows through 28 November 2026 under [#1127](https://github.com/JamelHammoud/basecase/issues/1127). Linux passed at the same commit in 14.089 s. Restoring the Windows walkthrough requires startup and cleanup traces and at least ten runs before and after at equal load.

## Target overlay comparisons

The comparison in `src/utils/targetOverlay.test.ts` had the following budget evidence. Run 43710741335 exhausted the unchanged 5 s test budget, after the preceding Linux run took 4.0 s for the file.

## Live cameras

The standalone rover frame-rate e2e was removed under [#1096](https://github.com/JamelHammoud/basecase/issues/1096) after taking 43 s in run 43715791435. It required more than 15 frames in a fixed 1.5 s window after simulation and camera startup.

## Study camera visibility

On 16 November 2026, the focused production-worker matrix passed all ten generated workflows and its combined near-plane and 256-part control. Fixtures use the existing robot and passive-world schemas, prescribed saved body poses and the shipped Camera Module 3 mesh. They test rendering and visibility, not physical success of a grasp, drive or articulated task.

The pinhole oracle is a 32 × 32 region with 1,024 target pixels. The moving target or camera leaves view for the second sample. A foreground surface fully occludes the third sample and halves the fourth to 512 pixels. Exact image bounds and independently prescribed one-second intervals must match. Complementary camera results remain separate and combine at each sample. The fisheye edge fixture compares against an independent scalar equidistant projection, with a two-pixel boundary allowance for nearest-sampled cube faces. The imported fixture contains two corridor walls and a floor. The articulated fixture replays a passive slider. Empty target declarations refuse before rendering. Near-plane targets return zero visible and isolated pixels.

The initial isolated-pixel test passed alone but exceeded its unchanged 15-second budget during the first broad related run. The matrix setup also exceeded its unchanged 15-second setup budget in that run. The duplicate rendering test was removed, with its exact pixel assertions retained in the matrix. Robot/model construction moved outside the browser bundle, and all scenarios share one test-owned production `LiveStage` with explicit final disposal. The focused matrix and related persistence, training-hook and hook-name checks then passed 15 tests across four files in 22.90 seconds. No retry, skip, quarantine or deadline was added.

The production entry capture exposed an eight-vertex placeholder in the first reconstructed camera model. Its real-mesh reconstruction had a different model hash, so Study correctly refused before publishing a result. Supplying complete catalog `MeshFiles` through the existing scene-preparation contract fixes this Study source path without editing the training-image picker or its repair. The first 100,000-triangle limit also excluded the shipped camera, whose decoded geometry contains 119,682 triangles. Camera Study now prepares geometry in its worker with a 1,000,000-triangle limit.

The final documentation capture used the production bundle and drove the same steps as `e2e/studyCamera.e2e.test.ts`. It selected two orientations, obtained 0% and 50% visibility from one source key, inspected details, previewed, applied the real camera rotation and undid it. The saved result identity remained unchanged and the app error list was empty. The new browser declaration sets retries to zero and retains the shared deadlines. Linux and Windows observations are not available from this local session.

`visibilityLifecycle.test.ts` checks changed recording bytes, stale model hashes, missing or malformed recordings, empty targets and 257-part rejection before creating a renderer. It also checks immutable geometry handles. `studyVisibility.test.ts` checks missing assets, wrong scene/Case selection, failed source loading and abort disposal. `studyCameraRun.test.ts` checks stop and scene-switch guards, one source load, one geometry preparation and no copied Case passes. Camera pose precision, lens edits, persistence and one-step Undo/Redo have focused tests. The source refuses unknown lens angles rather than inferring sensor characteristics. Existing camera and Study quarantines are unchanged.

A subsequent broad related run passed 502 tests but exceeded the existing five-second budget in two classroom seed batches and the matrix’s 15-second budget in its fisheye case. The next matrix case then observed the disposed views from that unfinished request. The edge fixture now samples its two distinct-time endpoints instead of rendering four identical poses. Its exact visible/outside intervals and independent pixel-boundary assertions remain. A focused run then passed all 29 tests across nine related files in 16.87 seconds. These observations do not establish Linux or Windows reliability.

After the redundant fisheye captures were removed, the final named changed-file check passed all 507 related tests across 85 files in 41.84 seconds. Formatting, lint, TypeScript, guide links and all 297 site pages passed. The new transport test asserts zero engineering binary buffers in camera measurement packets. The production entry capture completed in 13.92 seconds, with Apply, Undo and no app errors. Browser walkthrough declarations are committed for CI, without a local e2e suite run.
