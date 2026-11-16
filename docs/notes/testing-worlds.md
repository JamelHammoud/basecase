# Worlds testing evidence

Coverage: [cases](../guide/cases.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Scan maps

The combined browser story took 32 s in run 43642970706 (#866).

## Captured worlds

The Windows corridor-world walkthrough is quarantined through 28 November 2026 under [#995](https://github.com/JamelHammoud/basecase/issues/995). Run 43693830979 failed both attempts at different import or playback stages. Its failing worker stage is not established. Restoring it requires Windows traces and at least ten runs before and after at the same load. The kitchen import setup in `e2e/worldImport.e2e.test.ts` was simplified under [#1142](https://github.com/JamelHammoud/basecase/issues/1142) after taking 37 s in run 43739315274. The duplicate kitchen recording and export test was removed under [#1145](https://github.com/JamelHammoud/basecase/issues/1145) after passing in 75.124 s in run 43739315274. Its Windows quarantine was removed with it. `datasets/worldRender.test.ts` remains quarantined on all platforms through 28 November 2026 under [#985](https://github.com/JamelHammoud/basecase/issues/985) after render-worker setup timed out.
