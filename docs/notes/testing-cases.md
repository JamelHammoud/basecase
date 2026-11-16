# Cases testing evidence

Coverage: [cases](../guide/cases.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Default console coverage

The overlapping default-layout walkthrough and its Windows quarantine were removed under [#1151](https://github.com/JamelHammoud/basecase/issues/1151). In run 43739315274 it took 40.949 s on Linux, including 23.279 s until studio readiness. The remaining custom-console walkthrough took 12.071 s and retains Run Case through ⌘K, live recording, timer and score updates, Reset and Esc. The log does not identify which startup stage caused the delay.

## Reference-startup quarantine

The reference-startup walkthrough in `e2e/caseStartup.e2e.test.ts` remains quarantined on Windows through 28 November 2026 under [#1026](https://github.com/JamelHammoud/basecase/issues/1026). Run 43698588307 could not find Stop Try on the first attempt or click it after the clock advanced on retry. Each attempt opens a fresh app. Linux passed at the same commit in 8.5 s, and the preceding Windows run passed in 11.0 s. The recording phase or browser timing cause is not established. Restoring it requires Windows traces and at least ten runs before and after at the same load.

## Cases in Checks

The duplicate row-count browser test was removed after taking 89 s in run 43642970706 (#863).

## Case startup reproduction

**#984 reproduction:** the preparation lease added in #936 depended on the parsed Case object. `readCases` recreated that object during workspace renders, so phase and model updates cancelled the current startup. The focused browser probe failed all 10 runs before the fix on `727e7e1f4`, returning Drive off after `referenceTry` resolved. With validated identities retained by source record and the initial paused frame published before ready, all 10 runs passed. Both batches used the same three-CPU `linux/amd64` container on a shared macOS host, `node:26.13.0-bookworm`, Chrome 157.0.8103.78 with the harness's software rendering flags, production desktop and web bundles, `CI=true` and `BASECASE_QUARANTINE=off`. Each invocation ran `npx vitest run --config vitest.e2e.config.ts --retry=0 e2e/caseStartup.e2e.test.ts`. These are process wall times including app setup and teardown, excluding builds. Successful runs complete model loading and recording, so this measures correctness rather than a speed improvement. Windows execution was unavailable on this host.

| Run | Before, failed (s) | After, passed (s) |
| --- | ---: | ---: |
| 1 | 25.051 | 39.548 |
| 2 | 22.752 | 45.169 |
| 3 | 25.992 | 39.682 |
| 4 | 24.135 | 46.617 |
| 5 | 23.785 | 49.551 |
| 6 | 23.904 | 50.966 |
| 7 | 23.638 | 44.997 |
| 8 | 24.558 | 42.697 |
| 9 | 26.573 | 42.078 |
| 10 | 24.796 | 46.226 |
| Total | 245.184 | 447.531 |

The four original walkthroughs also passed on the final bundle without retries: the default console in 44.22 s, the custom console in 22.70 s, panel playback in 37.60 s and the timeline in 29.02 s. These are Vitest's per-test durations, including each test's fixture hooks.
