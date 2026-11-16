# Case comparison under Linux load

This records the earlier simulation walkthrough’s fixture investigation. [#1086](https://github.com/JamelHammoud/basecase/issues/1086) replaces its repeated simulation with deterministic worker replies while retaining the command-to-results browser path. These measurements apply to the earlier test. Current comparison coverage is listed in [Cases](../guide/cases.md#testing-coverage).

## Scope

[Issue #996](https://github.com/JamelHammoud/basecase/issues/996) tracks the comparison failure in [Linux job 132729516961](https://github.com/JamelHammoud/basecase/actions/runs/43687018679/job/132729516961). The job reported both attempts failing in 24.0 seconds, then was cancelled before its final assertion trace. That log does not establish which assertion failed.

The trace follows Chrome launch, page creation, navigation, studio readiness, both fixture loads, the tab switch, Case activation, command discovery and both comparison rows. The repeated baseline uses the comparison test alone. It does not reproduce the preceding Build tests' shared browser state.

## Fixture correction

The previous fixture loaded a full-strength rover, waited only for its part count and then read its project to weaken the joints. `resetDoc` writes the parts reference immediately, while `setProject` updates the project reference through a passive effect. The part-count condition does not establish that the project is ready.

A scheduling probe executes the fixture load and its following project read in the same browser task. It reports `partsReady: true` and `joints: []`. The old weakening step then saves an empty joint list, so `comparableRobots` excludes that tab. This is a demonstrated fixture race. The probe reaches Case activation and then fails to find Compare with Weak rover within 15 seconds. The ten ordinary baseline runs all pass, so it is not proof of the cancelled CI job's cause.

The test now builds each complete project in Node and loads it once. It checks the loaded parts and joints before continuing. Fixture calls and Case creation address `__studios[tabId]`, rather than relying on the global active hook following tab selection. A fresh app per attempt isolates the comparison from other Build tests and any earlier attempt.

The person-facing path remains covered through the Rover scene tab and the Compare with Weak rover command in the palette. The existing tab hook prepares the second fixture scene. Both robots still run the real 20-seed comparison. Assertions retain both count formats, both better markers, the weak robot's name and the absence of browser errors. An additional assertion compares the numeric pass counts.

## Measurement setup

The production app and web bundles come from commit `c39ca1d11`. Measurements use Node 26.13.0 and Google Chrome 157.0.8103.78 in `node:26.13.0-bookworm`, running Linux x86-64 through Docker emulation. The container has a three-CPU quota, is pinned to CPUs 12 through 14 and keeps two continuously busy Node worker threads running across both batches.

Every run starts a fresh Vitest process and Chrome browser. Quarantine is off and retries are disabled. The bundles, container, CPU settings and background workers remain the same. Other host work shares scheduling, so these results do not measure a startup speed improvement.

Scratch instrumentation logs stage times and hook calls. The first three baseline runs log stage times only, and later runs add hook ownership. Count values are also logged from baseline run eight onward. Command elapsed time includes startup, teardown and Vite's ten-second server-close delay.

The existing command-discovery wait remains 15 seconds, the result wait remains 150 seconds and the test limit remains 240 seconds. No retry, timeout increase or assertion relaxation was added. The old count formats, better markers and weak name checks are retained, with a new numeric greater-than check.

The ordinary baseline and replacement use the same test-name filter with `npx vitest run --config vitest.e2e.config.ts --retry=0`, selecting their respective e2e files. The scratch fixture probe also uses that configuration and fails at command discovery within the unchanged wait. A separate tab-selection probe passed and did not reproduce a stale active hook.

An initial replacement also clicked New scene to prepare the fixture. All ten runs passed, but the median interval from the first robot ready to the weak robot ready was 7,569 ms. The final test retains the existing tab hook for fixture preparation and keeps visible Rover selection and the comparison command as its entry path.

## Repeated results

Times are milliseconds. Startup runs from `openApp` to studio readiness. Comparison runs from the test body start to immediately before the final browser-error assertion. Process time includes Vitest and server teardown.

### Original fixture

Passed 10 of 10 runs.

| Run | Result | Startup | Comparison | Process |
| --- | --- | ---: | ---: | ---: |
| 1 | passed | 7,291 | 13,811 | 38,101 |
| 2 | passed | 6,692 | 14,075 | 35,802 |
| 3 | passed | 7,556 | 14,059 | 36,765 |
| 4 | passed | 6,981 | 13,562 | 35,385 |
| 5 | passed | 6,830 | 14,173 | 36,096 |
| 6 | passed | 7,165 | 16,243 | 39,085 |
| 7 | passed | 7,555 | 14,140 | 37,007 |
| 8 | passed | 6,582 | 17,777 | 39,718 |
| 9 | passed | 8,842 | 14,455 | 39,179 |
| 10 | passed | 6,927 | 18,855 | 41,694 |

Median comparison time: 14,156 ms. Total process time: 378,832 ms.

### Complete projects addressed by tab id

Passed 10 of 10 runs.

| Run | Result | Startup | Comparison | Process |
| --- | --- | ---: | ---: | ---: |
| 1 | passed | 6,344 | 14,812 | 36,325 |
| 2 | passed | 8,758 | 14,947 | 40,228 |
| 3 | passed | 7,845 | 15,401 | 38,408 |
| 4 | passed | 6,906 | 13,723 | 36,034 |
| 5 | passed | 7,101 | 13,583 | 36,007 |
| 6 | passed | 7,374 | 14,522 | 37,318 |
| 7 | passed | 7,507 | 13,775 | 36,333 |
| 8 | passed | 5,682 | 13,401 | 34,365 |
| 9 | passed | 7,033 | 15,311 | 37,723 |
| 10 | passed | 7,722 | 16,198 | 40,364 |

Median comparison time: 14,667 ms. Total process time: 373,105 ms.

All ten replacement runs log Rover at 20 of 20 and Weak rover at 0 of 20. The three baseline runs with count logging show the same values. Every run retains the original format, marker, name and browser-error assertions. The Linux-only quarantine entry for #996 is removed.

## Case comparison

The simulation walkthrough was replaced after taking 33 s in run 43715791435 (#1086). The measurements above retain its earlier fixture investigation.
