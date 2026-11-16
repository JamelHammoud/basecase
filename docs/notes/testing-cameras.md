# Cameras test evidence

Current coverage: [owning guide](../guide/cameras.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Camera refusal on first launch

The refusal walkthrough in `e2e/firstLaunch.e2e.test.ts` supplies `NotAllowedError`. Run 43721538732 on Windows stayed at Opening the camera for 15 s while the test relied on the host rejecting capture. Its retry then read an autosave from the shared app. Run 43728033376 then timed out in the new app's navigation before testing refusal, with the shared rover app still running. Its retry logged readiness after 113.411 s and exceeded the unchanged 180 s test budget. The cause is not established. This walkthrough is quarantined only on Windows through 28 November 2026 under [#1127](https://github.com/JamelHammoud/basecase/issues/1127). Linux passed at the same commit in 14.089 s. Restoring the Windows walkthrough requires startup and cleanup traces and at least ten runs before and after at equal load.

## Target overlay comparisons

The comparison in `src/utils/targetOverlay.test.ts` had the following budget evidence. Run 43710741335 exhausted the unchanged 5 s test budget, after the preceding Linux run took 4.0 s for the file.

## Live cameras

The standalone rover frame-rate e2e was removed under [#1096](https://github.com/JamelHammoud/basecase/issues/1096) after taking 43 s in run 43715791435. It required more than 15 frames in a fixed 1.5 s window after simulation and camera startup.
