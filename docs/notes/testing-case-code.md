# Case code testing evidence

Coverage: [cases](../guide/cases.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Running Case chat context

The separate shortcut-and-message test in `e2e/caseCodeAgent.e2e.test.ts` took 43 s in run 43739315274 ([#1148](https://github.com/JamelHammoud/basecase/issues/1148)). The reported duration does not identify which stage caused the delay.

## Hung code panel shutdown

The spinning-panel test in `e2e/caseCode.e2e.test.ts` is quarantined only on Windows through 28 November 2026 under [#1137](https://github.com/JamelHammoud/basecase/issues/1137). Run 43736502131 showed the error and removed the iframe but recorded no `about:blank` navigation on either attempt, followed by both 120 s `browser.close()` hook timeouts. The preceding Windows run 43735086890 passed in 17.065 s with unchanged test, frame, bridge, harness, dependencies and e2e configuration. Linux passed at the failing commit in 15.116 s. The navigation or renderer shutdown cause is not established. Restoring it requires Windows frame-lifecycle and renderer-process traces and at least ten runs before and after at equal load.

## Code joystick

The studio joystick walkthrough was narrowed and its Windows quarantine ([#842](https://github.com/JamelHammoud/basecase/issues/842)) was removed under [#1143](https://github.com/JamelHammoud/basecase/issues/1143). The original sequence took 66.708 s on Windows in run 43739315274. The retained shared-Case joystick and HUD test in `e2e/gallery.e2e.test.ts` passed in 6.127 s on Linux and 7.819 s on Windows in that run.

## Linux startup and error reporting

[#1377](https://github.com/JamelHammoud/basecase/issues/1377) owns two Linux-only quarantines through 28 November 2026. In [run 43831610288](https://github.com/JamelHammoud/basecase/actions/runs/43831610288) at `129c2956`, both attempts of the studio pointer/Escape walkthrough kept Drive off for the unchanged 60-second poll at line 223 after a joystick click. Both attempts of the agent live-edit walkthrough returned `It didn’t answer.` instead of the syntax error at source line 3 at line 113. The first panel write loaded successfully.

Windows passed both at the same revision. Linux passed both in run 43824172798, with the agent walkthrough taking 12.140 seconds. Between those revisions there were no changes to these browser tests, Case code, the harness or dependencies. Each attempt owns a fresh app. The log does not distinguish handshake, click delivery, simulation startup, frame error delivery or watchdog scheduling. The two failures need separate traces before claiming one cause.

The shared gallery joystick walkthrough retains Linux driving and HUD coverage. Fast bridge, document, edit, agent-request and prompt tests retain the corresponding pipeline coverage. Restoring each walkthrough requires production-path traces and ten before and ten after observations at equal load, retaining exact revisions, environment, assertions and renderer cleanup. No timeout, retry or assertion changes accompany quarantine.

The focused diagnostic [43838539310](https://github.com/JamelHammoud/basecase/actions/runs/43838539310), ticket `958dbaa1-19a3-4158-baf7-878fb8da56d8`, reran the exact pointer/Escape test at the same published `129c2956` revision on Linux with one worker, quarantine disabled and zero retries. It passed its single observation in 25.328 seconds, with a 36.850-second test process. Its retained log reports the existing ten-second Vite server shutdown warning, despite an empty cleanup summary in the manifest. The verified artifact establishes that the failure is intermittent at the same revision. One observation is not a flake-rate measurement and does not justify restoring the test. The runner used workflow revision `e7feb58e1a8b343dcb39cc0b0412cfb106cee9df`.

## Windows world-change recording

[Check 43938326448](https://github.com/JamelHammoud/basecase/actions/runs/43938326448) at `fb3bbfdf9134497770b7414be3c19858a0c522c8` failed both Windows attempts of the movable-lamp walkthrough at its final Stop Try click. Both reached the red-color and moved-position assertions. The first then found no Stop Try control for 30 seconds. The second resolved it briefly, observed instability and detachment, then found no replacement. Linux passed the same walkthrough at that revision in 7,855 ms. The browser test, Case code pipeline and `useCaseTry.ts` did not change between full green Check 43864963744 and this failure.

Classification: a Windows-observed test race with the finite Case lifecycle. `useCaseTry` automatically finishes when elapsed simulation time reaches the Case's task duration. The test leaves the simulation running while Node makes separate world-state requests, then waits for a control that exists only during recording. The detached control in the second attempt is consistent with that lifecycle transition. The log establishes the disappearing-control failure, without a trace proving which automatic finish condition fired.

End driving through the existing Escape action after checking the live lamp, then retain the exact one-try, nonempty world recording, saved color and position event and empty app-error assertions. Escape stops driving while a try is active, and exits Run Case if driving already ended. Either state permits checking the retained recording. This removes the requirement to act before the transient Stop Try control disappears, without a timeout, retry, quarantine or relaxed assertion. `e2e/tryStop.e2e.test.ts` retains direct Stop Try coverage separately, and the existing code-pointer walkthrough retains Escape forwarding from a focused code frame.

Only fast changed-file checks run locally. The changed browser declaration is selected by the pull request's CI. Candidate Windows execution remains unverified in this repair because unpublished edits cannot enter hosted diagnostics. The earlier repair's `e2e (3)` ownership covers that Linux job, while this change handles the separately named `e2e-windows (3)` failure.

## Windows camera stream cost

[Run 43856125616](https://github.com/JamelHammoud/basecase/actions/runs/43856125616) at `3ef3c70d1c36e8629b5097260dffe1d802075e48` failed both attempts of the camera-to-code walkthrough at line 374. Mean main-thread handoff cost was 2.4027777777842454 ms and 2.182195121954797 ms against the unchanged less-than-2-ms assertion. Delivery of more than 35 frames, 320 × 240 dimensions and the rate limit passed before that assertion. The failure prevented reaching Escape and the stopped-stream check. The two attempts together took 28.377 seconds. No other regular test failed in Windows shard 3.

The preceding [run 43851640785](https://github.com/JamelHammoud/basecase/actions/runs/43851640785) at `f96f5b9e362aadc2ab0563657caa477be2e16eba` passed this Windows test in 12.043 seconds. The test body, camera pipeline, code-frame bridge, harness, dependency lock and e2e configuration are unchanged between those revisions. The last green nightly was run 43739315274 at `acb6bad2f3fb2acc770cdb2f885415d14c086a67`. The camera test predates that green run. The intervening kinematics and selection changes do not establish a causal regression, and there is no isolated merge to revert.

Classification is an intermittent Windows timing failure with the product cause unestablished. `liveFeed.ts` times `stream.onFrame` using `performance.now()`, including the bridge's bitmap transfer. The log cannot separate actual callback work from process scheduling or instrumentation. [#1410](https://github.com/JamelHammoud/basecase/issues/1410) owns Windows-only quarantine through 28 November 2026 and the deterministic repair. Each attempt owns a fresh app. No assertion, deadline or retry configuration changed. Existing frame routing, deterministic pacing, worker delivery, operator-camera refusal and code-stream teardown tests remain active. Linux and macOS retain the complete real-bitmap walkthrough. Windows loses that combined browser check while quarantined.

Restoration requires Windows traces through callback delivery and bitmap transfer and at least ten before and ten after observations at equal load with exact revisions, environment, assertion values and cleanup evidence. Timing budgets belong on demand under the shared test policy, while functional delivery and teardown must retain deterministic coverage. No flake-rate measurements were taken during repair.

A single Windows observation at the exact failing revision was submitted through the diagnostic runner, ticket `2c1a3c1f-d621-4b40-9302-ac0958371ac2`, [run 43858111193](https://github.com/JamelHammoud/basecase/actions/runs/43858111193). It used the exact full test name, one worker, quarantine disabled and zero retries, and passed in 25.385 seconds with a 37.946-second process. Studio readiness took 9.052 seconds. The verified artifact records Windows x64, Node 26.13.0 and runner image 20261103.298.1. The retained log reports the existing ten-second Vite server shutdown warning despite an empty cleanup summary in the manifest. The runner used workflow revision `77fa38f54bab32cd1656718abb715a2ccec2d838`. This confirms intermittency at the same workload commit. One observation does not measure a flake rate, establish the callback cost cause or justify restoring the walkthrough.

## Code panel isolation

[#1543](https://github.com/JamelHammoud/basecase/issues/1543) reports that `keeps a code panel off the network, the parent and storage` took 51 seconds in [run 43948835889](https://github.com/JamelHammoud/basecase/actions/runs/43948835889). This is a reported test duration, not a measurement of any individual setup, probe or shutdown stage. The cause of that duration is not established.

The replacement `e2e/codeIsolation.e2e.test.ts` launches Chrome and mounts two srcdoc frames using the production `codePanelDocument`, `CODE_PANEL_SANDBOX` and the CSP meta elements read from `index.html`. It avoids studio boot, rover loading, Case selection and simulation. Browser probes require denial of fetch, WebSocket, parent-document access, localStorage, cookies, IndexedDB and top navigation. A self-navigation probe requires a browser `frame-src` violation. HTTP routes record attempted network traffic, which must remain empty. The native WebSocket probe requires both an error and a `connect-src` violation naming its URL. The parent URL must stay unchanged. Page and browser cleanup are awaited.

Review found that the initial WebSocket route replaced the browser constructor with Playwright's mock before CSP enforcement. The installed mock reports socket creation to the route without constructing a native WebSocket, and closing that route emits a close rather than the error the probe awaited. The replacement removes WebSocket routing and requires the browser's policy event, so DNS or handshake failure cannot stand in for isolation. This is source evidence from the installed Playwright implementation, not a browser execution measurement.

This replacement has no quarantine entry and runs on every browser CI platform. The gallery isolation walkthrough additionally tests the shared `CodeFrame` integration and Hub fetch denial, but its existing Windows quarantine does not remove the new standalone probes. `codeDocument.test.ts` retains the complete policy and sandbox assertions. No production policy, timeout, retry or quarantine changes.

The removed walkthrough's reported 51-second duration was not reproduced locally. No replacement browser duration or shard speedup has been measured. Only fast changed-file checks run locally, with browser execution left to CI.
