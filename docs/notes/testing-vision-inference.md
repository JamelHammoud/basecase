# Inference-worker startup testing evidence

Coverage: [Cases](../guide/cases.md#testing-coverage) and [Cameras](../guide/cameras.md#testing-coverage). Placement: [Vision evidence index](testing-vision.md). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Production inference worker

`src/vision/inferenceWorker.test.ts` is quarantined through 28 November 2026 under [#1035](https://github.com/JamelHammoud/basecase/issues/1035). Run 43701002471 exceeded the unchanged 10 s `beforeAll` budget on Windows while opening its compiled-worker fixture, before the test ran. The file was added by `1ee6c8055` and passed on Linux at the same commit in 4.2 s. Run 43708315996 then exceeded the same setup budget on Linux, after passing in run 43705870784 in 3.7 s with unchanged fixture, inference runtime, dependencies and test configuration. The log does not identify whether bundling, Chrome launch or navigation stalled. The whole file is listed because its setup precedes individual-test quarantine hooks. Restoring it requires Linux and Windows setup traces and at least ten runs before and after at the same load on each platform.
