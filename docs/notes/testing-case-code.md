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
