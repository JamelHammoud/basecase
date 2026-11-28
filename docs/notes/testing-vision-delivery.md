# Live and rendered camera delivery testing evidence

Coverage: [Cases](../guide/cases.md#testing-coverage) and [Cameras](../guide/cameras.md#testing-coverage). Placement: [Vision evidence index](testing-vision.md). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

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

## Windows live operator readiness recurrence

[Check 44200197616](https://github.com/JamelHammoud/basecase/actions/runs/44200197616) at `81dc0446019e1ccc14f100286bd99fb61610587c` failed the Find Faces declaration at `vision.e2e.test.ts:59` on both Windows attempts. The unchanged live-readiness poll received false before the inference and overlay assertions. The declaration took 75,609 ms across both attempts. This differs from the Linux overlay observation deadline fixed above. The log does not identify whether the command, camera request, session lifetime or worker startup prevented readiness.

The preceding [Check 44195663922](https://github.com/JamelHammoud/basecase/actions/runs/44195663922) passed the Windows declaration in 20,393 ms. Linux passed at the failed revision in 14,353 ms. The camera implementation, fixture, harness, dependency lock and test configurations did not change between those revisions. No causative merge or environment change is established. Classification is recurring intermittent Windows live readiness under existing priority owner [#1366](https://github.com/JamelHammoud/basecase/issues/1366), which already documents this same failure before the Linux overlay repair.

One focused [Windows diagnostic 44203112400](https://github.com/JamelHammoud/basecase/actions/runs/44203112400) passed the complete declaration at that exact workload revision. Durable ticket `a107a93e-0ebd-4729-9330-b6abd6960c64` records one worker, zero retries and quarantine off. The assertion took 12,667.1193 ms and the process took 24,344 ms. The verified manifest records Windows x64 image `20261103.298.1`, Node v26.13.0 and four CPUs. Studio readiness took 6,470 ms. The process still reported the existing ten-second Vite shutdown warning for two servers, also present in the failed full shard. This establishes a pass and failure at the same revision, not the startup cause, complete process cleanup or a rate estimate.

Only this Windows declaration is quarantined through 28 November 2026. Linux and macOS retain the complete fake-camera pixel-sensitive ONNX walkthrough. Windows retains `operator/liveVision.test.ts` for real frame transfer and ownership, `vision/engine.test.ts` for pixel-sensitive WASM inference, `visionSignals.test.ts` for signal behavior, `DetectionBoxes.test.ts` for normalized markup and `visionOverlay.e2e.test.ts` for the visibility predicate. These checks do not replace the temporarily missing combined Windows live-camera workflow. The rendered-camera quarantine under #992 is unchanged.

Restoration requires tracing startup through command dispatch, capture, session and worker readiness, inference, overlay publication and cleanup. Preserve the independent pose fixture, real fake-camera pixels, live readiness, face signal, YuNet identity, 640 by 480 dimensions, one visible tile and face and empty app errors. The owning fix must establish the cause and measure at least ten baseline and ten candidate Windows observations under equal load without retries. Repair changes no fixture, deadline, retry or assertion and measures no repeated rate.

## Rendered camera quarantine observation

[Check 44364437393](https://github.com/JamelHammoud/basecase/actions/runs/44364437393) passed the active operator-camera declaration in `e2e/vision.e2e.test.ts` in 13,369 ms. The simulated-camera declaration was already quarantined on every platform through 28 November 2026 under [#992](https://github.com/JamelHammoud/basecase/issues/992). During optional Linux quarantine observation it again received a zero `vision.target_camera.block` signal at line 98 instead of one on both existing attempts. That declaration consumed 37,715 ms across the existing retry. No overlay or normalized-box assertion was reached, and no render, frame-delivery or inference stage was established by the log.

The optional observation wrote its JSON before GitHub cancelled the enclosing command. [Command ownership evidence](node.md#quarantine-command-owned-deadline) records the independent deadline repair. The camera test, assertion, existing deadline and quarantine are unchanged. No repeated flake-rate measurement was performed in this repair. The existing owner retains tracing and ten baseline and ten candidate equal-load observations with retries disabled before restoration. Active operator camera, feed worker, frame pacing, ONNX engine, runtime and signal-bus tests remain, but do not replace the complete simulated-camera browser path.

## Rendered web camera on Check 46132153464

[Check 46132153464](https://github.com/JamelHammoud/basecase/actions/runs/46132153464), workload `272970b59c39de360bf11adb21530956b98fed53`, fails both Windows attempts of `publishes rendered camera detections, boxes and signals in the web studio` at `vision.e2e.test.ts:98`. Model configuration returns, then `vision.target_camera.block` stays zero through the unchanged poll. Visible-box, confidence and normalized-coordinate assertions are unreached. The operator-camera declaration passes on Windows at that revision. That independent capture source does not establish a pass for the rendered scene feed.

The nightly log does not identify scene-scope assignment, render-worker readiness, frame transfer, inference or result publication as the source. Existing owner #1129 retains the hosted full-studio investigation separately from controlled feed and inference tests. No same-revision Windows pass, environment change or single introducing merge is established here. Classification remains Windows-observed with the source unresolved. The complete declaration and its original assertions remain active after #992's exclusion expired, alongside compiled-hook, feed lifecycle, real ONNX inference, frame transfer, signal and overlay coverage. No new exclusion, retry or deadline is added.

## Rendered web camera after the shared-feed correction

The Linux and Windows browser jobs of [Check 46155442586](https://github.com/JamelHammoud/basecase/actions/runs/46155442586) at `af0bb91db8fc27bc157db1bbba0e611d18fda0a3` both fail the rendered web-studio declaration at its unchanged count-signal assertion, `vision.e2e.test.ts:98`. Model configuration returns. The later visible box, score and normalized-coordinate assertions are not reached.

Durable ticket `ab2afcaa-0cd8-45aa-8df0-4277c73e5825`, [diagnostic 46158340930](https://github.com/JamelHammoud/basecase/actions/runs/46158340930), selects that complete declaration at the newer published shared-feed correction, `aaec258815e2c51f28e8a78f56070b40560701f0`. Its verified Linux x64 manifest records Node 26.13.1, four CPUs and image `20261122.9.1`. One independent process, one worker, retries disabled and quarantine off again fails at line 98 with count zero. The selected declaration takes 25906.905891 ms within a 37531 ms process, with browser API tracing enabled.

The trace confirms completed navigation, studio readiness, scene loading and model configuration before the repeated state reads. It supplies no render-worker, frame-transfer or inference stage attribution. This web declaration creates its own page instead of using `openApp`, so the existing opt-in `openApp` worker and close snapshots do not attach to it. Its process log retains the ten-second two-Vite-server close warning despite the manifest's empty cleanup array. Neither repeated failure establishes a passing baseline, an intermittent classification or a repaired full-studio path. The complete declaration and every assertion remain active on both platforms. No source, fixture, deadline, retry or exclusion changes accompany this observation. Requests, verified manifest, report, API trace and job log remain under `scratch/diagnostics/ab2afcaa-0cd8-45aa-8df0-4277c73e5825/` during implementation.


## Windows rendered camera on Check 46160172750

At `bd4d286130f97803876ecea7d1f8bcbc5581486f`, [Check 46160172750](https://github.com/JamelHammoud/basecase/actions/runs/46160172750) Windows shard 1 again configures the rendered-camera model but retains count zero at `vision.e2e.test.ts:98`. Visible boxes, confidence and normalized-coordinate assertions are unreached. No camera, transfer or inference stage error is retained in this log. The source snapshot already contains the shared-feed change, so that earlier correction is not a passing observation of this path. Existing owner #992 retains this reproduced signal boundary. The complete browser declaration and every assertion remain active, without a source, timeout, retry or exclusion change. There is no current-revision Windows pass or evidence for an environment pin or single-merge revert.
