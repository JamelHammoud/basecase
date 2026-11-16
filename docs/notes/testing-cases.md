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

## Passive lid and drawer fixtures

Issue #1268 adds two Case goals on the existing builder and passive world topology. Local real-MuJoCo checks cover default contact references, limp and welded fixtures, recording encode/decode, source scoring and command replay. Robot joint and actuator counts remain equal to the entering arm's counts. Portable `.basecase` files and gallery bundles retain fixture parents, pivots, axes and limits. Robot undo and redo retain the Case object. Console signal checks read the same signed travel as recorded scoring. Body poses are Float32 in recordings, so the travel comparison uses 0.001 degree or millimeter precision rather than binary equality with live Float64 poses.

The native matrix in `src/sim/fixtures/passiveParity.test.ts` captures both goals in eight configurations each. They are nominal, limp, locked, 0.00001-unit actuator effort, 30-unit travel, high joint resistance, reversed axes and a 90° scene rotation. Nominal, shorter, reversed and rotated cases pass. Limp, locked, weak and resisted cases fail. Resistance combines 1000 SI damping and frictionloss. Frictionloss alone is a compliant solver constraint and is not a lock. All fixture force comes from robot contact or gravity. The helper never assigns fixture qpos, body poses or a fixture actuator.

The matrix passed locally in 4.45 s including module loading and C replay after static frame geometry was added. This timing is an observation on the shared macOS host, not a performance bar or CI timing. The C/WASM state threshold is 1e-6, active body contacts must match exactly, and contract margins must differ by less than 1e-6. Every physics substep's control is captured, with comparisons every ten substeps. Both engines use the repository's pinned MuJoCo version. These checks establish agreement for these scenes, not physical accuracy or transfer.

The browser checks choose both goals, change Weight to 35 g, run the reference through the Try section, and reopen its saved row. CI runs them on Linux and Windows. The local capture walkthrough supplies documentation images without judging their appearance. Wider robot morphologies, SimReady-to-Case fixture registration, reusable assembly editing and composed mechanism tasks are outside this step. Existing robot import retains its joint transforms, with no new importer added.

The explicit stop check found 2.85 mm of drawer overtravel under a sustained pull with the default limit response. Fixture joints now set `solreflimit="0.004 1"`. The sixteen native parity cases pass with stop overshoot bounded to 2 degrees or millimeters and numerical state drift below 1e-6. This is solver compliance, separate from comparison tolerance. The direct-import per-case parity checks completed locally in 4.66 s as a group, including Python startup for each case.

The final changed-file run with two local workers passed 415 test files and 2,835 tests, with the repository's existing quarantine left unchanged. Its remaining findings were one lint spacing issue and the then-missing drawer screenshots. The spacing was corrected. Documentation captures subsequently passed both UI walks, including a 35 g plate, a passed recorded verdict and a seek to the last frame. They use the dev server and are not substitutes for the production-bundle browser checks in CI. Earlier capture attempts hit dev-server navigation and startup deadlines while dependencies were being optimized. Capture setup isolated its dependency cache, used a fresh app for each goal and waited for the visible running state before the result. No product or committed browser-test deadline changed.

A live try can start recording after the passive joint has settled against its closed stop. The browser assertion therefore uses the same 2-unit stop-compliance bound at the first frame, rather than requiring an exact zero coordinate after simulation has already stepped. It still requires recorded motion beyond 20 units and a passed reopened verdict. Recorded travel remains the measured signed coordinate, including small limit penetration.

## Passive robot joints

Recording assertions check nq and nv against physical DOFs and nu against the exact powered count, including zero-actuator robots. Control buffers have frames times nu entries. The dataset and demonstration feature schema still pairs powered joint positions with powered actions. Passive coordinates remain in the saved recording rather than acquiring fake actions. This does not change articulated Case fixture bindings or recording formats.

## Operate alert predicates

`operateConditions.test.ts` evaluates existing Case contract predicates against supplied voltage using the real contract WASM. Samples at 0, 400, 800 and 1,000 ms establish a one-second condition. A 100 ms transient followed by fresh healthy voltage creates no alert. A gap from 400 to 1,000 ms resets continuity. Stale and missing readings remain unknown, including under negation. Duplicate and reordered samples do not extend duration, and a reading exactly on the threshold follows the evaluator's strict margin rule.

These tests cover whole-window immediate predicates and continuous `hold_for` conditions. Windowed and sequence formulas and delta expressions remain saved-try scoring rules. No simulation geometry or unsupplied sensor fact is fabricated for a live robot. The worker retains only continuity timestamps and bounded pending messages. Fleet persistence and the browser path are recorded in [Robot runtime evidence](testing-robot-runtime.md#retained-fleet-incidents).
