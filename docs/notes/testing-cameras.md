# Cameras test evidence

Current coverage: [owning guide](../guide/cameras.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Camera refusal on first launch

The refusal walkthrough in `e2e/firstLaunch.e2e.test.ts` supplies `NotAllowedError`. Run 43721538732 on Windows stayed at Opening the camera for 15 s while the test relied on the host rejecting capture. Its retry then read an autosave from the shared app. Run 43728033376 then timed out in the new app's navigation before testing refusal, with the shared rover app still running. Its retry logged readiness after 113.411 s and exceeded the unchanged 180 s test budget. The cause is not established. This walkthrough is quarantined only on Windows through 28 November 2026 under [#1127](https://github.com/JamelHammoud/basecase/issues/1127). Linux passed at the same commit in 14.089 s. Restoring the Windows walkthrough requires startup and cleanup traces and at least ten runs before and after at equal load.

## Target overlay comparisons

The comparison in `src/utils/targetOverlay.test.ts` had the following budget evidence. Run 43710741335 exhausted the unchanged 5 s test budget, after the preceding Linux run took 4.0 s for the file.

## Live cameras

The standalone rover frame-rate e2e was removed under [#1096](https://github.com/JamelHammoud/basecase/issues/1096) after taking 43 s in run 43715791435. It required more than 15 frames in a fixed 1.5 s window after simulation and camera startup.

## Windows operator vision startup

[Check run 43820519938](https://github.com/JamelHammoud/basecase/actions/runs/43820519938) kept `operatorCamera().live` false at `e2e/vision.e2e.test.ts:65` on both Windows attempts. Linux passed at the same revision. The preceding Windows run 43739315274 passed in 13.608 seconds, with unchanged camera code, fixture, harness, dependencies and e2e configuration. Each attempt opens a fresh app. The logs do not identify the command, capture, worker readiness or detector stage responsible. This case is quarantined only on Windows until 28 November 2026 under [#1366](https://github.com/JamelHammoud/basecase/issues/1366). The separately quarantined rendered-camera case remains owned by #992.

The walkthrough retains real fake-camera pixels through the pixel-sensitive ONNX detector and a separate pose fixture on Linux and macOS. Framework-free inference, pose forwarding, worker-error and shutdown checks remain active everywhere. Restore Windows after startup and cleanup traces identify the cause and ten before and ten after observations at equal load retain camera readiness, the face signal, 640 by 480 dimensions and the visible detection box. Repair measured no flake rate.

[Exact-revision diagnostic 43824318285](https://github.com/JamelHammoud/basecase/actions/runs/43824318285) selected the exact operator vision test at `017a5f2a7313ce68c18a51acc390cef00b7f2084`. Observations 1 through 7 passed and 8 through 10 failed. It used ten independent one-worker Windows processes, retries and quarantine disabled, Node v26.13.0, four CPUs and Windows image `20261103.298.1`. This supplies same-revision Windows pass/fail evidence for quarantine, without claiming a startup fix or equal-load before/after improvement.
