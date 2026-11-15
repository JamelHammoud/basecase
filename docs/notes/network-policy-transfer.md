# Network policy transfer tests

## Failure

[Issue #990](https://github.com/JamelHammoud/basecase/issues/990) tracked a missing null `policy.onnx` command in `electron/robot/networkRobotLink.test.mjs`. [Check run 43687018679](https://github.com/JamelHammoud/basecase/actions/runs/43687018679/job/132729516720) failed the final removal assertion after 2,292 ms.

The fake robot originally sent status only after authentication. Replying to heartbeats alone still left a failure: Vitest's deep comparison of a 300,000-byte buffer blocked the thread serving the fake robot. The socket worker continued running and expired its one-second authenticated response deadline before the comparison returned and policy removal was queued.

A traced Linux run with heartbeat replies showed this sequence. Times are relative to the start of the byte assertion:

| Time (ms) | Event |
| --- | --- |
| -45 | Worker writes the policy's 400,000-character base64 payload |
| 0 | Test starts the deep buffer comparison |
| 988 | Worker's response deadline fires |
| 1,009 | Worker's socket closes |
| 1,578 | Deep comparison returns |
| 1,580 | Test posts the removal transfer with the policy file absent |

The peer's heartbeat replies were queued behind the comparison. This explains why a direct transfer probe could succeed while the test failed with the same peer.

## Correction

The fake peer sends authenticated status in response to heartbeats and intents, with its current mode. A TCP test sends each command explicitly and reads its next response, with no automatic pacer. It fails against the original peer.

The transfer test compares the full decoded policy with `Buffer.equals`. This checks both length and every byte without traversing 300,000 object properties. It also checks the transferred calibration's changed and preserved mounts and retains the explicit null removal assertion. The one-second transport deadline and Vitest wait budgets are unchanged. `networkSocket.test.mjs` continues to check that a silent peer closes even while outgoing heartbeats continue.

The checkout used for these measurements already had no #990 entry in `tools/quarantine.json`. The test runs on Linux without a quarantine or platform condition.

## Linux measurements

Both batches ran the complete 15-test `networkRobotLink.test.mjs` file in `node:26.13.0-bookworm`, using Vitest 5.0.5 on `linux/amd64` through Docker's x86-64 emulation. The container had a three-CPU quota and `BASECASE_QUARANTINE=off`. Two background Node worker threads continuously ran `Math.sqrt(Math.random())` in both batches. Each run launched `node node_modules/vitest/vitest.mjs run electron/robot/networkRobotLink.test.mjs --maxWorkers=3 --reporter=json` in a fresh process. No full suite ran.

The original test passed 9 of 10 runs. The corrected test passed all 10 runs. Every other test in the file passed in both batches. Each row reports the transfer test duration and the complete command wall time.

| Run | Before | Transfer before (ms) | After | Transfer after (ms) | Command before (ms) | Command after (ms) |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| 1 | passed | 965.9 | passed | 294.7 | 5637 | 15933 |
| 2 | passed | 889.9 | passed | 335.9 | 5304 | 10583 |
| 3 | passed | 863.7 | passed | 537.2 | 5142 | 11315 |
| 4 | passed | 1047.9 | passed | 328.3 | 5921 | 9642 |
| 5 | failed | 2150.3 | passed | 520.3 | 7763 | 9358 |
| 6 | passed | 881.8 | passed | 309.5 | 5289 | 6439 |
| 7 | passed | 865.3 | passed | 292.2 | 5132 | 6688 |
| 8 | passed | 906.0 | passed | 244.6 | 5305 | 6115 |
| 9 | passed | 1071.5 | passed | 261.9 | 5776 | 5865 |
| 10 | passed | 1050.3 | passed | 239.4 | 6182 | 6469 |

Median transfer duration was 935.9 ms before and 302.1 ms after. Total command wall time was 57.451 seconds before and 88.407 seconds after. Container settings and background workers were identical, but host scheduling was not isolated. These results establish the pass counts and transfer durations, not an improvement in whole-process startup time.
