# Imported-try playback checks

## Failure and correction

[Issue #993](https://github.com/JamelHammoud/basecase/issues/993) tracks imported playback failures in [Check run 43687018679](https://github.com/JamelHammoud/basecase/actions/runs/43687018679). The two affected tests shared one app from `beforeAll`, so a failed attempt left imported tries and errors for another attempt.

Opening an imported try loads the simulation and displays its Scene camera. `useCameraFeed` calls `ensureVisionCamera`, which loads the default `rfdetr-nano` detector. These tests pass every `hub-` route to the real bridge, configured against a fake Hub that contains only `tester/arm_pick`. The model is absent from that Hub.

The Linux trace recorded `hub-model-file` requesting `PierreMarieCurie/rf-detr-onnx`, revision `94f91976449c187be38e649863e3dadecc312437`, file `rf-detr-nano.onnx`. The fake Hub received the matching resolve request and returned HTTP 404 for the missing entry. The bridge answered HTTP 500 with `Hugging Face refused the request: Entry not found.` Chrome recorded that response in `app.errors`. This reproduces the first failure without a retry or leaked imports. The old FlatBuffers test also requested the detector, but its stub returned an empty object instead of a model URL.

Each attempt now opens and closes its own app and temporary Library. Before loading the robot, it loads the existing tiny ONNX fixture under the default detector id through `configureVision`, with no camera assignments. Playback then uses its ordinary Scene camera and detector setup without requesting a model file. The fake Hub and real dataset routes remain in use.

Assertions retain the two ZIP episodes, Match Joints, MCAP deduplication, Hub import, exact source counts, three timeline lanes, both nested FlatBuffers seek values, the unsigned 64-bit value, state spans, log warning and all 151 samples on each IMU axis. The all-topic MCAP test also requires exactly one try tile. All three tests require zero model-file requests and zero app errors. No timeout or retry setting changes.

The two Linux quarantine entries for #993 are removed from `tools/quarantine.json`, so the affected tests run in normal CI. Their existing Windows condition and the separate Windows FlatBuffers quarantine for #995 remain.

## Linux measurements

Both batches use the same built bundles from `2f17c07c6`, Node 26.13.0, Vitest 5.0.5 and headless Google Chrome in `node:26.13.0-bookworm`, on `linux/amd64` through Docker on an arm64 host. The same container has a three-CPU quota (`cpu.max` is `300000 100000`) and one background Node process continuously evaluating `Math.sqrt(Math.random())`. Other jobs share the host. The quota and background workload match, but host scheduling is not isolated.

Each run starts a fresh Vitest process for the complete three-test `e2e/dataImport.e2e.test.ts` file, with `BASECASE_QUARANTINE=off` and `--retry 0`. The command uses `--config vitest.e2e.config.ts --reporter=verbose --reporter=json`. No full suite runs. Both batches reuse the same app bundles because only the test changes. Setup probes are excluded.

The first baseline tracing run also reported a probe callback completing after its page closed. Its affected test assertions had already failed on model errors. The callback catches page closure in later runs. Pass counts below come from individual assertion results.

| Test | Before passes | After passes |
| --- | ---: | ---: |
| ZIP, Match Joints and Hub playback | 0/10 | 10/10 |
| All-topic MCAP, log and IMU | 0/10 | 10/10 |
| Nested FlatBuffers playback | 9/10 | 10/10 |

The complete file passed 0 of 10 runs before and 10 of 10 after. Total command elapsed time was 940.125 seconds before and 1331.028 seconds after.

Durations below are milliseconds from Vitest. Command elapsed time includes startup, tests and teardown.

| Run | ZIP before | ZIP after | MCAP before | MCAP after | FlatBuffers before | FlatBuffers after | Command before (s) | Command after (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 37592 | 39829 | 8731 | 31584 | 47046 | 35583 | 117.338 | 121.446 |
| 2 | 33303 | 45408 | 7985 | 32143 | 36252 | 41320 | 101.386 | 133.281 |
| 3 | 32025 | 49555 | 7815 | 46443 | 41862 | 33306 | 105.776 | 144.805 |
| 4 | 33694 | 47560 | 6095 | 35737 | 34947 | 36748 | 96.549 | 134.487 |
| 5 | 32915 | 39240 | 5025 | 28763 | 31297 | 32926 | 92.150 | 114.921 |
| 6 | 27371 | 39532 | 4335 | 34916 | 28244 | 40074 | 81.394 | 129.200 |
| 7 | 25809 | 45751 | 6200 | 32395 | 27094 | 37306 | 79.347 | 131.406 |
| 8 | 26225 | 45496 | 4658 | 40713 | 28084 | 42843 | 79.050 | 144.084 |
| 9 | 32573 | 49093 | 6382 | 37639 | 42593 | 39712 | 103.669 | 142.231 |
| 10 | 27384 | 44650 | 3761 | 37130 | 32184 | 38015 | 83.466 | 135.167 |

## Startup stages

The scratch harness times Chrome launch, page creation, Library and route setup, `page.goto`, and waiting for `__studio`, in that order. All values are milliseconds. Detector fixture loading occurs after studio readiness and is included in command elapsed time. The detector column times that load, with a dash for the baseline which has no fixture. The baseline opens one shared app and a separate FlatBuffers app. The corrected test opens one app for each test.

| Batch | Run | App | Chrome | Page | Routes | Navigation | Studio | Detector |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 1 | shared | 1054 | 1326 | 408 | 2748 | 1815 | - |
| baseline | 1 | FlatBuffers | 4393 | 2509 | 166 | 5117 | 3294 | - |
| baseline | 2 | shared | 1561 | 1423 | 344 | 2181 | 2088 | - |
| baseline | 2 | FlatBuffers | 3710 | 1912 | 484 | 3020 | 1997 | - |
| baseline | 3 | shared | 1193 | 1416 | 24 | 2882 | 2310 | - |
| baseline | 3 | FlatBuffers | 2954 | 1785 | 25 | 3605 | 2499 | - |
| baseline | 4 | shared | 1306 | 1329 | 90 | 2282 | 1100 | - |
| baseline | 4 | FlatBuffers | 2724 | 1876 | 528 | 2824 | 2267 | - |
| baseline | 5 | shared | 1362 | 1463 | 437 | 2256 | 1266 | - |
| baseline | 5 | FlatBuffers | 1996 | 1494 | 301 | 2222 | 1186 | - |
| baseline | 6 | shared | 1049 | 1230 | 393 | 2049 | 1340 | - |
| baseline | 6 | FlatBuffers | 1974 | 1594 | 395 | 1978 | 1133 | - |
| baseline | 7 | shared | 911 | 1211 | 319 | 1947 | 1595 | - |
| baseline | 7 | FlatBuffers | 1707 | 1498 | 27 | 1956 | 1398 | - |
| baseline | 8 | shared | 876 | 1189 | 397 | 1779 | 1332 | - |
| baseline | 8 | FlatBuffers | 1711 | 1890 | 299 | 2130 | 1265 | - |
| baseline | 9 | shared | 970 | 1641 | 137 | 2102 | 1684 | - |
| baseline | 9 | FlatBuffers | 2736 | 1601 | 21 | 3388 | 2385 | - |
| baseline | 10 | shared | 886 | 1183 | 398 | 1848 | 1019 | - |
| baseline | 10 | FlatBuffers | 1397 | 1350 | 310 | 2730 | 1294 | - |
| after | 1 | ZIP | 901 | 1257 | 443 | 2030 | 1508 | 8917 |
| after | 1 | MCAP | 910 | 1211 | 364 | 1845 | 1084 | 7627 |
| after | 1 | FlatBuffers | 922 | 1142 | 416 | 1937 | 1343 | 8776 |
| after | 2 | ZIP | 956 | 1273 | 430 | 2256 | 1654 | 8783 |
| after | 2 | MCAP | 887 | 1174 | 277 | 1970 | 1431 | 7528 |
| after | 2 | FlatBuffers | 1203 | 1630 | 451 | 2568 | 1655 | 8296 |
| after | 3 | ZIP | 1115 | 1288 | 316 | 2290 | 1390 | 8804 |
| after | 3 | MCAP | 1316 | 1577 | 475 | 2003 | 1490 | 14099 |
| after | 3 | FlatBuffers | 1004 | 1131 | 282 | 1980 | 1220 | 8583 |
| after | 4 | ZIP | 911 | 1116 | 365 | 1720 | 926 | 9660 |
| after | 4 | MCAP | 918 | 1502 | 394 | 2358 | 1745 | 9096 |
| after | 4 | FlatBuffers | 876 | 1141 | 331 | 1827 | 1055 | 9065 |
| after | 5 | ZIP | 820 | 1143 | 302 | 1901 | 1376 | 7237 |
| after | 5 | MCAP | 786 | 1066 | 369 | 1744 | 914 | 8246 |
| after | 5 | FlatBuffers | 766 | 1110 | 322 | 1666 | 950 | 7931 |
| after | 6 | ZIP | 924 | 1168 | 318 | 2071 | 1609 | 7870 |
| after | 6 | MCAP | 845 | 1221 | 452 | 1794 | 942 | 8917 |
| after | 6 | FlatBuffers | 1146 | 1202 | 422 | 1965 | 1168 | 8209 |
| after | 7 | ZIP | 1284 | 1542 | 565 | 2359 | 1432 | 7323 |
| after | 7 | MCAP | 898 | 1154 | 417 | 1828 | 1258 | 7799 |
| after | 7 | FlatBuffers | 988 | 1386 | 321 | 1881 | 1569 | 7203 |
| after | 8 | ZIP | 985 | 1255 | 417 | 2104 | 1605 | 8984 |
| after | 8 | MCAP | 1349 | 1996 | 594 | 2935 | 1766 | 8696 |
| after | 8 | FlatBuffers | 1062 | 1561 | 448 | 2514 | 1257 | 8895 |
| after | 9 | ZIP | 1111 | 1451 | 48 | 2558 | 1823 | 9419 |
| after | 9 | MCAP | 1330 | 1315 | 415 | 2761 | 2096 | 10128 |
| after | 9 | FlatBuffers | 1093 | 1286 | 424 | 2085 | 1394 | 9503 |
| after | 10 | ZIP | 1010 | 1278 | 22 | 2369 | 1937 | 7952 |
| after | 10 | MCAP | 1016 | 1525 | 16 | 2741 | 1436 | 9209 |
| after | 10 | FlatBuffers | 966 | 1339 | 517 | 2024 | 1147 | 9301 |

Fresh app startup and detector fixture loading are the measured cost of isolating attempts while retaining camera playback. These measurements establish pass counts and observed elapsed times under this workload. They do not establish a whole-suite speed change.
