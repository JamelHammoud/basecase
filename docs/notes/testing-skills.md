# Skills test evidence

Current coverage: [owning guide](../guide/skills.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Pose animation training

The Sit training and Try walkthrough in `e2e/skills.e2e.test.ts` was removed under [#1141](https://github.com/JamelHammoud/basecase/issues/1141) after taking 39 s in run 43739315274. It supplied a clock policy but still ran the move solver and Arena before checking playback.

## Skill coaching

The coaching browser test in `e2e/skills.e2e.test.ts` previously ran three training and Arena cycles and took 44 s in run 43642970706 (#860).

## Training snapshots

The combined Stand snapshot sequence in `e2e/skills.e2e.test.ts` took 37.091 s on Windows and 30.138 s on Linux in run 43715791435 ([#1081](https://github.com/JamelHammoud/basecase/issues/1081)).
