# Build test evidence

Current coverage: [owning guide](../guide/build.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## BOM cable stock

The duplicate cable browser test was removed after taking 45 s and failing in run 43721538732. It searched for the provisional Bus Servo Cable row, which measured stock replaces. The previous green run 43715791435 passed it only on retry on both Linux and Windows.

## Falls

The Falls browser test in `e2e/buildCheck.e2e.test.ts` was narrowed under [#1094](https://github.com/JamelHammoud/basecase/issues/1094). In run 43715791435 it took 50.166 s on Windows and 32.196 s on Linux, while the matching `src/utils/engineeringFalls.test.ts` Node test passed in 690 ms and all nine Falls tests passed in 3.961 s on Linux.

## Build Along

The combined Cable reach walkthrough took 59 s in run 43715791435 ([#1091](https://github.com/JamelHammoud/basecase/issues/1091)). For `e2e/buildCable.e2e.test.ts`, before the viewport and label assertions were added, it took 8.901 s on Linux and 12.602 s on Windows in run 43739315274. The separate guide-generation walkthrough was removed under [#1152](https://github.com/JamelHammoud/basecase/issues/1152) after taking 35.169 s on Linux and 26.724 s on Windows in run 43739315274. The responsible stage was not isolated. The separate arm readiness browser test and its Windows quarantine were removed under [#859](https://github.com/JamelHammoud/basecase/issues/859) after it took 32 s in run 43642970706.

The retained tests do not cover the complete palette-to-generated-guide browser path.

## Parts on hand

The duplicate browser test was removed after taking 64 s in run 43642970706 and failing repeatedly on Windows (#851, #836).

## Passive robot joints

Passive declarations do not create missing-servo or torque-estimate warnings. They remain in the rig and range sweeps. Payload mapping rejects a chain containing passive motion rather than using an old effort rating as a motor. Walk and falls keys hash full declarations, so changes invalidate cached evidence without a new version or cache format.

## Manufacturing kit export

Classified as a commit regression introduced by `93e274222ab1d2a7046d87546aa12a3deb748489` (#1323). The last green nightly, [run 43739315274](https://github.com/JamelHammoud/basecase/actions/runs/43739315274), checked `acb6bad2f3fb2acc770cdb2f885415d14c086a67` before that merge. In [run 43820519938](https://github.com/JamelHammoud/basecase/actions/runs/43820519938) at `017a5f2a7313ce68c18a51acc390cef00b7f2084`, both desktop and web cases in the new kit browser test clicked Export ▸ Kit but never observed `kit-arm-kit.zip` within the existing download poll. Both attempts of each case failed. Reported durations including retries were 23.948 s for desktop and 32.761 s for web.

The feature's [PR Check run 43809336475](https://github.com/JamelHammoud/basecase/actions/runs/43809336475) selected the kit test file but produced an empty test-name pattern for its multiline `it.each` declaration. The browser job therefore ran no tests. Its green result is not a passing kit observation. The nightly log contains neither an export error toast nor preparation-stage evidence, so it does not establish a geometry, guide, worker or compression cause. No platform-only or flake classification is established.

The repair reverts the kit feature, its two browser cases, help pages and announcement together. The only revert conflict was the printing performance note, where the later service-quote evidence is retained. The independent Checks timestamp correction and its regression test from the same merge are retained. No assertion, timeout, retry or quarantine is changed. Separate plate, guide and Robot Package workflows remain available. There is no retained combined-kit coverage or claim that combined-kit export works.
