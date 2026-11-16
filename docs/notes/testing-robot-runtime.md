# Robot runtime test evidence

Current coverage: [owning guide](../guide/robot-runtime.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Servo calibration

`e2e/operateCalibration.e2e.test.ts` leaves fitting and replay accuracy to the pipeline tests in the guide, avoiding the 86 s live calibration story from run 43642970706 (#855).

## Mixed-servo calibration

The mixed-arm browser test was replaced after taking 49 s in run 43642970706 (#856).

## Operate tries

The duplicate two-session walkthrough in `e2e/operateTries.e2e.test.ts` was removed under [#1146](https://github.com/JamelHammoud/basecase/issues/1146) after taking 30 s in run 43739315274. It included eight seconds of fixed driving waits and repeated the stall replay.

## Servo zero and direction

The zero-and-direction browser test was narrowed after taking 41 s in run 43642970706 (#857).

## Windows network pairing

This walkthrough is quarantined only on Windows through 28 November 2026 after run 43698588307. Its cause is not established. It remains active on Linux, where it passed at the same commit. Network pairing and client loss ([#1024](https://github.com/JamelHammoud/basecase/issues/1024)) measured 187235 µs against the unchanged 150000 µs stop limit, then failed to reach Look on retry. Run 43696182210 repeated both failures with a 244140 µs interval. Its `beforeAll` fixture shares the daemon, credentials and fleet across retries. Restoring it requires Windows traces and at least ten runs before and after at the same load before removing the entry.

## Windows body fitting

This walkthrough is quarantined only on Windows through 28 November 2026 after run 43698588307. Its cause is not established. It remains active on Linux, where it passed at the same commit. Fit Body ([#1025](https://github.com/JamelHammoud/basecase/issues/1025)) first failed to activate a fit, then read an unchanged Checks fingerprint on retry. The preceding Windows run passed. Restoring it requires Windows traces and at least ten runs before and after at the same load before removing the entry.
