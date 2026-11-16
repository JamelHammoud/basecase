# Vision testing evidence

Coverage: [cases](../guide/cases.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Windows real-image vision training

The complete preparation, ONNX comparison, persistence and Apply Model test in `e2e/visionTraining.e2e.test.ts` is quarantined only on Windows through 28 November 2026 under [#1129](https://github.com/JamelHammoud/basecase/issues/1129). Run 43728033376 observed zero saved runs after Train on both attempts, while Linux passed the same commit in 12.825 s. The walkthrough was introduced by `899e7069c` after the last green nightly. The failing preparation, inference or persistence stage is not established. Restoring Windows coverage requires stage traces and at least ten runs before and after at equal load.

## Frame labels

The reference-pick walkthrough in `e2e/labelFrames.e2e.test.ts` is quarantined only on Windows through 28 November 2026 under [#1049](https://github.com/JamelHammoud/basecase/issues/1049). In run 43703438118, the first attempt saved no try after Stop Try, and the retry lost the Stop Try button during its click. The attempts share one `beforeAll` app. Linux passed at the same commit in 11.8 s, and the preceding Windows run passed in 41.4 s with unchanged walkthrough, recording, simulation and Case code. The cause is not established. The fix issue requires Windows traces through recording, scoring and persistence, and at least ten runs before and after at the same load.

## Training images

The combined palette, wrist-camera render and dataset-download walkthrough was deleted under [#1097](https://github.com/JamelHammoud/basecase/issues/1097) after taking 46 s in run 43715791435. Its quarantine entry for [#1033](https://github.com/JamelHammoud/basecase/issues/1033) was removed with it. The original generation stall remains unexplained.

The retained tests do not cover opening the training-image picker through the command palette.

## Production inference worker

`src/vision/inferenceWorker.test.ts` is quarantined through 28 November 2026 under [#1035](https://github.com/JamelHammoud/basecase/issues/1035). Run 43701002471 exceeded the unchanged 10 s `beforeAll` budget on Windows while opening its compiled-worker fixture, before the test ran. The file was added by `1ee6c8055` and passed on Linux at the same commit in 4.2 s. Run 43708315996 then exceeded the same setup budget on Linux, after passing in run 43705870784 in 3.7 s with unchanged fixture, inference runtime, dependencies and test configuration. The log does not identify whether bundling, Chrome launch or navigation stalled. The whole file is listed because its setup precedes individual-test quarantine hooks. Restoring it requires Linux and Windows setup traces and at least ten runs before and after at the same load on each platform.

## Rendered vision

The web-studio rendered-camera walkthrough remains quarantined through 28 November 2026 under [#992](https://github.com/JamelHammoud/basecase/issues/992). Run 43698588307 repeated the zero block signal from run 43687018679 on both attempts. The log does not identify whether capture, inference or result publication failed.
