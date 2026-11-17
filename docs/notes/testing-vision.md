# Vision testing evidence

Coverage: [cases](../guide/cases.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Windows real-image vision training

The complete preparation, ONNX comparison, persistence and Apply Model test in `e2e/visionTraining.e2e.test.ts` is quarantined only on Windows through 28 November 2026 under [#1129](https://github.com/JamelHammoud/basecase/issues/1129). Run 43728033376 observed zero saved runs after Train on both attempts, while Linux passed the same commit in 12.825 s. The walkthrough was introduced by `899e7069c` after the last green nightly. The failing preparation, inference or persistence stage is not established. Restoring Windows coverage requires stage traces and at least ten runs before and after at equal load.

Run 43856125616 at `3ef3c70d1c36e8629b5097260dffe1d802075e48` observed the same zero-saved-run failure at line 58 on both Windows attempts, taking 32.972 seconds in total. Both controlled training-and-stop tests were excluded from this observation because they are not quarantined. The optional quarantine step completed without failing the job. This repeats #1129's completion symptom without identifying a preparation, inference or persistence cause. Its existing Windows entry and restoration conditions remain unchanged.

## Frame labels

The reference-pick walkthrough in `e2e/labelFrames.e2e.test.ts` is quarantined only on Windows through 28 November 2026 under [#1049](https://github.com/JamelHammoud/basecase/issues/1049). In run 43703438118, the first attempt saved no try after Stop Try, and the retry lost the Stop Try button during its click. The attempts share one `beforeAll` app. Linux passed at the same commit in 11.8 s, and the preceding Windows run passed in 41.4 s with unchanged walkthrough, recording, simulation and Case code. The cause is not established. The fix issue requires Windows traces through recording, scoring and persistence, and at least ten runs before and after at the same load.

## Training images

The combined palette, wrist-camera render and dataset-download walkthrough was deleted under [#1097](https://github.com/JamelHammoud/basecase/issues/1097) after taking 46 s in run 43715791435. Its quarantine entry for [#1033](https://github.com/JamelHammoud/basecase/issues/1033) was removed with it. The original generation stall remains unexplained.

The retained tests do not cover opening the training-image picker through the command palette.

## Production inference worker

`src/vision/inferenceWorker.test.ts` is quarantined through 28 November 2026 under [#1035](https://github.com/JamelHammoud/basecase/issues/1035). Run 43701002471 exceeded the unchanged 10 s `beforeAll` budget on Windows while opening its compiled-worker fixture, before the test ran. The file was added by `1ee6c8055` and passed on Linux at the same commit in 4.2 s. Run 43708315996 then exceeded the same setup budget on Linux, after passing in run 43705870784 in 3.7 s with unchanged fixture, inference runtime, dependencies and test configuration. The log does not identify whether bundling, Chrome launch or navigation stalled. The whole file is listed because its setup precedes individual-test quarantine hooks. Restoring it requires Linux and Windows setup traces and at least ten runs before and after at the same load on each platform.

## Rendered vision

The web-studio rendered-camera walkthrough remains quarantined through 28 November 2026 under [#992](https://github.com/JamelHammoud/basecase/issues/992). Run 43698588307 repeated the zero block signal from run 43687018679 on both attempts. The log does not identify whether capture, inference or result publication failed.

## Linux live operator overlay

The live Find Faces walkthrough entered Linux-only quarantine under [#1404](https://github.com/JamelHammoud/basecase/issues/1404), with an expiration of 28 November 2026. [Run 43851640785](https://github.com/JamelHammoud/basecase/actions/runs/43851640785), at `f96f5b9e362aadc2ab0563657caa477be2e16eba`, passed live readiness, the face signal count of one, model id `yunet` and 640 by 480 result dimensions. Both attempts then exhausted the unchanged 10 s poll for exactly one visible operator face box at lines 73 through 77. The test took 37.494 s across both attempts. The log omits the actual visible box count, tile visibility and overlay timestamp, so zero, duplicate and stale results are not distinguished. Each attempt owns a fresh app and closes it in `afterEach`.

The preceding [run 43847119378](https://github.com/JamelHammoud/basecase/actions/runs/43847119378), at `20de3136695df8ff456133ecd010e37b27ffedf6`, passed this test on Linux in 14.353 s and Windows in 13.520 s. Camera code, fixture, overlay, dependencies and e2e configuration were unchanged. At quarantine, the evidence supported an intermittent Linux overlay failure without an established root cause. No local flake-rate measurements were taken during repair. This differs from #1366's Windows live-readiness failure and #992's rendered-camera signal failure.

The operator walkthrough now runs on Linux, Windows and macOS. `operator/liveVision.test.ts` retains estimator-frame transfer and frame ownership, `vision/engine.test.ts` retains real pixel-sensitive WASM inference, `visionSignals.test.ts` retains signal behavior, and `components/cameras/DetectionBoxes.test.ts` retains normalized overlay markup. The controlled comparison below establishes restoration of the combined Linux inference-to-overlay check.

### Controlled Linux measurements, 16 November 2026

The baseline passed 7 of 10 attempts. The candidate passed 10 of 10. These were alternating pairs in one container, with the order reversed in every second pair. No attempt retried.

Both variants used published parent `7ea1b1d1b4d5dae1a8d1fea93f2bfc11c2ac82a0`. The candidate was the uncommitted test patch in this change. The application bundles, camera code, ONNX bytes and independent `raiseRightArm` pose fixture were identical. The instrumented baseline test SHA-256 was `a694cc98da2e1418ec877ed2ffb2112028e2d0a2a82a01e8be8706470fed4488`. The instrumented candidate test SHA-256 was `76524438b964091aafa91e304700e4f068504e4eeb872cfd1827c02cf77b2196`. The candidate predicate SHA-256 was `b2f460678064337fa616579689ece256d57f9556bd673ba79c6fb97ce8acc471`.

The existing Linux runner prepared `node:26.13.0-bookworm`, Node 26.13.0 and Google Chrome 157.0.8103.78 under OrbStack's `linux/amd64` emulation. Both production bundles were built once with `CI=true`. Every attempt started a new Vitest process, browser, app, profile and temporary backend library. Quarantine filtering was off, retry was zero, and only the literal operator walkthrough was selected. The rendered-camera walkthrough was excluded from these measurements.

The CPU quota was three for both variants. One persistent `yes` process inside that same quota supplied constant pressure. Host activity was not held quiet. Observed one-minute host load ranged from 6.423 to 50.147. Alternating order balances that changing host load. These emulated timings are not CI durations.

The common trace wrapped Worker message delivery and recorded DOM mutations, tile geometry, overlay timestamps, model snapshots and counts. It added no state read between the existing baseline assertions. A report-copy observer was active for both variants of the first pair and stopped afterward. Each remaining pair retained its own artifacts after the attempt. The same trace ran in both variants.

`feedPose` supplied only the body estimator. The actual fake-camera track still flowed through the pose worker's vision tee and the real pixel-sensitive ONNX WASM engine. All 1,981 completed YuNet fixture results contained one face, 640 by 480 dimensions and score 0.34117648005485535. Their source ids matched the current scoped operator assignments. The overlay mounted at 192 by 144 pixels, outside inert ancestors. DOM mutations after publication showed one face. No duplicate operator tile or face was observed.

The failures were observation deadlines. In each failing baseline attempt, readiness, the face signal, model id and dimensions had passed. In one failed attempt, the subsequent visible-box query returned one after its 10-second poll had failed. In two failed attempts, it remained pending when cleanup closed the page. Every failed attempt ended with a DOM snapshot showing one non-inert 192 by 144 tile and one face element. Recorded inference delivery, advancing overlay timestamps and the final snapshot distinguish this from missing or duplicate face elements and source switches in these observations. The original CI logs still do not establish their actual count.

The repair polls inside the page with `waitForFunction` and the same 10000 ms timeout. The predicate reads inference state and actual visible geometry together. It returns a snapshot only for signal one, one visible operator tile and one visible face. The test then checks the `yunet` model id, exact 640 by 480 dimensions and empty app errors. Readiness remains its separate unchanged assertion. Native visibility excludes inert ancestors, hidden content and zero-size boxes, while retaining Playwright's treatment of opacity zero.

An earlier candidate that only replaced the selector with a native Node-side query still timed out. A Node-side combined snapshot also failed after the face appeared, because its next browser read returned late. Both were rejected. Moving the poll into the page removes those repeated observation roundtrips. It does not pause camera loading or change inference pacing. Two profile-instrumented observations failed at earlier readiness or signal stages and are diagnostic only.

All times below are seconds from launch, except query and in-page wait durations. Test duration includes app cleanup. The existing Vite post-suite close warning occurred in both variants and is outside that duration.

| Baseline pair | App ready | Vision configured | Drive command | Live | Signal and model read | Box query duration | Failure marker | Test duration | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 6.012 | 20.814 | 22.517 | 28.110 | 47.018 | 4.708 | none | 53.372 | passed |
| 2 | 5.593 | 19.093 | 20.718 | 24.612 | 40.593 | 7.106 | none | 48.996 | passed |
| 3 | 5.746 | 17.448 | 19.327 | 22.433 | 29.434 | 10.087 | 39.509 | 40.459 | failed |
| 4 | 5.405 | 17.505 | 18.609 | 24.706 | 41.815 | 4.889 | none | 48.227 | passed |
| 5 | 5.946 | 17.515 | 18.647 | 22.550 | 35.309 | 7.823 | none | 44.728 | passed |
| 6 | 5.757 | 19.776 | 21.078 | 26.999 | 49.061 | 0.797 | none | 51.086 | passed |
| 7 | 5.628 | 17.230 | 19.232 | 22.532 | 29.134 | pending > 10.002 | 39.136 | 44.188 | failed |
| 8 | 5.878 | 19.860 | 22.297 | 26.080 | 43.476 | 3.283 | none | 47.990 | passed |
| 9 | 5.598 | 16.690 | 18.300 | 22.405 | 36.596 | 8.485 | none | 46.688 | passed |
| 10 | 5.553 | 16.439 | 18.432 | 22.840 | 30.852 | pending > 10.074 | 40.926 | 47.142 | failed |

| Candidate pair | App ready | Vision configured | Drive command | Live | In-page wait duration | Snapshot received | Test duration | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 6.522 | 20.156 | 22.849 | 28.637 | 2.193 | 34.239 | 49.265 | passed |
| 2 | 6.246 | 22.851 | 25.130 | 29.553 | 3.283 | 38.644 | 56.010 | passed |
| 3 | 4.908 | 17.091 | 18.292 | 23.398 | 2.089 | 28.694 | 41.374 | passed |
| 4 | 5.409 | 17.904 | 19.309 | 22.510 | 2.087 | 26.713 | 34.825 | passed |
| 5 | 5.343 | 18.257 | 20.130 | 23.742 | 3.208 | 32.154 | 46.897 | passed |
| 6 | 5.288 | 17.778 | 19.005 | 22.879 | 1.726 | 26.790 | 35.393 | passed |
| 7 | 5.004 | 16.823 | 18.328 | 22.510 | 1.814 | 26.711 | 36.795 | passed |
| 8 | 5.120 | 18.085 | 20.520 | 25.608 | 3.126 | 38.708 | 53.264 | passed |
| 9 | 5.477 | 19.155 | 21.266 | 25.260 | 4.004 | 35.858 | 50.257 | passed |
| 10 | 5.426 | 16.803 | 18.027 | 22.010 | 3.106 | 28.826 | 42.059 | passed |

Completed baseline box queries took 0.797 to 10.087 seconds, and every reply counted one. Pending queries are censored at the failure marker in the table. Candidate in-page waits took 1.726 to 4.004 seconds. Median test durations were 47.566 and 44.478 seconds respectively.

The failure trace below uses the page performance clock for inference and DOM events. Failure markers use seconds from Node-side launch. Final DOM samples were collected during failure cleanup. Each final tile had positive 192 by 144 bounds and no inert ancestor. Every returned candidate snapshot directly checked native CSS visibility and counted one visible tile and one visible face.

| Failed baseline pair | Inference received, page ms | Frame timestamp, ms | First face DOM mutation, page ms | Failure marker, launch s | Final overlay timestamp, ms | Final face elements |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 23260.935 | 20464.420 | 23265.855 | 39.509 | 36969.315 | 1 |
| 7 | 21975.315 | 20791.420 | 21988.780 | 39.136 | 36985.705 | 1 |
| 10 | 22799.130 | 21072.220 | 22803.390 | 40.926 | 38681.410 | 1 |

Every controlled attempt recorded `closed`, zero active Chromium processes, and no temporary browser profile or backend library afterward. The container's sleep process retained defunct Chrome children, which consumed no CPU and disappeared when the dedicated container was removed. The pressure process, container, anonymous dependency volume and detached worktree were removed after measurement. No app resources were reused between attempts.

`e2e/visionOverlay.e2e.test.ts` passed in 2.308 seconds in the same container. It exercises hidden and inactive tiles, zero-size boxes, another camera, duplicate faces, opacity zero and the requirement for an independent vision signal. The existing estimator transfer, pixel-sensitive engine, signal and normalized markup tests remain unchanged. The Linux-only quarantine for #1404 is removed. Windows and macOS retain the same walkthrough. The rendered-camera quarantine under #992 and Windows readiness investigation under #1366 remain separate.

## Frozen comparison inspection

`evidenceMatrix.test.ts` runs all ten required cases through generated JPEGs, real generated ONNX graphs on WASM, frozen preparation, production evaluation, retention and JSON save/reopen validation. The cases cover a missed person, duplicate detections, a wrong object class, a correct empty image, localization and mask-boundary errors, missed visible and invisible keypoints, classification confusion and a two-camera regression. Both cameras use the same candidate graph. Their different pixels produce the regression in one camera. Repeated frame IDs in different sets and reordered source classes retain their identities and source group. The invisible-point graph changes only the ignored landmark while preserving visible-point accuracy.

The matrix independently asserts expected misses, false positives, visible-point counts and retention outcomes. It reconciles sums of image diagnostics against the existing metric reports, verifies model and test hashes, restores each frozen image and verifies evidence digests after serialization. `evidence.test.ts` retains the geometry matrix, corruption cases, changed valid predictions with unchanged aggregate totals, older aggregate-only reports, 1,000-image refusal and the 3 MiB all-or-nothing refusal. Per-image data has no AP score.

`evidencePipeline.test.ts` checks frozen restoration after current labels change. `visionInspectionOriginal.test.ts` rejects changed JPEGs, labels, classes and missing frames, and ignores reads completed after cancellation or scene switching. `visionInspectionNavigation.test.ts` rejects changed or missing source manifests and recording bytes, verifies exact frame navigation, and passes the already-verified recording into existing playback without reloading a replacement. `inspectionSource.test.ts` also checks changed camera-video bytes and changed timestamps. Existing service cancellation tests continue to prove that stopping before persistence saves no candidate result.

The focused `e2e/visionInspection.e2e.test.ts` enters through Library, selects a class failure, switches model overlays, opens source frame 6 at 0.12 seconds, edits the original image's class through the existing editor, and confirms that frozen evidence and saved dataset versions stay unchanged. It checks the changed original's refusal, scene switching, saved comparison reopening and the scoped command-palette entry. The test explicitly sets retry to zero and keeps the existing browser deadline. It is active on Linux and Windows. The unrelated Windows training-completion quarantine under #1129 is unchanged.

Local changed-file checks passed the production matrix and source-navigation coverage. The browser test is authored for CI and was not run locally. A separate scratch capture used `openApp`, real evaluation and ordinary backend persistence to produce the help and changelog images. It verified source frame 6 before taking the source capture. The capture never judged appearance. Browser resource observations also opened actual comparisons with 4 and 1,000 frozen test images. [Resource evidence](performance-vision-training.md#frozen-prediction-evidence-bounds) records their bounds and limits.

An initial resource fixture added images to the frame set without updating the dataset's selected frame IDs. Its observed runs contained only one test image and were discarded. The corrected fixture updates the explicit member selection and asserts the retained evidence length before recording measurements. One subsequent observation failed the unchanged 30-second navigation timeout before the app loaded. It supplies no feature measurement. The final worker-index observations passed both sizes without retries or longer deadlines. The local Vite servers emitted their existing shutdown warning after successful capture and measurement tests. No quarantine or shared harness setting changed.
