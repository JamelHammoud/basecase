# Skills test evidence

Current coverage: [owning guide](../guide/skills.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Pose animation training

The Sit training and Try walkthrough in `e2e/skills.e2e.test.ts` was removed under [#1141](https://github.com/JamelHammoud/basecase/issues/1141) after taking 39 s in run 43739315274. It supplied a clock policy but still ran the move solver and Arena before checking playback.

The retained tests do not cover the complete Sit Train-to-Try sequence.

## Skill coaching

The coaching browser test in `e2e/skills.e2e.test.ts` previously ran three training and Arena cycles and took 44 s in run 43642970706 (#860).

## Training snapshots

The combined Stand snapshot sequence in `e2e/skills.e2e.test.ts` took 37.091 s on Windows and 30.138 s on Linux in run 43715791435 ([#1081](https://github.com/JamelHammoud/basecase/issues/1081)).

## Passive robot joints

The existing action and observation contracts remain intact. The environment index retains all physical joint identities and a separate actuator set. Validation uses the actuator set only for actions. Jobs retain initialJoints for every physical coordinate, while defaultPose and joints describe controlled outputs and ctrlDefault follows actuator order. Empty action sets are refused. Existing subset admission and native fallback own accelerated backend support. No GPU parity or training-quality claim follows from the mapping tests.

`passiveChannels.test.ts` also checks interleaved and reordered actuator metadata, Motor Kit defaults, passive observations versus actions and live gait output. Legacy powered output is covered by the existing drive suites.
