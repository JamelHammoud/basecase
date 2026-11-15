# Motion picker command

## Failure and correction

[Issue #994](https://github.com/JamelHammoud/basecase/issues/994) tracks the file chooser timeout in [run 43687018679](https://github.com/JamelHammoud/basecase/actions/runs/43687018679). The Linux command test failed both attempts, while its three file-drop and scene-tab tests passed. The Windows job passed all four tests, including the picker test in 3,692 ms.

The command dispatch itself succeeded in the Linux reproduction. The complete query reached Search commands, Enter reached that field, and the command clicked a connected file input. A failing traced run also checked that the input was enabled, outside any inert ancestor and clicked with active user activation.

Playwright starts enabling file-dialog interception asynchronously when `waitForEvent('filechooser')` registers its listener. The original test registered it immediately before pressing Enter. Protocol logging captured the following order in a failing run:

| UTC time | Event |
| --- | --- |
| 07:51:40.085 | Send `Page.setInterceptFileChooserDialog` with `enabled: true` |
| 07:51:40.085 | Send Enter key-down |
| 07:51:40.104 | Send Enter key-up |
| 07:51:40.105 | Receive interception acknowledgment |
| 07:52:10.103 | Disable interception after the existing 30-second event deadline |

The activated file-input click occurred during Enter handling, and no `Page.fileChooserOpened` event arrived. In passing runs, interception acknowledgment preceded key-up and a chooser event followed.

The test now registers its chooser listener before opening the palette. Opening the palette and typing the query precede Enter, so interception setup no longer starts alongside picker activation. The command, hidden input, typed query, Enter key, selected malformed file, refusal checks and scene assertions are unchanged. No deadline, retry or quarantine was added. This checkout already had no matching entry in `tools/quarantine.json`.

## Measurement setup

Measurements use the production app and web bundles from commit `6b59ff2bb`, Google Chrome 157.0.8103.78 and Node 26.13.0 in `node:26.13.0-bookworm` on Linux x86-64 through Docker emulation. The isolated container has a three-CPU quota and two continuously busy Node worker threads. Both batches use the same container, bundles, quota and background workers. Host scheduling is shared with other work.

Each run starts a fresh Vitest process and Chrome browser, using the existing e2e harness and only the picker test. Retries are disabled, quarantine is off and the event deadline stays at 30 seconds. Scratch instrumentation records browser launch, page creation, navigation completion, studio readiness, key targets, input activation and Chrome protocol events. The test continues through malformed BVH refusal on every successful picker run.

Elapsed command time includes Vitest startup and teardown. Vite reports a ten-second server-close delay in these isolated runs. These measurements establish picker reliability, without claiming an application startup speed improvement.

## Results

Browser, page, navigation and studio columns are individual stage durations. Their sum is total startup time from `openApp`. Test time begins after studio readiness. Command time includes the full process.

The exploratory batch added diagnostic detail as it progressed. The fully traced baseline and corrected batch use identical instrumentation.

All three failures in the fully traced baseline acknowledged interception after Enter key-up and emitted no chooser event. Every corrected run acknowledged interception before Enter and emitted a chooser event.

### Exploratory baseline

Passed 8 of 10 runs. Total command elapsed time was 360.098 seconds.

| Run | Result | Browser (ms) | Page (ms) | Navigation (ms) | Studio (ms) | Test (ms) | Command (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | failed | 2768 | 1494 | 3015 | 2387 | 33048.3 | 59078 |
| 2 | passed | 2033 | 1805 | 3884 | 2994 | 6302.9 | 32307 |
| 3 | passed | 1471 | 2377 | 3408 | 1883 | 8214.8 | 34050 |
| 4 | passed | 1905 | 2113 | 3608 | 1975 | 6338.0 | 31677 |
| 5 | passed | 1263 | 1489 | 2944 | 1256 | 5613.2 | 26842 |
| 6 | failed | 1458 | 2062 | 3154 | 2910 | 34210.3 | 59142 |
| 7 | passed | 1480 | 1634 | 3369 | 2802 | 5121.2 | 29891 |
| 8 | passed | 1277 | 2092 | 2618 | 2480 | 5835.4 | 28788 |
| 9 | passed | 1323 | 1595 | 3304 | 2963 | 6314.3 | 30670 |
| 10 | passed | 1257 | 1894 | 2641 | 2077 | 5207.1 | 27653 |

### Baseline with full protocol tracing

Passed 7 of 10 runs. Total command elapsed time was 360.891 seconds.

| Run | Result | Browser (ms) | Page (ms) | Navigation (ms) | Studio (ms) | Test (ms) | Command (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | passed | 1528 | 1422 | 3087 | 1921 | 4795.1 | 26371 |
| 2 | passed | 1236 | 1432 | 2831 | 1647 | 5899.1 | 26848 |
| 3 | passed | 999 | 1398 | 2887 | 1703 | 5621.4 | 26517 |
| 4 | failed | 1172 | 1435 | 3018 | 1977 | 32732.6 | 54178 |
| 5 | passed | 1087 | 1414 | 2804 | 1293 | 6781.8 | 27436 |
| 6 | failed | 1291 | 2137 | 2827 | 2742 | 32446.3 | 55860 |
| 7 | passed | 1873 | 1808 | 3322 | 2350 | 6216.8 | 30659 |
| 8 | passed | 1484 | 1864 | 3216 | 2088 | 6263.1 | 30402 |
| 9 | failed | 1147 | 1840 | 2728 | 1985 | 32644.7 | 54127 |
| 10 | passed | 1277 | 1587 | 3218 | 2170 | 4895.4 | 28493 |

### Listener registered before command entry

Passed 10 of 10 runs. Total command elapsed time was 274.632 seconds.

| Run | Result | Browser (ms) | Page (ms) | Navigation (ms) | Studio (ms) | Test (ms) | Command (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | passed | 1184 | 1486 | 3018 | 1272 | 5890.0 | 26967 |
| 2 | passed | 1079 | 1374 | 2769 | 2006 | 4817.1 | 25699 |
| 3 | passed | 1099 | 1757 | 2496 | 2022 | 5291.5 | 26708 |
| 4 | passed | 1214 | 1802 | 2673 | 1922 | 5194.9 | 26782 |
| 5 | passed | 1096 | 1993 | 2590 | 2020 | 5496.5 | 27223 |
| 6 | passed | 1156 | 1530 | 2880 | 2104 | 5008.2 | 26983 |
| 7 | passed | 1377 | 1883 | 2632 | 1269 | 6916.3 | 28542 |
| 8 | passed | 1268 | 1705 | 2968 | 2088 | 5998.8 | 28343 |
| 9 | passed | 1213 | 1485 | 3169 | 2318 | 5495.4 | 28204 |
| 10 | passed | 1226 | 1581 | 3232 | 2302 | 6270.1 | 29181 |
