# Case code testing evidence

Coverage: [cases](../guide/cases.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Running Case chat context

The separate shortcut-and-message test in `e2e/caseCodeAgent.e2e.test.ts` took 43 s in run 43739315274 ([#1148](https://github.com/JamelHammoud/basecase/issues/1148)). The reported duration does not identify which stage caused the delay.

## Hung code panel shutdown

The spinning-panel test in `e2e/caseCode.e2e.test.ts` is quarantined only on Windows through 28 November 2026 under [#1137](https://github.com/JamelHammoud/basecase/issues/1137). Run 43736502131 showed the error and removed the iframe but recorded no `about:blank` navigation on either attempt, followed by both 120 s `browser.close()` hook timeouts. The preceding Windows run 43735086890 passed in 17.065 s with unchanged test, frame, bridge, harness, dependencies and e2e configuration. Linux passed at the failing commit in 15.116 s. The navigation or renderer shutdown cause is not established. Restoring it requires Windows frame-lifecycle and renderer-process traces and at least ten runs before and after at equal load.

## Code joystick

The studio joystick walkthrough was narrowed and its Windows quarantine ([#842](https://github.com/JamelHammoud/basecase/issues/842)) was removed under [#1143](https://github.com/JamelHammoud/basecase/issues/1143). The original sequence took 66.708 s on Windows in run 43739315274. The retained shared-Case joystick and HUD test in `e2e/gallery.e2e.test.ts` passed in 6.127 s on Linux and 7.819 s on Windows in that run.
