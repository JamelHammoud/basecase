# Vision testing evidence

Coverage: [cases](../guide/cases.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Frozen condition scoring

The #1663 review found that removing an undeclared condition created a new definition and empty membership, and failed at the 32-name cap. The editor now preserves absent metadata and skips unchanged writes. `imageConditions.test.ts` checks unchanged object identity and absent fields. `imageConditionsStore.test.ts` checks unchanged manifests, dataset hashes and versions when removing an absent name at the combined cap. Saved evaluation validation now rejects malformed or oversized condition metadata in both snapshot and real-test samples. `retention.test.ts` covers declaration and membership limits, duplicate or undeclared labels, empty cameras, long names and the 10,000-image group-bound inventory limit.

The same review found that an inventory above the 256-source subgroup limit rejected the entire inspection index. The worker now returns the subgroup refusal separately from aggregate image indices. `conditionRequest.test.ts` crosses the actual index job with 257 sources and verifies that the original real-test image remains inspectable. Historical aggregate-only result rows omit the redundant condition-unavailable caption. The review changed-file check passed formatting, documentation, site copy, types and 2,319 related tests in 361 files, with one existing skipped file and test. ESLint initially rejected two oversized test groups. They were split by responsibility without changing assertions or deadlines. The log is `scratch/review-1663-check.log` in the review worktree. Browser tests were left to Check under the review lane contract.

`conditions.test.ts` checks optional metadata identity, bounded definitions and membership, canonical COCO and YOLO packages, overlapping and empty definitions, duplicate frame IDs across exported sets, imported source isolation and frozen archive metadata. `conditionEvaluation.test.ts` declares exact expected member IDs and scores for detection, segmentation, visible keypoints and classification. A candidate wins the aggregate while losing the night group. It checks camera and source support, unlabeled members, overlap, empty groups, synthetic-only groups, saved JSON reopening after current edits, changed content, altered group digests, metadata tampering with recomputed digests and pixel refusal before content reads. `conditionResources.test.ts` measures complete rescoring at four and 1,000 images without inference or timing assertions.

`conditionWorkflows.test.ts` runs ten focused production-pipeline cases: day/night rover images, front/wrist cameras, small/large objects, occluded arm targets, reflective inspection targets, warehouse/outdoor sources, segmentation under glare, partially visible landmarks, imbalanced classification and imports without robot provenance. JPEG pixels and reviewed geometry are generated in code. Expected group keys and scores are declared separately in the workflow table. Small targets use distinct geometry, segmentation predictions use different masks, keypoints include invisible landmarks, and classification has two Microwave images and one Refrigerator image. ONNX parity checks independently verify brightness-derived confidence, classification scores, mask foreground and landmark coordinates before checking group and aggregate metrics. The camera case repeats a frame ID across sets. Models execute through the actual ONNX WASM engine. Preparation, evaluation, aggregate retention, saved-run validation and JSON reopening remain real. Group rescoring consumes retained predictions. Imports without verified provenance remain checkpoints with null subgroup scores. These fixtures establish diagnostic arithmetic on supplied conditions, not physical performance or transfer.

`conditionRequest.test.ts` crosses the actual worker-job content port and shared scorer. It cancels a job while content is pending and checks that revoked successes and errors publish nothing. The React inspection hook revokes that request on group/report replacement or unmount. Existing scene/dataset inspection remount behavior remains unchanged.

`inspectionContext.test.ts` checks replacement and closure of the worker's single verified report pair, including an old index completion arriving afterward. Group selection sends only that context's evidence identity and a content port. `imageConditionsStore.test.ts` races edits on two sets against the global declaration cap. The existing frame-label queue serializes the complete preflight and write sequence, updates working hashes and keeps saved versions unchanged. `conditions.test.ts` also checks a cumulative expanded-content budget across successive frozen archives. `frameSetStore.test.ts` verifies streaming metadata hashes against the canonical full-set hash, zero media rewrites, repeated frame IDs in different sets and source replacement before or during hashing.

`e2e/visionConditions.e2e.test.ts` declares a short walkthrough through ordinary Import Robot, dataset image selection, two condition assignments, controlled fitting with real preparation and ONNX evaluation, condition selection, exact support and scores, frozen image display, confirmed membership removal and historical reopening. Its retry is zero. The ten-case matrix stays outside the browser test.

The documentation capture followed this import-to-inspection path on macOS with the real temporary Library handlers, generated canonical images and real local ONNX evaluation. It also removed current membership and reopened unchanged saved comparisons. The first capture attempt targeted pre-import frame names and stopped at selection. Import intentionally replaces those names with content-derived IDs. The corrected capture selected the actual imported frame ID and completed in 37.74 seconds, without a retry or a longer budget. The harness served the development app because production bundles were absent. The existing Vite shutdown warning followed completion. This is one documentation capture, not a Linux/Windows reliability rate or a production performance measurement.

A separate removal-confirmation capture completed in 17.99 seconds. Its preceding attempt stopped at the unchanged 30-second navigation deadline before the app loaded and supplied no feature measurement. No shared harness setting or test deadline changed.

The first combined changed-file run on 17 November 2026 passed formatting, lint, site copy and types. Its related tests passed 2,259 cases and hit five existing 5-second test deadlines. The failures were `classroom/grading.test.ts`, `cases/fixtureWorkflow.test.ts`, `leagues/replay.test.ts`, `sim/fixtures/passiveParity.test.ts` and the 1,000-image case in `vision/training/evidenceResources.test.ts`. The logs establish deadline failures, not their cause. No timeout, retry or quarantine was changed. Earlier focused condition scoring and resource checks passed. Full logs and measurement JSON remain in the task's scratch handoff.

The final documentation capture after metadata-only persistence completed in 22.78 seconds. It captured assignment, frozen comparison and removal confirmation, then verified unchanged saved reports and versions after removal. The final storage and workflow check passed 204 related tests in 37 files, plus formatting, lint, types and site copy. The earlier combined check passed 2,283 tests in 357 files, with one existing skip, before focused lint corrections. No browser retry, shared timeout or quarantine changed.

The #1663 Check failed before unit tests at `npm audit --audit-level=high`, reporting 21 high findings through picomatch. The aggregate check failed because that required job failed. After merging current `main`, including #1664's patched picomatch override, the same audit passed on Node v26.13.0 with zero high or critical findings. Four moderate findings and one low finding remain. This revision changes no dependencies, audit policy or vision assertions. The shared fix and its exploit coverage are recorded in [Shared picomatch audit stall](node.md#shared-picomatch-audit-stall). Hosted validation of the merged revision remains with Check.

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

The Linux overlay repair restored Linux execution. The later [Windows readiness recurrence](#windows-live-operator-readiness-recurrence) is quarantined separately, with macOS still active. `operator/liveVision.test.ts` retains estimator-frame transfer and frame ownership, `vision/engine.test.ts` retains real pixel-sensitive WASM inference, `visionSignals.test.ts` retains signal behavior, and `components/cameras/DetectionBoxes.test.ts` retains normalized overlay markup. The controlled comparison below establishes restoration of the combined Linux inference-to-overlay check.

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

Review found that valid all-background prediction masks reached the label editor's foreground-only geometry builder and made the complete image unavailable. `inspectionImage.test.ts` now crosses evaluation, frozen image packing and restoration for missing masks, all-background masks and foreground lost during nearest-neighbor resizing. Each case preserves both predictions and its false-positive diagnostic while displaying the historical image and the remaining nonempty prediction. Rendered SVG assertions distinguish white ground-truth landmarks from blue predicted landmarks and exclude landmarks from detection and segmentation tasks. These are geometry and markup assertions, not visual judgments.

`evidencePipeline.test.ts` checks frozen restoration after current labels change. `visionInspectionOriginal.test.ts` rejects changed JPEGs, labels, classes and missing frames, and ignores reads completed after cancellation or scene switching. `visionInspectionNavigation.test.ts` rejects changed or missing source manifests and recording bytes, verifies exact frame navigation, and passes the already-verified recording into existing playback without reloading a replacement. `inspectionSource.test.ts` also checks changed camera-video bytes and changed timestamps. Existing service cancellation tests continue to prove that stopping before persistence saves no candidate result.

The original browser inspection walkthrough entered through Library, selected a class failure, switched model overlays, opened source frame 6 at 0.12 seconds and edited the original image's class through the existing editor. It opened the comparison through the scoped command, checked refusal of the changed original, checked dismissal on scene switching and return, and confirmed saved evidence and dataset versions stayed unchanged. [Walkthrough cost and current coverage](#combined-inspection-walkthrough-cost) records the shortened sequence and limits. The unrelated Windows training-completion quarantine under #1129 is unchanged.

Local changed-file checks passed the production matrix and source-navigation coverage. The browser test was authored for CI and was not run locally. A separate scratch capture used `openApp`, real evaluation and ordinary backend persistence to produce the help and changelog images. It verified source frame 6 before taking the source capture. The capture never judged appearance. Browser resource observations also opened actual comparisons with 4 and 1,000 frozen test images. [Resource evidence](performance-vision-training.md#frozen-prediction-evidence-bounds) records their bounds and limits.

An initial resource fixture added images to the frame set without updating the dataset's selected frame IDs. Its observed runs contained only one test image and were discarded. The corrected fixture updates the explicit member selection and asserts the retained evidence length before recording measurements. One subsequent observation failed the unchanged 30-second navigation timeout before the app loaded. It supplies no feature measurement. The final worker-index observations passed both sizes without retries or longer deadlines. The local Vite servers emitted their existing shutdown warning after successful capture and measurement tests. No quarantine or shared harness setting changed.


## Combined inspection walkthrough cost

Issue [#1782](https://github.com/JamelHammoud/basecase/issues/1782) shortens the combined saved-comparison browser walkthrough while retaining its unique UI coverage and `visionInspectionFlow.ts` fixture helper. In [Check 44245137178](https://github.com/JamelHammoud/basecase/actions/runs/44245137178), the declaration passed in 44,483 ms on Windows shard 6 and 26,639 ms on Linux shard 6. Both observations are from the existing full browser workload, not isolated benchmarks. These observations describe the original five-opening walkthrough. No candidate browser timing or wall-clock shard improvement has been measured locally.

The walkthrough reopened the same comparison five times while combining overlay selection, source playback, label editing, source refusal, scene switching and command-palette entry. Existing tests already cover the underlying evidence contract:

- `src/vision/training/evidencePipeline.test.ts` runs real ONNX WASM inference, saves and reopens the comparison, checks candidate and incumbent predictions, and restores frozen labels after current labels change.
- `src/workspace/visionInspectionOriginal.test.ts` refuses changed labels, classes, JPEGs and missing images, and ignores loads completed after cancellation or scene switching.
- `src/workspace/visionInspectionNavigation.test.ts` passes the verified historical recording and exact frame into existing playback, refuses changed or missing sources and ignores stale requests.
- `src/vision/training/inspectionSource.test.ts` rejects replaced recordings, video bytes and timestamps. `inspectionImage.test.ts` retains frozen-image geometry and rendered-markup coverage.
- `e2e/visionRequirements.e2e.test.ts` enters Library, opens a frozen image and reopens it after current membership and requirement edits, then compares saved runs and dataset versions. The condition walkthrough also retains reopening coverage outside its existing Windows quarantine.

The shortened walkthrough opens the comparison three times instead of five. It retains Library entry, Class and Finding selection, displayed candidate and incumbent model hashes, incumbent/candidate overlay counts, source playback at frame 6, original-image class editing with persisted content change, scoped command entry, changed-original refusal, and dismissal when switching away and back. The command uses ControlOrMeta for both supported desktop platforms. The third opening checks the refusal status after command entry. One final snapshot checks saved-run and dataset-version preservation after editing and scene switching. These assertions need no additional comparison opening. The requirement walkthrough also retains browser reopening and saved-evidence preservation coverage.

The original-image unit test checks changed-content refusal, while source navigation refusal stays in the navigation and source tests. The browser checks that the original-image rejection reaches the dialog's status text. No timeout, retry, quarantine or production behavior changes. Browser execution and candidate duration measurement belong to CI.

The initial deletion's changed-file check passed formatting, lint, documentation, site copy and types, plus 12 retained unit and integration tests in 463 ms. That result did not establish replacement coverage for the removed controls. The revision restores those browser interactions without running them locally.


### Follow-up inspection navigation refinement

Issue [#1825](https://github.com/JamelHammoud/basecase/issues/1825) follows the three-opening trim. [Check 44391437908](https://github.com/JamelHammoud/basecase/actions/runs/44391437908) still took 37,612 ms on Windows shard 6 and 20,470 ms on Linux shard 6 for the combined declaration. Both passed. These are shared-workload observations, not isolated timings.

Review of #1834 rejected reducing the test to source playback because unit tests do not cover the removed UI wiring. The revision retains all browser assertions from the three-opening walkthrough, including Class and Finding selection, both displayed model hashes, overlay counts, original-image editing and persisted hash change, changed-original refusal feedback, scoped command entry, scene-switch dismissal and saved-evidence preservation.

After the label editor closes, the dataset remains selected. The walkthrough now opens the scoped command directly, removing an Escape and dataset-row click that dismissed and reopened the same dataset. Fixture setup remains shared in one app. Unused image-count and before-inspection options are removed. Source playback waits for the visible timeline and verifies saved frame 6 with a nullable timeline read. No timeout, retry or quarantine changes. No runtime reduction is claimed before CI executes this revision on Linux and Windows.

Scoped revision validation is recorded in `scratch/revise-1834-check.log`. Browser execution and timing remain with CI.


## Windows live operator readiness recurrence

[Check 44200197616](https://github.com/JamelHammoud/basecase/actions/runs/44200197616) at `81dc0446019e1ccc14f100286bd99fb61610587c` failed the Find Faces declaration at `vision.e2e.test.ts:59` on both Windows attempts. The unchanged live-readiness poll received false before the inference and overlay assertions. The declaration took 75,609 ms across both attempts. This differs from the Linux overlay observation deadline fixed above. The log does not identify whether the command, camera request, session lifetime or worker startup prevented readiness.

The preceding [Check 44195663922](https://github.com/JamelHammoud/basecase/actions/runs/44195663922) passed the Windows declaration in 20,393 ms. Linux passed at the failed revision in 14,353 ms. The camera implementation, fixture, harness, dependency lock and test configurations did not change between those revisions. No causative merge or environment change is established. Classification is recurring intermittent Windows live readiness under existing priority owner [#1366](https://github.com/JamelHammoud/basecase/issues/1366), which already documents this same failure before the Linux overlay repair.

One focused [Windows diagnostic 44203112400](https://github.com/JamelHammoud/basecase/actions/runs/44203112400) passed the complete declaration at that exact workload revision. Durable ticket `a107a93e-0ebd-4729-9330-b6abd6960c64` records one worker, zero retries and quarantine off. The assertion took 12,667.1193 ms and the process took 24,344 ms. The verified manifest records Windows x64 image `20261103.298.1`, Node v26.13.0 and four CPUs. Studio readiness took 6,470 ms. The process still reported the existing ten-second Vite shutdown warning for two servers, also present in the failed full shard. This establishes a pass and failure at the same revision, not the startup cause, complete process cleanup or a rate estimate.

Only this Windows declaration is quarantined through 28 November 2026. Linux and macOS retain the complete fake-camera pixel-sensitive ONNX walkthrough. Windows retains `operator/liveVision.test.ts` for real frame transfer and ownership, `vision/engine.test.ts` for pixel-sensitive WASM inference, `visionSignals.test.ts` for signal behavior, `DetectionBoxes.test.ts` for normalized markup and `visionOverlay.e2e.test.ts` for the visibility predicate. These checks do not replace the temporarily missing combined Windows live-camera workflow. The rendered-camera quarantine under #992 is unchanged.

Restoration requires tracing startup through command dispatch, capture, session and worker readiness, inference, overlay publication and cleanup. Preserve the independent pose fixture, real fake-camera pixels, live readiness, face signal, YuNet identity, 640 by 480 dimensions, one visible tile and face and empty app errors. The owning fix must establish the cause and measure at least ten baseline and ten candidate Windows observations under equal load without retries. Repair changes no fixture, deadline, retry or assertion and measures no repeated rate.

## Declared operating requirements

Review coverage in `requirementChoices.test.ts` restores two cameras and legacy class choices from real snapshot archives without condition metadata. It edits current camera and class metadata, checks saved choices remain frozen, and verifies complete frozen summaries need no content reads. The earlier condition-rescoring performance table retains its original measurements, separate from the requirement observations below.

The review's changed-file check passed formatting, lint, documentation, site copy for 332 pages, types and 183 related tests across 40 files. The log is `scratch/review-1752-check.log`. Its first run caught a new fixture editing the original image array instead of the cloned saved snapshot. The corrected fixture changes the saved snapshot when exercising summary-only reads. No browser tests ran locally during review.

Issue #1745 extends the existing evaluator and comparison. Requirements remain optional and freeze before backend dispatch. The candidate and incumbent use the same prepared snapshot and declarations. Tests preserve group membership, source ancestry, exact model hashes and dataset identity through JSON save/reopen. Exploratory group selection does not change a saved retention decision.

The generated ONNX matrix declares expected aggregate and subgroup results separately. Every listed subgroup scores 0 for the candidate and 1 for the incumbent. Floors are zero, support minima are one and permitted regression is zero, so each comparison records a regression checkpoint. Cases without aggregate improvement also remain checkpoints. Class names distinguish people, parts, pallets, mugs, bins, handles, landmarks, appliance states and inspection defects.

| Workflow | Task | Candidate aggregate | Incumbent aggregate | Required real-test members |
| --- | --- | --- | --- | --- |
| Low-light rover person detector | Detection | 67/101 | 34/101 | 1 |
| Occluded arm part detector | Detection | 67/101 | 34/303 | 1 |
| Rare warehouse pallet detector | Detection | 134/303 | 34/101 | 1 |
| Kitchen mug segmenter | Segmentation | 0 | 1 | 2 |
| Reflective bin segmenter | Segmentation | 0 | 1 | 2 |
| Gripper handle landmarks | Keypoints | 0 | 1 | 1 |
| Desk robot named landmarks | Keypoints | 0 | 1 | 1 |
| Appliance state classifier | Classification | 2/3 | 1/3 | 1 |
| Inspection defect classifier | Classification | 2/3 | 1/3 | 1 |
| Weak wrist camera on a two-camera robot | Detection | 67/101 | 34/101 | 1 |

`requirementWorkflows.test.ts` runs actual preparation, JPEG decoding, tiny ONNX WASM inference, shared task scoring, comparison, saved-run validation, checkpoint Apply Model refusal and JSON reopening. The camera fixture repeats a frame ID across sets. Existing ONNX parity tests independently check confidence, masks, landmark order and classification outputs. Generated arithmetic fixtures do not establish physical perception or transfer performance.

`requirements.test.ts` covers score-floor and support equality, passing all declarations, overlapping membership, missing and empty groups, absent classes, unavailable evidence, corrupted digests, unsupported metrics/classes and declaration bounds. Its segmentation resource case refuses 300 resized mask comparisons on a 512 by 512 image before mask decoding. A second resource case uses a checkerboard prediction exceeding the mask-encoding run cap. Its candidate wins aggregate scoring 1 to 0 but saves a resource checkpoint without prediction evidence. `requirementBoundaries.test.ts` accepts exactly a one-point permitted regression and refuses a value one millionth below that boundary. It also excludes generated and unverified source support using the production ancestry resolver. `requirementLifecycle.test.ts` mutates working declarations during preparation, checks their earlier frozen values and identical incumbent/candidate tasks, preserves historical labels, rejects source leakage and discards a completion after cancellation without saving. A passing control meets score and support thresholds exactly and ties its incumbent subgroup at the zero-regression boundary. Existing global-limit and no-requirement coverage remains active.

The documentation capture follows the new focused browser walkthrough through ordinary Import Robot, assignment of night to a dark image, declaration, real preparation and ONNX evaluation. Candidate aggregate mAP is 67/101 versus 34/101, while night scores are 0 versus 1. The result remains a checkpoint without Apply Model. Inspection loads the contributing frozen image. Removing current night membership and changing the current floor leaves saved requirements, outcomes and dataset versions unchanged. Committed captures are in `site/public/help/require-vision-conditions/` and `site/public/changelog/vision-operating-requirements/`.

The initial capture exposed a pointer-access failure after expanding training controls and results. The fixed-height view let that content cover the image condition editor. Dataset controls/results now occupy at most half the view and scroll independently. The corrected capture completed in 23.54 seconds. The final capture after input-unit and Delete-tone corrections completed in 27.20 seconds. No test deadline or retry increased. Both used the development fallback because production bundles were absent. They are documentation observations, not Linux/Windows reliability results. The existing Vite shutdown warning followed completion.

The first changed-file check passed 2,389 related tests and failed the existing Delete-tone invariant for the new requirement Delete button. It also reported a test-only group type mismatch and five site contraction findings. Corrections use the existing danger button variant, explicitly narrow condition/camera groups and follow site copy conventions. The complete changed-file check then passed formatting, lint, documentation, site copy, types and 2,394 related tests, with one existing skipped file and test. Logs are `scratch/requirements-check.log`, `scratch/requirements-corrections-check.log` and `scratch/requirements-final-check.log`. Later focused checks cover the inference call counter, full comparison byte accounting and conservative segmentation pixel accounting. The final evaluation check passed all 227 related tests in 45 files, including the resource checkpoint for oversized prediction evidence. No new test is skipped or quarantined.

The production worker-memory probe initially failed because the test transform rewrote a dynamic import inside a browser callback. Its scratch-only loader now leaves that import in the browser. The corrected probe completed in 15.56 seconds. It ran the shipped evaluation worker, without inference or image decoding, and saved `scratch/requirements-worker-memory.json`. [Performance evidence](performance-vision-training.md#declared-operating-requirements) records its limits.

The focused browser file declares retry zero. CI owns Linux and Windows execution. No GPU, physical device, external account or paid backend was used. These requirements express supplied operating criteria, without statistical-significance, physical-safety or deployment guarantees.

## Windows condition training completion

[Check 44227652023](https://github.com/JamelHammoud/basecase/actions/runs/44227652023) at `8416f27ec38e9271d3cb3cf10b28848cf4a81e4d` completed image import, image selection and both condition assignments, then clicked Train. The saved-run count remained zero through the existing poll at line 78. It never reached historical image inspection. Windows [run 44218519123](https://github.com/JamelHammoud/basecase/actions/runs/44218519123) passed the exact declaration in 21,484 ms. The test and preparation, evaluation and persistence paths are unchanged between those revisions. The intervening condition-result copy removal changes no training computation.

Classification is Windows-observed intermittency. The last observed action is the Train click, without evidence that the training handler or backend dispatch completed. The log does not distinguish preparation, backend fitting, ONNX evaluation or persistence. The exact declaration is quarantined only on Windows through 28 November 2026 under existing real-image completion owner #1129, rather than creating a second training owner. Linux and macOS retain the complete path. Windows retains the real ONNX condition workflow matrix, score arithmetic, frozen membership, content-port restoration and revoked-result tests. Those do not establish the combined import-to-history browser path. Restoration requires stage tracing and at least ten baseline and ten candidate Windows observations at equal load with retries disabled and the original assertions and deadlines.


## Rendered camera quarantine observation

[Check 44364437393](https://github.com/JamelHammoud/basecase/actions/runs/44364437393) passed the active operator-camera declaration in `e2e/vision.e2e.test.ts` in 13,369 ms. The simulated-camera declaration was already quarantined on every platform through 28 November 2026 under [#992](https://github.com/JamelHammoud/basecase/issues/992). During optional Linux quarantine observation it again received a zero `vision.target_camera.block` signal at line 98 instead of one on both existing attempts. That declaration consumed 37,715 ms across the existing retry. No overlay or normalized-box assertion was reached, and no render, frame-delivery or inference stage was established by the log.

The optional observation wrote its JSON before GitHub cancelled the enclosing command. [Command ownership evidence](node.md#quarantine-command-owned-deadline) records the independent deadline repair. The camera test, assertion, existing deadline and quarantine are unchanged. No repeated flake-rate measurement was performed in this repair. The existing owner retains tracing and ten baseline and ten candidate equal-load observations with retries disabled before restoration. Active operator camera, feed worker, frame pacing, ONNX engine, runtime and signal-bus tests remain, but do not replace the complete simulated-camera browser path.

## Inspection fixture refinement

Issue [#1873](https://github.com/JamelHammoud/basecase/issues/1873) reports the combined inspection declaration taking 59 seconds in [Check 44537680149](https://github.com/JamelHammoud/basecase/actions/runs/44537680149). The report does not identify which action consumed the time, so no individual action is classified as a stall.

Review of #1878 rejected the overlay-only reduction because it removed unique browser coverage. The restored walkthrough retains Library entry, Class and Finding selection, both displayed model hashes, candidate and incumbent overlays, comparison-to-source playback at frame 6, original-image editing and persisted hash change, changed-original refusal feedback, scoped command entry, scene-switch dismissal and unchanged saved runs and dataset versions. The unit and requirements tests listed above complement these controls rather than replace their browser wiring assertions.

The shared fixture now loads two primitive boxes with one revolute joint instead of the three-joint arm. Real model preparation, saved recording creation, ONNX evaluation, frozen-image restoration and source playback remain in the pipeline. The recording still has 12 frames at 50 Hz and the browser verifies source frame 6. The fixture reduction targets model preparation and playback work without removing any UI interaction. Three comparison openings remain because successful source and original-image navigation close the comparison. Overlay counts poll the rendered result of each selection, including the initial candidate.

No browser speedup is claimed without candidate execution. Browser execution and timing remain with Linux and Windows CI. No timeout, retry, quarantine or production behavior changes.


## Inspection-only evaluation fixture

Issue [#1895](https://github.com/JamelHammoud/basecase/issues/1895) reports the combined inspection declaration taking 63 seconds in [Check 44792356422](https://github.com/JamelHammoud/basecase/actions/runs/44792356422). No per-action timings establish which stage dominated that observation. Earlier fixture reductions still left two real ONNX evaluations before the first browser inspection.

`devStudio/inspectionTrainingFixture.ts` now runs the existing training service core with controlled prediction results for this inspection-only setup. It supplies a full-image cup detection for the candidate and no detections for the incumbent. Both reports still pass production scoring, evidence construction, retention comparison, saved-run validation and persistence. Dataset preparation still freezes real JPEGs, labels and source identities. Source recording creation, articulated frame-6 playback and all existing browser interactions remain real. The browser additionally asserts retained status and candidate/incumbent scores of one and zero before exercising the controls.

This removes both ONNX inference calls and their session initialization from inspection fixture setup. It does not change `configureVisionBackend` for training browser workflows, which retain real ONNX evaluation. `evidencePipeline.test.ts` continues to cross real ONNX inference, immutable run persistence and image restoration. The inspection walkthrough no longer proves browser ONNX startup, which remains covered by the requirement and condition training walkthroughs within their documented platform limits.

No browser duration or shard speedup was measured locally. Candidate browser timing belongs to Linux and Windows CI. No assertion was removed or loosened, and no timeout, retry, quarantine or production behavior changed.
